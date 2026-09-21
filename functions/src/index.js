import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
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
  if (await isSuperAdmin(uid)) return true;
  const snap = await db.doc(`trips/${tripId}/members/${uid}`).get();
  if (!snap.exists) return false;
  const role = snap.data().role;
  return ['trip_admin', 'super_admin'].includes(role);
}

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
    await db.doc('systemHealth/ping').set({ lastCheck: FieldValue.serverTimestamp() }, { merge: true });
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
    role,
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
    details: { username: norm, role }
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

export const recalculateSettlement = onCall(async (request) => {
  const { tripId } = request.data;
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Auth required');
  // Fetch expenses and members
  const expSnap = await db.collection(`trips/${tripId}/expenses`).where('status', '!=', 'voided').get();
  const memSnap = await db.collection(`trips/${tripId}/members`).get();
  const expenses = expSnap.docs.map(d => d.data());
  const members = memSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  // Report and persist one common unit: Thai satang, just like the client.
  const trip = (await db.collection('trips').doc(tripId).get()).data() || {};
  for (const exp of expenses) {
    const code = exp.currency || trip.baseCurrency || 'THB';
    if (code === 'THB') continue;
    const rate = Number(exp.thbRate) || (code === trip.baseCurrency ? Number(trip.exchangeRateToTHB) : 0);
    if (!(rate > 0) || !Number.isFinite(rate)) throw new HttpsError('failed-precondition', `Missing ${code} to THB rate`);
    const factor = ['JPY', 'KRW', 'VND'].includes(code) ? 100 : 1;
    const originalTotal = exp.netTotalMinor;
    const total = Math.round(originalTotal * factor * rate);
    for (const key of ['allocations', 'payments']) {
      if (!exp[key]?.length) continue;
      const sum = exp[key].reduce((n, row) => n + row.amountMinor, 0);
      exp[key] = exp[key].map(row => ({ ...row, amountMinor: Math.round(row.amountMinor * factor * rate) }));
      if (sum === originalTotal) {
        const largest = exp[key].reduce((a, b) => a.amountMinor >= b.amountMinor ? a : b);
        largest.amountMinor += total - exp[key].reduce((n, row) => n + row.amountMinor, 0);
      }
    }
    exp.netTotalMinor = total;
  }

  // Calculate balances
  const balances = new Map();
  for (const m of members) balances.set(m.id, 0);
  for (const exp of expenses) {
    const payments = exp.payments?.length ? exp.payments : [{ memberId: exp.payerId || exp.paidBy, amountMinor: exp.netTotalMinor || 0 }];
    for (const payment of payments) {
      balances.set(payment.memberId, (balances.get(payment.memberId) || 0) + payment.amountMinor);
    }
    for (const alloc of exp.allocations||[]) {
      if (!balances.has(alloc.memberId)) balances.set(alloc.memberId, 0);
      balances.set(alloc.memberId, balances.get(alloc.memberId) - (alloc.amountMinor||0));
    }
  }
  const balArray = Array.from(balances.entries()).map(([memberId, net]) => ({ memberId, net }));
  // Minimize
  const creditors = balArray.filter(b=>b.net>1).map(b=>({...b})).sort((a,b)=>b.net-a.net);
  const debtors = balArray.filter(b=>b.net<-1).map(b=>({ memberId:b.memberId, net:-b.net })).sort((a,b)=>b.net-a.net);
  const transactions = [];
  let i=0,j=0;
  while(i<debtors.length && j<creditors.length){
    const d=debtors[i], c=creditors[j];
    const amt=Math.min(d.net,c.net);
    if(amt>1) transactions.push({ from:d.memberId, to:c.memberId, amountMinor:amt });
    d.net-=amt; c.net-=amt;
    if(d.net<=1) i++; if(c.net<=1) j++;
  }

  const ref = await db.collection(`trips/${tripId}/settlements`).add({
    balances: balArray,
    transactions,
    currency: 'THB',
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp(),
    status: 'active'
  });

  return { id: ref.id, balances: balArray, transactions };
});

export const writeAuditLog = onCall(async (request) => {
  const { tripId, action, target, before, after } = request.data;
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Auth required');
  await db.collection(`trips/${tripId}/activityLogs`).add({
    action, target, by: uid, before: before||null, after: after||null,
    timestamp: FieldValue.serverTimestamp()
  });
  return { success: true };
});
