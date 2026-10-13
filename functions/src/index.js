import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { getMessaging } from 'firebase-admin/messaging';
import { setGlobalOptions } from 'firebase-functions/v2';
import bcrypt from 'bcryptjs';
import dayjs from 'dayjs';

initializeApp();
setGlobalOptions({ region: 'asia-southeast1', maxInstances: 10 });

const db = getFirestore();
const auth = getAuth();

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

// Helper: rate limit check
async function checkRateLimit(key) {
  const ref = db.doc(`rateLimits/${key}`);
  const snap = await ref.get();
  const now = Date.now();
  if (!snap.exists) {
    await ref.set({ count: 1, firstAttempt: now, lastAttempt: now });
    return;
  }
  const data = snap.data();
  if (now - data.firstAttempt > RATE_LIMIT_WINDOW_MS) {
    await ref.set({ count: 1, firstAttempt: now, lastAttempt: now });
    return;
  }
  if (data.count >= MAX_ATTEMPTS) {
    throw new HttpsError('resource-exhausted', 'Too many attempts, try later');
  }
  await ref.update({ count: FieldValue.increment(1), lastAttempt: now });
}

async function isSuperAdmin(uid) {
  if (!uid) return false;
  const snap = await db.doc(`users/${uid}`).get();
  return snap.exists && snap.data().role === 'super_admin';
}

async function isTripAdmin(tripId, uid) {
  if (!tripId || !uid) return false;
  if (await isSuperAdmin(uid)) return true;
  const tripSnap = await db.doc(`trips/${tripId}`).get();
  if (tripSnap.exists && tripSnap.data().createdBy === uid) return true;
  const snap = await db.doc(`trips/${tripId}/members/${uid}`).get();
  if (!snap.exists) return false;
  const role = snap.data().role;
  return ['trip_admin', 'super_admin'].includes(role);
}

async function isTripMember(tripId, uid) {
  if (!tripId || !uid) return false;
  if (await isTripAdmin(tripId, uid)) return true;
  const snap = await db.doc(`trips/${tripId}/members/${uid}`).get();
  if (snap.exists && snap.data().status !== 'inactive') return true;
  const tripSnap = await db.doc(`trips/${tripId}`).get();
  if (!tripSnap.exists) return false;
  const data = tripSnap.data();
  return data.createdBy === uid || (Array.isArray(data.memberUids) && data.memberUids.includes(uid));
}

const ALLOWED_MEMBER_ROLES = ['member', 'trip_admin', 'viewer'];

function normalizeUsername(u) {
  return String(u).trim().toLowerCase();
}

/**
 * Keep the public username → trip/member registry in sync. The app writes it
 * itself when it creates a member locally (no Cloud Functions); the functions
 * mirror it so a member created on one device can sign in from another even if
 * the functions are later unavailable.
 */
function publicLoginRef(username) {
  return db.doc(`publicMemberLogins/${normalizeUsername(username)}`);
}

async function publishPublicLogin({ username, tripId, memberUid, displayName }) {
  if (!username || !tripId || !memberUid) return;
  try {
    await publicLoginRef(username).set({
      username: normalizeUsername(username),
      tripId,
      memberId: memberUid,
      displayName: displayName || null,
      updatedAt: FieldValue.serverTimestamp(),
      disabled: false
    }, { merge: true });
  } catch (e) {
    console.warn('publishPublicLogin failed', e.message);
  }
}

/** Diagnostics endpoint used by Settings > ตรวจสอบระบบ. */
export const healthCheck = onCall(async (request) => {
  const started = Date.now();
  let firestore = 'ok';
  try {
    if (request.auth?.uid) {
      await db.doc('systemHealth/ping').set({ lastCheck: FieldValue.serverTimestamp(), uid: request.auth.uid }, { merge: true });
    } else {
      await db.doc('systemHealth/ping').get();
    }
  } catch (e) {
    firestore = `error: ${e.message}`;
  }
  return {
    ok: firestore === 'ok',
    region: 'asia-southeast1',
    projectId: process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT || null,
    node: process.version,
    auth: request.auth ? 'signed-in' : 'anonymous',
    firestore,
    ms: Date.now() - started,
    time: new Date().toISOString(),
    version: 'v5'
  };
});

