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
import { verifyStoredMemberPin } from './memberPin.js';

initializeApp();
setGlobalOptions({ region: 'asia-southeast1', maxInstances: 10 });

const db = getFirestore();
const auth = getAuth();

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

// Atomic rate-limit check so concurrent PIN attempts cannot all pass the same count.
async function checkRateLimit(key) {
  const ref = db.doc(`rateLimits/${key}`);
  const now = Date.now();
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;
    if (!data || now - Number(data.firstAttempt || 0) > RATE_LIMIT_WINDOW_MS) {
      tx.set(ref, { count: 1, firstAttempt: now, lastAttempt: now });
      return;
    }
    if (Number(data.count || 0) >= MAX_ATTEMPTS) {
      throw new HttpsError('resource-exhausted', 'Too many attempts, try later');
    }
    tx.update(ref, { count: FieldValue.increment(1), lastAttempt: now });
  });
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
  const member = snap.data();
  return member.status !== 'inactive' && ['trip_admin', 'super_admin'].includes(member.role);
}

async function isTripMember(tripId, uid) {
  if (!tripId || !uid) return false;
  if (await isTripAdmin(tripId, uid)) return true;
  const memberSnap = await db.doc(`trips/${tripId}/members/${uid}`).get();
  if (memberSnap.exists) return memberSnap.data().status !== 'inactive';
  const tripSnap = await db.doc(`trips/${tripId}`).get();
  if (!tripSnap.exists) return false;
  const data = tripSnap.data();
  return data.createdBy === uid || (Array.isArray(data.memberUids) && data.memberUids.includes(uid));
}

async function canManageMembers(tripId, uid) {
  if (!tripId || !uid) return false;
  if (await isTripAdmin(tripId, uid)) return true;
  const memberSnap = await db.doc(`trips/${tripId}/members/${uid}`).get();
  if (!memberSnap.exists) return false;
  const member = memberSnap.data();
  return member.status !== 'inactive'
    && member.role !== 'viewer'
    && member.permissions?.canManageMembers === true;
}

async function canEditItinerary(tripId, uid) {
  if (await isTripAdmin(tripId, uid)) return true;
  if (!await isTripMember(tripId, uid)) return false;
  const memberSnap = await db.doc(`trips/${tripId}/members/${uid}`).get();
  if (!memberSnap.exists) return true; // legacy memberUids-only membership
  const member = memberSnap.data();
  return member.status !== 'inactive'
    && member.role !== 'viewer'
    && member.permissions?.canEditItinerary !== false;
}

async function memberManagementAccessInTransaction(tx, tripId, uid) {
  const [userSnap, tripSnap, memberSnap] = await Promise.all([
    tx.get(db.doc(`users/${uid}`)),
    tx.get(db.doc(`trips/${tripId}`)),
    tx.get(db.doc(`trips/${tripId}/members/${uid}`))
  ]);
  const member = memberSnap.exists ? memberSnap.data() : null;
  const isTripAdmin = (userSnap.exists && userSnap.data().role === 'super_admin')
    || (tripSnap.exists && tripSnap.data().createdBy === uid)
    || Boolean(member && member.status !== 'inactive'
      && ['trip_admin', 'super_admin'].includes(member.role));
  const canManageMembers = isTripAdmin || Boolean(member && member.status !== 'inactive'
    && member.role !== 'viewer' && member.permissions?.canManageMembers === true);
  return { canManageMembers, isTripAdmin };
}

const ALLOWED_MEMBER_ROLES = ['member', 'trip_admin', 'viewer'];

function normalizeUsername(u) {
  return String(u || '').trim().toLowerCase().replace(/\s+/g, '');
}

function normalizeInviteCode(code) {
  return String(code || '').toUpperCase().replace(/[\s-]/g, '').replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function isValidUsername(username) {
  return /^[a-z0-9_.@-]{3,32}$/.test(username);
}

function isValidLoginUsername(username) {
  // Legacy member records were not always subject to the current 3-character rule.
  return /^[a-z0-9_.@-]{1,32}$/.test(username);
}

function isSafeDocumentId(value) {
  return typeof value === 'string'
    && value.length > 0
    && !value.includes('/')
    && value !== '.'
    && value !== '..'
    && Buffer.byteLength(value, 'utf8') <= 1500;
}

function invitePreview(tripId, data) {
  return {
    tripId,
    name: String(data.name || ''),
    startDate: String(data.startDate || ''),
    endDate: String(data.endDate || '')
  };
}

/** Legacy server-only helper used by older account-management callables. */
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

/** Search a single profile only for an authenticated trip member manager. */
export const findMemberProfileByEmail = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  const tripId = String(request.data?.tripId || '').trim();
  const email = String(request.data?.email || '').trim().toLowerCase();
  if (!callerUid) throw new HttpsError('unauthenticated', 'Auth required');
  if (!isSafeDocumentId(tripId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpsError('invalid-argument', 'Trip and valid email required');
  }
  if (!await canManageMembers(tripId, callerUid)) {
    throw new HttpsError('permission-denied', 'Member-management permission required');
  }

  const snap = await db.collection('publicProfiles').where('email', '==', email).limit(1).get();
  if (snap.empty) return { profile: null };
  const profileDoc = snap.docs[0];
  const profile = profileDoc.data();
  return {
    profile: {
      id: profileDoc.id,
      uid: profileDoc.id,
      displayName: String(profile.displayName || 'Member').slice(0, 120),
      email: String(profile.email || '').slice(0, 254),
      photoURL: typeof profile.photoURL === 'string' && /^https:\/\//i.test(profile.photoURL)
        ? profile.photoURL.slice(0, 2048) : null
    }
  };
});

/**
 * Resolve one known invite code and return only name/date preview data. The public
 * document is also repaired for legacy trips that have not yet been backfilled.
 */
export const lookupTripByInviteCode = onCall(async (request) => {
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Auth required');
  const code = normalizeInviteCode(request.data?.code);
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new HttpsError('invalid-argument', 'Invalid invite code');
  await checkRateLimit(`invite_lookup_${uid}`);

  const matches = await db.collection('trips').where('inviteCode', '==', code).limit(2).get();
  if (matches.size !== 1) return { trip: null };
  const tripDoc = matches.docs[0];
  const data = tripDoc.data();
  if (data.inviteEnabled === false) return { trip: null };

  const preview = invitePreview(tripDoc.id, data);
  const repair = db.batch();
  if (data.inviteEnabled !== true || data.inviteCode !== code) {
    repair.update(tripDoc.ref, {
      inviteCode: code,
      inviteEnabled: true,
      updatedAt: FieldValue.serverTimestamp()
    });
  }
  repair.set(db.doc(`publicTripInvites/${code}`), preview);
  await repair.commit();
  return { trip: preview };
});