// Create member account with username + PIN
export const createMemberAccount = onCall(async (request) => {
  const { tripId, username, pin, displayName, role = 'member', permissions = {} } = request.data;
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Auth required');
  if (!tripId || !username || !pin) throw new HttpsError('invalid-argument', 'Missing fields');

  const isAdmin = await isTripAdmin(tripId, callerUid);
  if (!isAdmin) throw new HttpsError('permission-denied', 'Admin only');

  const safeRole = ALLOWED_MEMBER_ROLES.includes(role) ? role : 'member';

  if (pin.length < 4 || pin.length > 12) throw new HttpsError('invalid-argument', 'PIN must be 4-12 chars');

  const norm = normalizeUsername(username);
  const loginRef = db.doc(`loginAccounts/${norm}`);
  const existing = await loginRef.get();
  if (existing.exists) throw new HttpsError('already-exists', 'Username taken');

  const pinHash = await bcrypt.hash(pin, 10);
  // Create Firebase Auth user with custom UID? We'll use random UID for member
  // Instead we create a placeholder auth user via custom token flow: create a user doc first
  // Create Firebase user for member (email placeholder)
  let memberUid;
  try {
    const userRecord = await auth.createUser({
      displayName,
      disabled: false
    });
    memberUid = userRecord.uid;
  } catch (e) {
    // Never swallow the reason: the app shows this message to the admin.
    console.error('createMemberAccount: createUser failed', e);
    const detail = String(e.message || e.code || 'unknown');
    const code = /already.?exists/i.test(detail) ? 'already-exists'
      : /quota|billing|permission|forbidden|unauthor/i.test(detail) ? 'permission-denied'
      : 'internal';
    throw new HttpsError(code, `สร้างบัญชี Firebase Auth ไม่สำเร็จ: ${detail}`);
  }

  const batch = db.batch();
  batch.set(loginRef, {
    username: norm,
    originalUsername: username,
    pinHash,
    tripId,
    memberUid,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: callerUid,
    failedAttempts: 0
  });
  const memberRef = db.doc(`trips/${tripId}/members/${memberUid}`);
  batch.set(memberRef, {
    uid: memberUid,
    displayName: displayName || username,
    username: norm,
    role: safeRole,
    status: 'active',
    color: '#6366f1',
    permissions,
    createdAt: FieldValue.serverTimestamp()
  });
  // Update trip memberUids array
  const tripRef = db.doc(`trips/${tripId}`);
  batch.update(tripRef, { memberUids: FieldValue.arrayUnion(memberUid) });

  await batch.commit();

  await publishPublicLogin({ username: norm, tripId, memberUid, displayName });

  await db.collection(`trips/${tripId}/activityLogs`).add({
    action: 'create_member',
    target: memberUid,
    by: callerUid,
    timestamp: FieldValue.serverTimestamp(),
    details: { username: norm, role: safeRole }
  });

  return { memberUid };
});

export const loginWithUsernamePin = onCall(async (request) => {
  const { username, pin, tripId } = request.data;
  if (!username || !pin) throw new HttpsError('invalid-argument', 'Missing username/pin');
  const norm = normalizeUsername(username);
  await checkRateLimit(`login_${norm}`);

  const loginRef = db.doc(`loginAccounts/${norm}`);
  const snap = await loginRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'User not found');
  const data = snap.data();
  if (tripId && data.tripId !== tripId) throw new HttpsError('permission-denied', 'Trip mismatch');
  if (data.disabled) throw new HttpsError('permission-denied', 'Account disabled');

  const match = await bcrypt.compare(pin, data.pinHash);
  if (!match) {
    await loginRef.update({ failedAttempts: FieldValue.increment(1), lastFailed: FieldValue.serverTimestamp() });
    throw new HttpsError('unauthenticated', 'Invalid PIN');
  }

  // Reset failed attempts
  await loginRef.update({ failedAttempts: 0 });

  // Check member active
  const memberSnap = await db.doc(`trips/${data.tripId}/members/${data.memberUid}`).get();
  if (!memberSnap.exists || memberSnap.data().status !== 'active') throw new HttpsError('permission-denied', 'Member inactive');

  const token = await auth.createCustomToken(data.memberUid, { tripId: data.tripId, role: memberSnap.data().role });
  return { token, tripId: data.tripId, memberId: data.memberUid };
});