// Legacy server-managed account endpoint retained for older clients.
export const createMemberAccount = onCall(async (request) => {
  const {
    tripId: rawTripId,
    username: rawUsername,
    pin: rawPin,
    displayName: rawDisplayName,
    role = 'member',
    permissions = {}
  } = request.data || {};
  const tripId = String(rawTripId || '').trim();
  const username = normalizeUsername(rawUsername);
  const pin = String(rawPin ?? '');
  const displayName = String(rawDisplayName || username).trim().slice(0, 120);
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Auth required');
  if (!isSafeDocumentId(tripId) || !isValidUsername(username)
      || pin.length < 4 || pin.length > 12) {
    throw new HttpsError('invalid-argument', 'Trip, username, and a 4-12 character PIN are required');
  }

  const isAdmin = await isTripAdmin(tripId, callerUid);
  if (!isAdmin) throw new HttpsError('permission-denied', 'Admin only');

  const safeRole = ALLOWED_MEMBER_ROLES.includes(role) ? role : 'member';

  const norm = username;
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

const invalidMemberPin = () => new HttpsError('unauthenticated', 'Invalid username or PIN');

function sameMemberIndex(data, tripId, memberId) {
  return data?.tripId === tripId && (data?.memberId || data?.memberUid) === memberId;
}

/** Admin-only server write for a member's PIN and private login index. */
export const setMemberPin = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Auth required');
  const tripId = String(request.data?.tripId || '').trim();
  const memberId = String(request.data?.memberId || '').trim();
  const username = normalizeUsername(request.data?.username);
  const previousUsername = normalizeUsername(request.data?.previousUsername);
  const pin = String(request.data?.pin ?? '');
  if (!isSafeDocumentId(tripId) || !isSafeDocumentId(memberId)
      || memberId.length > 128 || !isValidUsername(username)
      || (previousUsername && !isSafeDocumentId(previousUsername))
      || pin.length < 4 || pin.length > 12) {
    throw new HttpsError('invalid-argument', 'Trip, member, username and a 4-12 character PIN are required');
  }

  const memberRef = db.doc(`trips/${tripId}/members/${memberId}`);
  const secretRef = db.doc(`memberSecrets/${tripId}_${memberId}`);
  const newLookupRef = db.doc(`publicMemberLogins/${username}`);
  const oldLookupRef = previousUsername && previousUsername !== username
    ? db.doc(`publicMemberLogins/${previousUsername}`) : null;
  const newLegacyRef = db.doc(`loginAccounts/${username}`);
  const oldLegacyRef = previousUsername && previousUsername !== username
    ? db.doc(`loginAccounts/${previousUsername}`) : null;
  const hash = await bcrypt.hash(pin, 10);

  await db.runTransaction(async (tx) => {
    const readRefs = [memberRef, newLookupRef, newLegacyRef];
    if (oldLookupRef) readRefs.push(oldLookupRef);
    if (oldLegacyRef) readRefs.push(oldLegacyRef);
    const snapshots = await Promise.all(readRefs.map((ref) => tx.get(ref)));
    const byPath = new Map(readRefs.map((ref, index) => [ref.path, snapshots[index]]));
    const access = await memberManagementAccessInTransaction(tx, tripId, callerUid);
    if (!access.canManageMembers) {
      throw new HttpsError('permission-denied', 'Member-management permission required');
    }

    const memberSnap = byPath.get(memberRef.path);
    if (!memberSnap?.exists) throw new HttpsError('not-found', 'Member not found');
    const member = memberSnap.data();
    if (['trip_admin', 'super_admin'].includes(member.role) && !access.isTripAdmin) {
      throw new HttpsError('permission-denied', 'Only a trip admin may change another admin account');
    }
    if (normalizeUsername(member.username) !== username) {
      throw new HttpsError('failed-precondition', 'Member username changed; refresh and retry');
    }
    const lookupSnap = byPath.get(newLookupRef.path);
    if (lookupSnap?.exists && !lookupSnap.data().disabled
        && !sameMemberIndex(lookupSnap.data(), tripId, memberId)) {
      throw new HttpsError('already-exists', 'Username taken');
    }
    const legacySnap = byPath.get(newLegacyRef.path);
    if (legacySnap?.exists && !legacySnap.data().disabled
        && (legacySnap.data().tripId !== tripId || legacySnap.data().memberUid !== memberId)) {
      throw new HttpsError('already-exists', 'Username taken');
    }

    tx.set(secretRef, {
      tripId,
      memberId,
      username,
      pinHash: hash,
      pinAlgo: 'bcrypt',
      disabled: false,
      updatedBy: callerUid,
      updatedAt: FieldValue.serverTimestamp()
    });
    tx.set(newLookupRef, {
      username,
      tripId,
      memberId,
      disabled: false,
      updatedAt: FieldValue.serverTimestamp()
    });
    tx.update(memberRef, {
      username,
      loginReady: true,
      authType: 'pin',
      pinHash: FieldValue.delete(),
      pinSalt: FieldValue.delete(),
      pinIterations: FieldValue.delete(),
      failedAttempts: 0,
      updatedAt: FieldValue.serverTimestamp()
    });
    if (oldLookupRef) {
      const old = byPath.get(oldLookupRef.path);
      if (old?.exists && sameMemberIndex(old.data(), tripId, memberId)) tx.delete(oldLookupRef);
    }
    for (const legacyRef of [newLegacyRef, oldLegacyRef].filter(Boolean)) {
      const legacy = byPath.get(legacyRef.path);
      if (legacy?.exists && legacy.data().tripId === tripId && legacy.data().memberUid === memberId) {
        tx.update(legacyRef, { disabled: true, updatedAt: FieldValue.serverTimestamp() });
      } else if (legacyRef.path === newLegacyRef.path && legacy?.exists && legacy.data().disabled) {
        tx.delete(legacyRef);
      }
    }
  });
  return { success: true };
});

/** Move the server-only username index after the member document was updated. */
export const publishMemberLoginLookup = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Auth required');
  const tripId = String(request.data?.tripId || '').trim();
  const memberId = String(request.data?.memberId || '').trim();
  const username = normalizeUsername(request.data?.username);
  const previousUsername = normalizeUsername(request.data?.previousUsername);
  if (!isSafeDocumentId(tripId) || !isSafeDocumentId(memberId)
      || memberId.length > 128 || !isValidUsername(username)
      || (previousUsername && !isSafeDocumentId(previousUsername))) {
    throw new HttpsError('invalid-argument', 'Invalid member login');
  }

  const memberRef = db.doc(`trips/${tripId}/members/${memberId}`);
  const secretRef = db.doc(`memberSecrets/${tripId}_${memberId}`);
  const newLookupRef = db.doc(`publicMemberLogins/${username}`);
  const oldLookupRef = previousUsername && previousUsername !== username
    ? db.doc(`publicMemberLogins/${previousUsername}`) : null;
  const newLegacyRef = db.doc(`loginAccounts/${username}`);
  const oldLegacyRef = previousUsername && previousUsername !== username
    ? db.doc(`loginAccounts/${previousUsername}`) : null;

  await db.runTransaction(async (tx) => {
    const readRefs = [memberRef, secretRef, newLookupRef, newLegacyRef];
    if (oldLookupRef) readRefs.push(oldLookupRef);
    if (oldLegacyRef) readRefs.push(oldLegacyRef);
    const snapshots = await Promise.all(readRefs.map((ref) => tx.get(ref)));
    const byPath = new Map(readRefs.map((ref, index) => [ref.path, snapshots[index]]));
    const access = await memberManagementAccessInTransaction(tx, tripId, callerUid);
    if (!access.canManageMembers) {
      throw new HttpsError('permission-denied', 'Member-management permission required');
    }

    const memberSnap = byPath.get(memberRef.path);
    if (!memberSnap?.exists) throw new HttpsError('not-found', 'Member not found');
    const member = memberSnap.data();
    if (['trip_admin', 'super_admin'].includes(member.role) && !access.isTripAdmin) {
      throw new HttpsError('permission-denied', 'Only a trip admin may change another admin account');
    }
    if (normalizeUsername(member.username) !== username) {
      throw new HttpsError('failed-precondition', 'Member username changed; refresh and retry');
    }
    const lookupSnap = byPath.get(newLookupRef.path);
    if (lookupSnap?.exists && !lookupSnap.data().disabled
        && !sameMemberIndex(lookupSnap.data(), tripId, memberId)) {
      throw new HttpsError('already-exists', 'Username taken');
    }
    const legacySnap = byPath.get(newLegacyRef.path);
    if (legacySnap?.exists && !legacySnap.data().disabled
        && (legacySnap.data().tripId !== tripId || legacySnap.data().memberUid !== memberId)) {
      throw new HttpsError('already-exists', 'Username taken');
    }

    const oldLegacySnap = oldLegacyRef ? byPath.get(oldLegacyRef.path) : null;
    const oldLegacyOwned = oldLegacySnap?.exists
      && oldLegacySnap.data().tripId === tripId
      && oldLegacySnap.data().memberUid === memberId;
    const secretSnap = byPath.get(secretRef.path);
    const hasHash = Boolean(secretSnap?.exists && secretSnap.data().pinHash)
      || Boolean(member.pinHash && member.pinSalt)
      || Boolean(oldLegacyOwned)
      || Boolean(legacySnap?.exists && legacySnap.data().tripId === tripId && legacySnap.data().memberUid === memberId);
    const loginReady = member.loginReady !== false && hasHash;

    if (loginReady) {
      tx.set(newLookupRef, {
        username,
        tripId,
        memberId,
        disabled: false,
        updatedAt: FieldValue.serverTimestamp()
      });
      if (oldLegacyOwned && oldLegacyRef && oldLegacyRef.path !== newLegacyRef.path) {
        tx.set(newLegacyRef, { ...oldLegacySnap.data(), username, updatedAt: FieldValue.serverTimestamp() });
        tx.delete(oldLegacyRef);
      }
    }
    if (oldLookupRef) {
      const old = byPath.get(oldLookupRef.path);
      if (old?.exists && sameMemberIndex(old.data(), tripId, memberId)) tx.delete(oldLookupRef);
    }
  });
  return { success: true };
});