export const resetMemberPin = onCall(async (request) => {
  const { username, newPin } = request.data;
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Auth required');
  const norm = normalizeUsername(username);
  const loginRef = db.doc(`loginAccounts/${norm}`);
  const snap = await loginRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'User not found');
  const data = snap.data();
  const isAdmin = await isTripAdmin(data.tripId, callerUid);
  if (!isAdmin) throw new HttpsError('permission-denied', 'Admin only');
  if (!newPin || newPin.length < 4) throw new HttpsError('invalid-argument', 'Invalid PIN');
  const hash = await bcrypt.hash(newPin, 10);
  await loginRef.update({ pinHash: hash, updatedBy: callerUid, updatedAt: FieldValue.serverTimestamp() });
  await publishPublicLogin({ username: norm, tripId: data.tripId, memberUid: data.memberUid });
  await db.doc(`trips/${data.tripId}/members/${data.memberUid}`).set({ loginReady: true, username: norm }, { merge: true });
  await db.collection(`trips/${data.tripId}/activityLogs`).add({
    action: 'reset_pin',
    target: data.memberUid,
    by: callerUid,
    timestamp: FieldValue.serverTimestamp()
  });
  return { success: true };
});

export const disableMemberAccount = onCall(async (request) => {
  const { username } = request.data;
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Auth required');
  const norm = normalizeUsername(username);
  const loginRef = db.doc(`loginAccounts/${norm}`);
  const snap = await loginRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'User not found');
  const data = snap.data();
  if (!await isTripAdmin(data.tripId, callerUid)) throw new HttpsError('permission-denied', 'Admin only');
  await loginRef.update({ disabled: true });
  await publicLoginRef(norm).set({ disabled: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await db.doc(`trips/${data.tripId}/members/${data.memberUid}`).update({ status: 'inactive', loginReady: false });
  await auth.updateUser(data.memberUid, { disabled: true });
  return { success: true };
});

export const revokeMemberSessions = onCall(async (request) => {
  const { memberUid, tripId } = request.data;
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Auth required');
  if (!await isTripAdmin(tripId, callerUid)) throw new HttpsError('permission-denied', 'Admin only');
  await auth.revokeRefreshTokens(memberUid);
  await db.collection(`trips/${tripId}/activityLogs`).add({
    action: 'revoke_session',
    target: memberUid,
    by: callerUid,
    timestamp: FieldValue.serverTimestamp()
  });
  return { success: true, revokedAt: Date.now() };
});

export const verifySensitiveActionPin = onCall(async (request) => {
  const { pin, action } = request.data;
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Auth required');
  if (!pin) throw new HttpsError('invalid-argument', 'PIN required');
  await checkRateLimit(`stepup_${uid}`);

  // Find login account by memberUid
  const q = await db.collection('loginAccounts').where('memberUid', '==', uid).limit(1).get();
  let pinHash;
  if (!q.empty) {
    pinHash = q.docs[0].data().pinHash;
  } else {
    // For admin email users, check custom field or require re-auth via other means
    // For simplicity, we check users collection has pinHash (admin may have set)
    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists || !userSnap.data().pinHash) throw new HttpsError('failed-precondition', 'No PIN set');
    pinHash = userSnap.data().pinHash;
  }
  const match = await bcrypt.compare(pin, pinHash);
  if (!match) throw new HttpsError('unauthenticated', 'Invalid PIN');

  const expiry = dayjs().add(10, 'minute').toISOString();
  // Store step-up session
  await db.doc(`users/${uid}`).set({
    lastStepUp: FieldValue.serverTimestamp(),
    lastStepUpAction: action,
    stepUpExpiry: expiry
  }, { merge: true });

  return { success: true, sessionExpiry: expiry };
});