/** Delete PIN material and all username mappings before a member is removed. */
export const clearMemberPin = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Auth required');
  const tripId = String(request.data?.tripId || '').trim();
  const memberId = String(request.data?.memberId || '').trim();
  const suppliedUsername = normalizeUsername(request.data?.username);
  if (!isSafeDocumentId(tripId) || !isSafeDocumentId(memberId) || memberId.length > 128
      || (suppliedUsername && !isSafeDocumentId(suppliedUsername))) {
    throw new HttpsError('invalid-argument', 'Trip and member required');
  }

  const memberRef = db.doc(`trips/${tripId}/members/${memberId}`);
  const secretRef = db.doc(`memberSecrets/${tripId}_${memberId}`);
  await db.runTransaction(async (tx) => {
    const memberSnap = await tx.get(memberRef);
    const usernames = [...new Set([suppliedUsername, normalizeUsername(memberSnap.exists ? memberSnap.data().username : '')].filter(Boolean))];
    const lookupRefs = usernames.map((name) => db.doc(`publicMemberLogins/${name}`));
    const legacyRefs = usernames.map((name) => db.doc(`loginAccounts/${name}`));
    const refs = [secretRef, ...lookupRefs, ...legacyRefs];
    const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
    const byPath = new Map(refs.map((ref, index) => [ref.path, snapshots[index]]));
    const access = await memberManagementAccessInTransaction(tx, tripId, callerUid);
    if (!access.canManageMembers) {
      throw new HttpsError('permission-denied', 'Member-management permission required');
    }

    if (memberSnap.exists && ['trip_admin', 'super_admin'].includes(memberSnap.data().role)
        && !access.isTripAdmin) {
      throw new HttpsError('permission-denied', 'Only a trip admin may change another admin account');
    }
    const secretSnap = byPath.get(secretRef.path);
    if (secretSnap?.exists) tx.delete(secretRef);
    for (const ref of lookupRefs) {
      const snap = byPath.get(ref.path);
      if (snap?.exists && sameMemberIndex(snap.data(), tripId, memberId)) tx.delete(ref);
    }
    for (const ref of legacyRefs) {
      const snap = byPath.get(ref.path);
      if (snap?.exists && snap.data().tripId === tripId && snap.data().memberUid === memberId) {
        tx.update(ref, { disabled: true, updatedAt: FieldValue.serverTimestamp() });
      }
    }
    if (memberSnap.exists) {
      tx.update(memberRef, {
        loginReady: false,
        pinHash: FieldValue.delete(),
        pinSalt: FieldValue.delete(),
        pinIterations: FieldValue.delete(),
        failedAttempts: 0,
        updatedAt: FieldValue.serverTimestamp()
      });
    }
  });
  return { success: true };
});

async function findMemberForPinLogin(username, tripIdHint, lookupSnap, legacySnap) {
  if (lookupSnap?.exists && lookupSnap.data().disabled) return null;
  if (!lookupSnap?.exists && legacySnap?.exists && legacySnap.data().disabled) return null;

  if (tripIdHint && isSafeDocumentId(tripIdHint)) {
    const direct = await db.collection(`trips/${tripIdHint}/members`)
      .where('username', '==', username).limit(2).get();
    if (direct.size === 1) {
      return { tripId: tripIdHint, memberId: direct.docs[0].id, member: direct.docs[0].data() };
    }
  }

  if (lookupSnap?.exists) {
    const lookup = lookupSnap.data();
    const tripId = String(lookup.tripId || '');
    const memberId = String(lookup.memberId || lookup.memberUid || '');
    if (isSafeDocumentId(tripId) && isSafeDocumentId(memberId)
        && (!tripIdHint || tripIdHint === tripId)) {
      const memberSnap = await db.doc(`trips/${tripId}/members/${memberId}`).get();
      if (memberSnap.exists) return { tripId, memberId, member: memberSnap.data() };
    }
  }

  if (legacySnap?.exists && !legacySnap.data().disabled) {
    const account = legacySnap.data();
    const tripId = String(account.tripId || '');
    const memberId = String(account.memberUid || '');
    if (isSafeDocumentId(tripId) && isSafeDocumentId(memberId)
        && (!tripIdHint || tripIdHint === tripId)) {
      const memberSnap = await db.doc(`trips/${tripId}/members/${memberId}`).get();
      if (memberSnap.exists) return { tripId, memberId, member: memberSnap.data() };
    }
  }

  if (!tripIdHint && !lookupSnap?.exists && !legacySnap?.exists) {
    const matches = await db.collectionGroup('members').where('username', '==', username).limit(2).get();
    const tripMembers = matches.docs.filter((d) => {
      const parts = d.ref.path.split('/');
      return parts.length === 4 && parts[0] === 'trips' && parts[2] === 'members';
    });
    if (tripMembers.length === 1) {
      const parts = tripMembers[0].ref.path.split('/');
      return { tripId: parts[1], memberId: parts[3], member: tripMembers[0].data() };
    }
  }
  return null;
}

async function ensurePinAuthUser(uid, displayName) {
  if (!uid || uid.length > 128 || uid.includes('/')) throw invalidMemberPin();
  try {
    const existing = await auth.getUser(uid);
    if (existing.disabled) throw invalidMemberPin();
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    if (e?.code !== 'auth/user-not-found') throw e;
    try {
      await auth.createUser({ uid, displayName: String(displayName || 'Member').slice(0, 120), disabled: false });
    } catch (createError) {
      if (createError?.code !== 'auth/uid-already-exists') throw createError;
      const existing = await auth.getUser(uid);
      if (existing.disabled) throw invalidMemberPin();
    }
  }
}

export const loginWithUsernamePin = onCall(async (request) => {
  const username = normalizeUsername(request.data?.username);
  const pin = String(request.data?.pin ?? '');
  const tripIdHint = String(request.data?.tripId || '').trim() || null;
  if (!isValidLoginUsername(username) || pin.length < 4 || pin.length > 12
      || (tripIdHint && !isSafeDocumentId(tripIdHint))) {
    throw new HttpsError('invalid-argument', 'Username and 4-12 character PIN required');
  }
  await checkRateLimit(`login_${username}`);

  const lookupRef = db.doc(`publicMemberLogins/${username}`);
  const legacyRef = db.doc(`loginAccounts/${username}`);
  const [lookupSnap, legacySnap] = await Promise.all([lookupRef.get(), legacyRef.get()]);
  const found = await findMemberForPinLogin(username, tripIdHint, lookupSnap, legacySnap);
  if (!found || (tripIdHint && found.tripId !== tripIdHint)) throw invalidMemberPin();

  const { tripId, memberId, member } = found;
  if (!isSafeDocumentId(tripId) || !isSafeDocumentId(memberId) || memberId.length > 128
      || member.status !== 'active'
      || member.loginReady === false
      || (member.username && normalizeUsername(member.username) !== username)) throw invalidMemberPin();

  const memberRef = db.doc(`trips/${tripId}/members/${memberId}`);
  const tripRef = db.doc(`trips/${tripId}`);
  const secretRef = db.doc(`memberSecrets/${tripId}_${memberId}`);
  const secretSnap = await secretRef.get();
  let credential = null;
  let credentialRef = null;
  if (secretSnap.exists) {
    credential = secretSnap.data();
    credentialRef = secretRef;
    if (credential.disabled || !credential.pinHash) throw invalidMemberPin();
  } else if (member.pinHash && member.pinSalt) {
    credential = member;
    credentialRef = memberRef;
  } else if (legacySnap.exists
      && !legacySnap.data().disabled
      && legacySnap.data().tripId === tripId
      && legacySnap.data().memberUid === memberId) {
    credential = legacySnap.data();
    credentialRef = legacyRef;
  }
  if (!credential || !await verifyStoredMemberPin(pin, credential)) {
    await memberRef.update({
      failedAttempts: FieldValue.increment(1),
      lastFailedAt: FieldValue.serverTimestamp()
    }).catch(() => {});
    throw invalidMemberPin();
  }

  await db.runTransaction(async (tx) => {
    const refs = [memberRef, tripRef];
    if (credentialRef.path !== memberRef.path) refs.push(credentialRef);
    const snapshots = await Promise.all(refs.map((ref) => tx.get(ref)));
    const byPath = new Map(refs.map((ref, index) => [ref.path, snapshots[index]]));
    const currentMemberSnap = byPath.get(memberRef.path);
    const tripSnap = byPath.get(tripRef.path);
    if (!currentMemberSnap?.exists || !tripSnap?.exists) throw invalidMemberPin();
    const currentMember = currentMemberSnap.data();
    if (currentMember.status !== 'active'
        || currentMember.loginReady === false
        || (currentMember.username && normalizeUsername(currentMember.username) !== username)) {
      throw invalidMemberPin();
    }
    const currentCredentialSnap = credentialRef.path === memberRef.path
      ? currentMemberSnap : byPath.get(credentialRef.path);
    if (!currentCredentialSnap?.exists) throw invalidMemberPin();
    const currentCredential = currentCredentialSnap.data();
    for (const field of ['pinHash', 'pinSalt', 'pinIterations', 'pinAlgo', 'disabled']) {
      if ((currentCredential[field] ?? null) !== (credential[field] ?? null)) throw invalidMemberPin();
    }
    if (currentCredential.disabled) throw invalidMemberPin();

    tx.update(memberRef, { failedAttempts: 0, lastLoginAt: FieldValue.serverTimestamp() });
    tx.update(tripRef, { memberUids: FieldValue.arrayUnion(memberId) });
  });

  await ensurePinAuthUser(memberId, member.displayName);
  const token = await auth.createCustomToken(memberId, { tripId, role: member.role || 'member' });
  await db.doc(`rateLimits/login_${username}`).delete().catch(() => {});
  return {
    token,
    tripId,
    memberId,
    member: {
      uid: memberId,
      username,
      displayName: String(member.displayName || username).slice(0, 120),
      email: typeof member.email === 'string' ? member.email.slice(0, 254) : null,
      photoURL: typeof member.photoURL === 'string' ? member.photoURL.slice(0, 2048) : null,
      color: typeof member.color === 'string' ? member.color.slice(0, 32) : null,
      role: member.role || 'member'
    }
  };
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
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Auth required');
  const norm = normalizeUsername(request.data?.username);
  if (!isValidLoginUsername(norm)) throw new HttpsError('invalid-argument', 'Invalid username');
  const loginRef = db.doc(`loginAccounts/${norm}`);
  const snap = await loginRef.get();
  if (!snap.exists) throw new HttpsError('not-found', 'User not found');
  const data = snap.data();
  const tripId = String(data.tripId || '');
  const memberUid = String(data.memberUid || '');
  if (!isSafeDocumentId(tripId) || !isSafeDocumentId(memberUid) || memberUid.length > 128) {
    throw new HttpsError('failed-precondition', 'Legacy member account is malformed');
  }
  if (!await isTripAdmin(tripId, callerUid)) throw new HttpsError('permission-denied', 'Admin only');

  const memberRef = db.doc(`trips/${tripId}/members/${memberUid}`);
  const tripRef = db.doc(`trips/${tripId}`);
  await db.runTransaction(async (tx) => {
    const [memberSnap, tripSnap] = await Promise.all([tx.get(memberRef), tx.get(tripRef)]);
    if (!memberSnap.exists || !tripSnap.exists) throw new HttpsError('not-found', 'Member not found');
    const member = memberSnap.data();
    if (tripSnap.data().createdBy === memberUid || ['trip_admin', 'super_admin'].includes(member.role)) {
      throw new HttpsError('failed-precondition', 'Use an explicit administrator-offboarding process for trip admins');
    }
    tx.update(memberRef, {
      status: 'inactive',
      loginReady: false,
      updatedAt: FieldValue.serverTimestamp()
    });
    // Remove the UID from trip-list queries as well as marking its member record inactive.
    tx.update(tripRef, {
      memberUids: FieldValue.arrayRemove(memberUid),
      updatedAt: FieldValue.serverTimestamp()
    });
  });
  await loginRef.update({ disabled: true, updatedAt: FieldValue.serverTimestamp() });
  await publicLoginRef(norm).set({ disabled: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  await auth.updateUser(memberUid, { disabled: true });
  return { success: true };
});

export const revokeMemberSessions = onCall(async (request) => {
  const { memberUid: rawMemberUid, tripId: rawTripId } = request.data || {};
  const callerUid = request.auth?.uid;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Auth required');
  const memberUid = String(rawMemberUid || '').trim();
  const tripId = String(rawTripId || '').trim();
  if (!isSafeDocumentId(tripId) || !isSafeDocumentId(memberUid) || memberUid.length > 128) {
    throw new HttpsError('invalid-argument', 'Invalid trip or member');
  }
  if (!await isTripAdmin(tripId, callerUid)) throw new HttpsError('permission-denied', 'Admin only');
  const memberSnap = await db.doc(`trips/${tripId}/members/${memberUid}`).get();
  if (!memberSnap.exists) throw new HttpsError('not-found', 'Member is not part of this trip');
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
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Auth required');
  const pin = String(request.data?.pin ?? '');
  const action = String(request.data?.action || 'unspecified').trim().slice(0, 100) || 'unspecified';
  if (pin.length < 4 || pin.length > 12) throw new HttpsError('invalid-argument', 'PIN must be 4-12 characters');
  await checkRateLimit(`stepup_${uid}`);

  // Older bcrypt accounts first, then private member/user credentials. The final
  // users/{uid} fallback is migration compatibility only; successful verification
  // moves it into userSecrets and removes it from the readable profile document.
  const q = await db.collection('loginAccounts').where('memberUid', '==', uid).limit(1).get();
  let credential = !q.empty && !q.docs[0].data().disabled ? q.docs[0].data() : null;
  const tripId = request.auth.token?.tripId;
  if (!credential && tripId) {
    const memberSecret = await db.doc(`memberSecrets/${tripId}_${uid}`).get();
    if (memberSecret.exists && !memberSecret.data().disabled && memberSecret.data().pinHash) {
      credential = memberSecret.data();
    }
  }

  const userSecretRef = db.doc(`userSecrets/${uid}`);
  if (!credential) {
    const userSecret = await userSecretRef.get();
    if (userSecret.exists && !userSecret.data().disabled && userSecret.data().pinHash) {
      credential = userSecret.data();
    }
  }

  let legacyUserSnapshot = null;
  if (!credential) {
    const userRef = db.doc(`users/${uid}`);
    const userSnap = await userRef.get();
    if (userSnap.exists && userSnap.data().pinHash) {
      credential = userSnap.data();
      legacyUserSnapshot = userSnap;
    }
  }
  if (!credential || !await verifyStoredMemberPin(pin, credential)) {
    throw new HttpsError('unauthenticated', 'Invalid PIN');
  }

  if (legacyUserSnapshot) {
    const userRef = legacyUserSnapshot.ref;
    const legacy = legacyUserSnapshot.data();
    await db.runTransaction(async (tx) => {
      const [currentUserSnap, privateSnap] = await Promise.all([
        tx.get(userRef),
        tx.get(userSecretRef)
      ]);
      if (!currentUserSnap.exists) throw new HttpsError('failed-precondition', 'User PIN changed; retry');
      const currentUser = currentUserSnap.data();
      for (const field of ['pinHash', 'pinSalt', 'pinIterations', 'pinAlgo']) {
        if ((currentUser[field] ?? null) !== (legacy[field] ?? null)) {
          throw new HttpsError('failed-precondition', 'User PIN changed; retry');
        }
      }
      const privateData = privateSnap.exists ? privateSnap.data() : {};
      const credentialFields = ['pinHash', 'pinSalt', 'pinIterations', 'pinAlgo'];
      if (privateData.pinHash) {
        for (const field of credentialFields) {
          if (Object.prototype.hasOwnProperty.call(privateData, field)
              && Object.prototype.hasOwnProperty.call(currentUser, field)
              && privateData[field] !== currentUser[field]) {
            throw new HttpsError('failed-precondition', 'A conflicting private PIN already exists');
          }
        }
      }
      const moved = {};
      for (const field of credentialFields) {
        if (!Object.prototype.hasOwnProperty.call(privateData, field)
            && Object.prototype.hasOwnProperty.call(currentUser, field)) moved[field] = currentUser[field];
      }
      for (const field of ['lastStepUp', 'lastStepUpAction', 'stepUpExpiry']) {
        if (!Object.prototype.hasOwnProperty.call(privateData, field)
            && Object.prototype.hasOwnProperty.call(currentUser, field)) moved[field] = currentUser[field];
      }
      moved.updatedAt = FieldValue.serverTimestamp();
      tx.set(userSecretRef, moved, { merge: true });
      tx.update(userRef, {
        pinHash: FieldValue.delete(),
        pinSalt: FieldValue.delete(),
        pinIterations: FieldValue.delete(),
        pinAlgo: FieldValue.delete(),
        lastStepUp: FieldValue.delete(),
        lastStepUpAction: FieldValue.delete(),
        stepUpExpiry: FieldValue.delete()
      });
    });
  }

  const expiry = dayjs().add(10, 'minute').toISOString();
  await userSecretRef.set({
    lastStepUp: FieldValue.serverTimestamp(),
    lastStepUpAction: action,
    stepUpExpiry: expiry,
    updatedAt: FieldValue.serverTimestamp()
  }, { merge: true });
  await db.doc(`rateLimits/stepup_${uid}`).delete().catch(() => {});
  return { success: true, sessionExpiry: expiry };
});

export const recalculateItinerarySchedule = onCall(async (request) => {
  const { tripId: rawTripId, items, changedItemId } = request.data || {};
  const tripId = String(rawTripId || '').trim();
  const uid = request.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Auth required');
  if (!isSafeDocumentId(tripId) || !Array.isArray(items) || items.length > 400) {
    throw new HttpsError('invalid-argument', 'A trip and at most 400 itinerary items are required');
  }
  const itemIds = new Set();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || !isSafeDocumentId(item.id) || item.id.length > 128 || itemIds.has(item.id)) {
      throw new HttpsError('invalid-argument', 'Each itinerary item needs a unique, valid document ID');
    }
    itemIds.add(item.id);
  }
  if (changedItemId != null && (typeof changedItemId !== 'string' || !isSafeDocumentId(changedItemId))) {
    throw new HttpsError('invalid-argument', 'Invalid changed itinerary item ID');
  }
  if (!await canEditItinerary(tripId, uid)) throw new HttpsError('permission-denied', 'No itinerary edit permission');

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