export const recalculateItinerarySchedule = onCall(async (request) => {
  const { tripId, items, changedItemId } = request.data;
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Auth required');
  if (!tripId || !items) throw new HttpsError('invalid-argument', 'Missing data');
  if (!await isTripAdmin(tripId, uid)) {
    const mem = await db.doc(`trips/${tripId}/members/${uid}`).get();
    if (!mem.exists || !mem.data().permissions?.canEditItinerary) throw new HttpsError('permission-denied', 'No permission');
  }

  // Server-side recalculation to ensure integrity
  // items: array sorted by order with startAt as ISO string
  const sorted = [...items].sort((a,b) => (a.order||0)-(b.order||0));
  let idx = sorted.findIndex(i => i.id === changedItemId);
  if (idx === -1) idx = 0;
  for (let i = idx; i < sorted.length; i++) {
    if (i === 0) continue;
    const prev = sorted[i-1];
    const prevEnd = dayjs(prev.startAt).add(prev.durationMinutes || 0, 'minute');
    const travel = prev.travelToNextMinutes || 0;
    sorted[i].startAt = prevEnd.add(travel, 'minute').toISOString();
    sorted[i].endAt = dayjs(sorted[i].startAt).add(sorted[i].durationMinutes || 0, 'minute').toISOString();
  }

  // Detect overlaps
  const overlaps = [];
  for (let i = 1; i < sorted.length; i++) {
    if (dayjs(sorted[i].startAt).isBefore(dayjs(sorted[i-1].endAt))) {
      overlaps.push({ prev: sorted[i-1].id, curr: sorted[i].id });
    }
  }

  // Batch update
  const batch = db.batch();
  for (const item of sorted) {
    const ref = db.doc(`trips/${tripId}/itineraryItems/${item.id}`);
    batch.update(ref, {
      startAt: new Date(item.startAt),
      endAt: new Date(item.endAt),
      order: item.order,
      durationMinutes: item.durationMinutes,
      travelToNextMinutes: item.travelToNextMinutes,
      updatedBy: uid,
      updatedAt: FieldValue.serverTimestamp(),
      version: FieldValue.increment(1)
    });
  }
  await batch.commit();

  return { items: sorted, overlaps };
});

export const validateExpenseAllocations = onCall(async (request) => {
  const { tripId, expenseId, totalMinor, allocations } = request.data;
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Auth required');
  if (!tripId || totalMinor == null || !allocations) throw new HttpsError('invalid-argument', 'Missing data');
  if (!await isTripMember(tripId, uid)) throw new HttpsError('permission-denied', 'Trip membership required');
  // Validate sum
  const sum = allocations.reduce((s,a) => s + (a.amountMinor||0), 0);
  if (sum !== totalMinor) throw new HttpsError('invalid-argument', `Sum ${sum} != total ${totalMinor}`);
  for (const a of allocations) {
    if (a.amountMinor < 0) throw new HttpsError('invalid-argument', 'Negative allocation');
  }
  // If expense exists, update audit
  if (expenseId) {
    await db.collection(`trips/${tripId}/activityLogs`).add({
      action: 'validate_expense',
      target: expenseId,
      by: uid,
      timestamp: FieldValue.serverTimestamp(),
      details: { totalMinor, sum }
    });
  }
  return { valid: true };
});


export const writeAuditLog = onCall(async (request) => {
  const { tripId, action, target, before, after } = request.data;
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Auth required');
  if (!tripId || !action) throw new HttpsError('invalid-argument', 'Missing tripId/action');
  if (!await isTripMember(tripId, uid)) throw new HttpsError('permission-denied', 'Trip membership required');
  await db.collection(`trips/${tripId}/activityLogs`).add({
    action, target, by: uid, before: before||null, after: after||null,
    timestamp: FieldValue.serverTimestamp()
  });
  return { success: true };
});

/* ==================================================================== *
 * Notifications (v30) — in-app bell + Web Push (FCM)
 *   • pushTripNotification : a document in trips/{tripId}/notifications
 *                            → send it to every recipient's devices
 *   • dailyExpenseSummary  : hourly tick — write the trip-local daily
 *                            summary once per day, which the trigger above
 *                            then pushes
 * ==================================================================== */

const NOTIFICATION_TYPES_WITH_FLAG = {
  expense: 'expense',
  daily_summary: 'dailySummary',
  settlement: 'settlement',
  member: 'member',
  trip: 'member'
};

/** “2026-10-13 21:00” in the trip's own timezone, without extra dependencies. */
function zonedParts(date, timeZone) {
  try {
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', hour12: false
    });
    const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
    return {
      date: `${parts.year}-${parts.month}-${parts.day}`,
      hour: Number(parts.hour) % 24
    };
  } catch {
    const d = date;
    const pad = (n) => String(n).padStart(2, '0');
    return { date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`, hour: d.getUTCHours() };
  }
}

/** Every account of the trip: member docs + memberUids + the creator. */
async function tripMemberIds(tripId, tripData = null) {
  const ids = new Set();
  const trip = tripData || (await db.doc(`trips/${tripId}`).get()).data() || {};
  (trip.memberUids || []).forEach(uid => uid && ids.add(uid));
  if (trip.createdBy) ids.add(trip.createdBy);
  const membersSnap = await db.collection(`trips/${tripId}/members`).get();
  membersSnap.docs.forEach(d => {
    const m = d.data() || {};
    if (m.status === 'inactive') return;
    ids.add(d.id);
    if (m.uid) ids.add(m.uid);
  });
  return [...ids];
}

/** Tokens of one account, honouring its own push preferences. */
async function tokensForAccount(uid, { tripId, type }) {
  if (!uid) return [];
  const [prefsSnap, tokensSnap] = await Promise.all([
    db.doc(`users/${uid}/pushPrefs/current`).get(),
    db.collection(`users/${uid}/pushTokens`).get()
  ]);
  const prefs = prefsSnap.exists ? prefsSnap.data() : null;
  if (prefs) {
    if (prefs.push === false || prefs.enabled === false) return [];
    const flag = NOTIFICATION_TYPES_WITH_FLAG[type];
    if (flag && prefs[flag] === false) return [];
  }
  const tokens = [];
  tokensSnap.docs.forEach(d => {
    const data = d.data() || {};
    if (!data.token || data.enabled === false) return;
    if (Array.isArray(data.tripIds) && data.tripIds.length && !data.tripIds.includes(tripId)) return;
    tokens.push({ id: d.id, token: data.token });
  });
  return tokens;
}

async function dropDeadTokens(uid, ids = []) {
  await Promise.all(ids.map(id => db.doc(`users/${uid}/pushTokens/${id}`).delete().catch(() => {})));
}

/**
 * Push a notification document to the devices of every recipient.
 * Data-only messages: the service worker (firebase-messaging-sw.js) draws them,
 * so the click can route to the exact expense.
 */
export const pushTripNotification = onDocumentCreated('trips/{tripId}/notifications/{notificationId}', async (event) => {
  const snap = event.data;
  if (!snap) return;
  const { tripId, notificationId } = event.params;
  const note = snap.data() || {};
  const type = String(note.type || 'trip');

  let recipients = Array.isArray(note.recipients) && note.recipients.length
    ? note.recipients
    : await tripMemberIds(tripId);
  recipients = [...new Set(recipients.filter(Boolean))];
  // Never ping the author about their own action (the test ping is the exception).
  if (type !== 'test' && note.createdBy) recipients = recipients.filter(uid => uid !== note.createdBy);
  if (!recipients.length) return;

  const title = String(note.title || 'Trip Manager').slice(0, 120);
  const body = String(note.body || '').slice(0, 240);
  const link = String(note.link || `#/trip/${tripId}/dashboard`);

  const perAccount = await Promise.all(recipients.map(async (uid) => ({
    uid,
    tokens: await tokensForAccount(uid, { tripId, type }).catch(() => [])
  })));

  const messaging = getMessaging();
  let sent = 0;
  for (const { uid, tokens } of perAccount) {
    if (!tokens.length) continue;
    const dead = [];
    for (let i = 0; i < tokens.length; i += 500) {
      const chunk = tokens.slice(i, i + 500);
      const res = await messaging.sendEachForMulticast({
        tokens: chunk.map(t => t.token),
        data: { title, body, url: link, tag: notificationId, notificationId, type },
        android: { priority: 'high' },
        webpush: { headers: { Urgency: 'high' } }
      }).catch((e) => {
        console.warn('pushTripNotification: send failed', e.message);
        return null;
      });
      if (!res) continue;
      sent += res.successCount || 0;
      (res.responses || []).forEach((r, idx) => {
        const code = r.error?.code || '';
        if (/registration-token-not-registered|invalid-argument|invalid-registration-token/.test(code)) {
          dead.push(chunk[idx]?.id);
        }
      });
    }
    if (dead.length) await dropDeadTokens(uid, dead.filter(Boolean));
  }

  await snap.ref.set({ pushSent: true, pushCount: sent, pushSentAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
});

const money = (minor) => `฿${((Number(minor) || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Keep the bell list bounded: the newest 120 documents of a trip stay, the rest
 * are deleted on the hourly tick. Daily summaries are the trip's history and are
 * never pruned.
 */
async function pruneOldNotifications(tripId) {
  const snap = await db.collection(`trips/${tripId}/notifications`)
    .orderBy('createdAt', 'desc').limit(400).get().catch(() => null);
  if (!snap || snap.size <= 120) return 0;
  const doomed = snap.docs.slice(120).filter(d => !/^daily-\d{4}-\d{2}-\d{2}$/.test(d.id));
  if (!doomed.length) return 0;
  const batch = db.batch();
  doomed.forEach(d => batch.delete(d.ref));
  await batch.commit().catch(() => {});
  return doomed.length;
}

/**
 * Daily expense summary — runs on the hour, writes at most ONE document per
 * trip per (trip-local) day. The create trigger above turns it into a push, so
 * members who never open the app still learn what the trip spent today.
 */
export const dailyExpenseSummary = onSchedule(
  { schedule: 'every 60 minutes', timeZone: 'UTC', maxInstances: 3 },
  async () => {
    const now = new Date();
    const tripsSnap = await db.collection('trips').limit(400).get();

    for (const tripDoc of tripsSnap.docs) {
      const tripId = tripDoc.id;
      const trip = tripDoc.data() || {};
      if (trip.status === 'archived') continue;
      try {
        const settingsSnap = await db.doc(`trips/${tripId}/settings/notifications`).get();
        const settings = settingsSnap.exists ? settingsSnap.data() : {};
        if (settings.dailySummary === false) continue;
        const summaryHour = Number.isFinite(Number(settings.summaryHour)) ? Number(settings.summaryHour) : 20;

        const { date: localDate, hour: localHour } = zonedParts(now, trip.timezone || 'Asia/Bangkok');
        if (localHour < summaryHour) continue;

        const summaryRef = db.doc(`trips/${tripId}/notifications/daily-${localDate}`);
        if ((await summaryRef.get()).exists) continue;

        const expensesSnap = await db.collection(`trips/${tripId}/expenses`)
          .where('date', '==', localDate).limit(300).get();
        const rows = expensesSnap.docs.map(d => d.data()).filter(e => e && e.status !== 'voided');
        if (!rows.length) continue;   // nothing was spent → stay quiet

        // thbMinor is written by the app on every save; the fallback covers
        // rows written by an older build or by the Excel import.
        const totalThbMinor = rows.reduce((sum, e) => {
          const stored = Number(e.thbMinor);
          if (Number.isFinite(stored) && stored !== 0) return sum + stored;
          const minor = Number(e.netTotalMinor) || 0;
          const rate = Number(e.thbRate) || 0;
          const thb = (e.currency || 'THB') === 'THB' ? minor : Math.round(minor * (rate > 0 ? rate : 1));
          return sum + thb;
        }, 0);

        const byCategory = new Map();
        rows.forEach(e => {
          const key = e.category || 'other';
          byCategory.set(key, (byCategory.get(key) || 0) + (Number(e.thbMinor) || 0));
        });
        const top = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0];

        await summaryRef.set({
          type: 'daily_summary',
          date: localDate,
          title: `สรุปค่าใช้จ่าย ${localDate}`,
          body: `วันนี้ทั้งทริปใช้จ่าย ${money(totalThbMinor)} จาก ${rows.length} รายการ`
            + (top ? ` • หมวดที่ใช้มากสุด: ${top[0]} (${money(top[1])})` : ''),
          amountMinor: totalThbMinor,
          currency: 'THB',
          count: rows.length,
          topCategory: top ? { category: top[0], amountThbMinor: top[1] } : null,
          link: `#/trip/${tripId}/expenses`,
          recipients: await tripMemberIds(tripId, trip),
          readBy: {},
          createdBy: 'system',
          createdByName: 'Trip Manager',
          system: true,
          createdAt: FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (e) {
        console.warn(`dailyExpenseSummary: trip ${tripId} failed — ${e.message}`);
      }
      await pruneOldNotifications(tripId).catch(() => {});
    }
  }
);
