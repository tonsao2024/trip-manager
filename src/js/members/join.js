/**
 * Join a trip with an invite code (free-plan friendly).
 *
 * Member: signs in with Google/email → types the trip code → a request is stored
 * in `trips/{tripId}/joinRequests/{uid}` (plus a mirror in
 * `users/{uid}/joinRequests/{tripId}` so the member can see the status without a
 * collection-group index).
 *
 * Admin: opens Members → approves the request → the member document is created
 * with the member's real uid, `memberUids` gets the uid and Firestore rules give
 * the member access from then on.
 */
import { db, functions, httpsCallable, serverTimestamp } from '../firebase.js';
import { brandPrimary } from '../utils/brand.js';
import {
  collection, doc, getDoc, getDocFromServer, getDocs, getDocsFromServer, setDoc, updateDoc, query, where, limit, writeBatch, runTransaction, arrayUnion
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { normalizeInviteCode, isValidInviteCode } from '../utils/invite.js';
import { isPermissionError } from '../utils/rulesHelper.js';
import { cacheForget } from '../utils/datacache.js';
import { isActionableJoinRequest, isClosedMemberStatus, planMyJoinRequestSync, JOIN_PENDING, JOIN_APPROVED } from '../utils/membershipRepair.js';

/** Keep the Firebase code + cause so the UI can explain *why* it failed. */
function rethrow(e, fallbackTh, fallbackEn = null) {
  if (isPermissionError(e)) {
    const err = new Error('Missing or insufficient permissions.');
    err.code = 'permission-denied';
    err.cause = e;
    throw err;
  }
  const err = new Error(e?.message || fallbackTh || fallbackEn || 'ดำเนินการไม่สำเร็จ');
  err.code = e?.code;
  throw err;
}

const DEFAULT_PERMISSIONS = { canEditItinerary: true, canEditExpense: true, canManageMembers: false };

/** Only the minimal invite preview is public; trip documents are never searched/listed here. */
function invitePreview(data) {
  if (!data?.tripId) return null;
  return {
    id: data.tripId,
    name: data.name || '',
    startDate: data.startDate || '',
    endDate: data.endDate || ''
  };
}

async function lookupInviteOnServer(code) {
  if (!functions) throw new Error('รหัสเชิญนี้ยังไม่ถูกจัดทำดัชนี — ให้ผู้ดูแล deploy Cloud Functions หรือรันสคริปต์ backfill รหัสเชิญ');
  const res = await httpsCallable(functions, 'lookupTripByInviteCode')({ code });
  return invitePreview(res?.data?.trip);
}

/** Find only the name/date preview for a known invite code. */
export async function findTripByInviteCode(code) {
  if (!db) throw new Error('DB not ready');
  if (!isValidInviteCode(code)) throw new Error('รหัสเชิญต้องมี 6 ตัวอักษร');
  const norm = normalizeInviteCode(code);
  try {
    const snap = await getDoc(doc(db, 'publicTripInvites', norm));
    if (snap.exists()) return invitePreview(snap.data());
    // During migration, old trips may not have a safe preview document yet. The
    // callable checks the code server-side and returns only the same preview shape.
    return await lookupInviteOnServer(norm);
  } catch (e) {
    if (isPermissionError(e)) {
      try { return await lookupInviteOnServer(norm); }
      catch (fallbackError) {
        console.warn('findTripByInviteCode server fallback failed', fallbackError?.code, fallbackError?.message);
        rethrow(fallbackError, 'ค้นหาทริปไม่ได้ — ตรวจว่าได้ deploy Cloud Functions และ Firestore Rules ล่าสุดแล้ว');
      }
    }
    console.warn('findTripByInviteCode failed', e?.code, e?.message);
    rethrow(e, 'ค้นหาทริปไม่ได้ — ตรวจสอบรหัสเชิญและอินเทอร์เน็ตอีกครั้ง');
  }
}

/** Check a known trip directly using the caller's actual read permissions. */
export async function getJoinedTrip(tripId, uid) {
  if (!db || !uid || !tripId || tripId === '.' || tripId === '..' || tripId.includes('/')) return null;
  try {
    const snap = await getDocFromServer(doc(db, 'trips', tripId));
    if (!snap.exists()) return null;
    const trip = snap.data();
    if (trip.createdBy === uid) return { ...trip, id: snap.id };
    const listed = Array.isArray(trip.memberUids) && trip.memberUids.includes(uid);
    // A canonical member document can authorize a read even before the index
    // is repaired. Request metadata alone never authorizes a trip.
    const member = await getDocFromServer(doc(db, 'trips', tripId, 'members', uid)).catch(e => {
      if (isPermissionError(e) && listed) return null; // older rules / no member doc
      throw e;
    });
    if (isClosedMemberStatus(member?.data()?.status)) return null;
    return listed || member?.exists() ? { ...trip, id: snap.id } : null;
  } catch (e) {
    if (isPermissionError(e)) return null;
    throw e;
  }
}

export async function isUserAlreadyTripMember(tripId, uid) {
  return Boolean(await getJoinedTrip(tripId, uid));
}

/** Members ask to join; the admin decides. */
export async function requestToJoin(trip, user, { note = '' } = {}) {
  if (!db) throw new Error('DB not ready');
  if (!trip?.id || !user?.uid) throw new Error('ต้องล็อกอินก่อนขอเข้าร่วมทริป');
  const request = {
    uid: user.uid,
    displayName: user.displayName || (user.email ? user.email.split('@')[0] : 'Member'),
    email: user.email || null,
    photoURL: user.photoURL || null,
    tripId: trip.id,
    tripName: trip.name || null,
    note: note || '',
    status: 'pending',
    requestedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  let primarySaved = false;
  try {
    await setDoc(doc(db, 'trips', trip.id, 'joinRequests', user.uid), request, { merge: true });
    primarySaved = true;
  } catch (e) {
    console.warn('join request write failed', e?.code, e?.message);
    // Rules not published yet: still try the member's own mirror and let the UI
    // show the "publish Firestore rules" instructions.
    try {
      await setDoc(doc(db, 'users', user.uid, 'joinRequests', trip.id), request, { merge: true });
      console.warn('join request saved in the member mirror only');
    } catch (mirrorErr) {
      console.warn('join mirror write failed too', mirrorErr?.code, mirrorErr?.message);
      if (isPermissionError(e) || isPermissionError(mirrorErr)) {
        const err = new Error('Missing or insufficient permissions.');
        err.code = 'permission-denied';
        err.cause = e;
        throw err;
      }
      throw new Error(e?.message || 'ส่งคำขอเข้าร่วมไม่สำเร็จ');
    }
  }
  try {
    await setDoc(doc(db, 'users', user.uid, 'joinRequests', trip.id), request, { merge: true });
  } catch (e) {
    // Only used for the "my requests" list — never block joining on it.
    console.warn('join mirror write failed', e?.code, e?.message);
  }
  if (!primarySaved) {
    const err = new Error('Missing or insufficient permissions.');
    err.code = 'permission-denied';
    err.savedLocally = true;
    throw err;
  }
  return request;
}

/**
 * Pending join requests.
 *
 * Deliberately NOT cached: an admin waiting for somebody to tap "ขอเข้าร่วม" must
 * see the request the moment the page opens. It is a single small read, and the
 * members list beside it is still served from cache.
 */
export async function listJoinRequests(tripId) {
  if (!db) throw new Error('DB not ready');
  const snap = await getDocs(collection(db, 'trips', tripId, 'joinRequests'));
  const rows = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  return rows.sort((a, b) => String(b.requestedAt?.seconds || 0).localeCompare(String(a.requestedAt?.seconds || 0)));
}

function invalidateJoins(tripId) {
  cacheForget(`joins:${tripId}`);
  cacheForget(`members:${tripId}`);
}

/** Requests the signed-in user sent (status shown on the trips page). */
export async function listMyJoinRequests(uid) {
  if (!db || !uid) return [];
  const snap = await getDocsFromServer(collection(db, 'users', uid, 'joinRequests'));
  return snap.docs.map(d => ({ ...d.data(), id: d.id }));
}

/** Sync from current server data, never from cached trip cards or mirror status alone. */
export async function syncMyJoinRequests(uid) {
  const report = { created: [], updated: [], denied: [], warnings: [], statuses: new Map(), accessibleTripIds: new Set(), requests: [] };
  if (!db || !uid) return report;
  const mirrors = report.requests = await listMyJoinRequests(uid);
  const primaries = Object.create(null);
  const uncertain = new Set();
  const joined = report.accessibleTripIds;
  const noteFailure = (tripId, e) => {
    uncertain.add(tripId);
    report.denied.push({ tripId, code: e?.code || null, permission: isPermissionError(e) });
  };
  await Promise.all(mirrors.map(async ({ id: tripId }) => {
    const ref = doc(db, 'trips', tripId, 'joinRequests', uid);
    const [trip, primary] = await Promise.allSettled([getJoinedTrip(tripId, uid), getDocFromServer(ref)]);
    if (trip.status === 'fulfilled' && trip.value) joined.add(tripId);
    else if (trip.status === 'rejected') noteFailure(tripId, trip.reason);
    if (primary.status === 'fulfilled') primaries[tripId] = primary.value.data();
    else if (!joined.has(tripId)) noteFailure(tripId, primary.reason);
  }));

  const plan = planMyJoinRequestSync({ mirrors, primaries, joinedTripIds: [...joined], deniedTripIds: [...uncertain] });
  for (const { tripId, request } of plan.create) {
    const ref = doc(db, 'trips', tripId, 'joinRequests', uid);
    try {
      // A request may have been approved or declined between our read and this
      // repair. Never turn a decision back into pending.
      const created = await runTransaction(db, async tx => {
        const current = await tx.get(ref);
        if (current.exists()) {
          return { created: false, status: current.data().status };
        }
        tx.set(ref, {
          uid,
          tripId,
          displayName: request.displayName || '',
          email: request.email || null,
          photoURL: request.photoURL || null,
          tripName: request.tripName || null,
          note: request.note || '',
          status: JOIN_PENDING,
          requestedAt: request.requestedAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
          repairedFromMirror: true
        });
        return { created: true, status: JOIN_PENDING };
      });
      primaries[tripId] = { status: created.status };
      if (created.created) report.created.push(tripId);
    } catch (e) { noteFailure(tripId, e); }
  }
  for (const { tripId, status } of plan.update) {
    try {
      await updateDoc(doc(db, 'users', uid, 'joinRequests', tripId), { status, updatedAt: serverTimestamp() });
      report.updated.push(tripId);
    } catch (e) { report.warnings.push(`${tripId}: ${e?.code || e?.message || e}`); }
  }
  for (const mirror of mirrors) {
    const tripId = mirror.id;
    const primary = primaries[tripId];
    const status = joined.has(tripId) || primary?.status === JOIN_APPROVED ? JOIN_APPROVED
      : primary?.status === 'rejected' ? 'rejected' : primary ? JOIN_PENDING : 'unverified';
    report.statuses.set(tripId, status);
  }
  return report;
}

export async function cancelJoinRequest(tripId, uid) {
  if (!db) throw new Error('DB not ready');
  try {
    const ref = doc(db, 'trips', tripId, 'joinRequests', uid);
    await runTransaction(db, async tx => {
      const current = await tx.get(ref);
      if (current.data()?.status === JOIN_APPROVED) throw new Error('คำขอนี้อนุมัติแล้ว — ตรวจคำขอและรายการทริปอีกครั้ง');
      if (current.exists()) tx.delete(ref);
      tx.delete(doc(db, 'users', uid, 'joinRequests', tripId));
    });
    invalidateJoins(tripId);
  } catch (e) {
    console.warn('cancelJoinRequest failed', e?.code, e?.message);
    rethrow(e, 'ยกเลิกคำขอไม่สำเร็จ');
  }
}

/**
 * Approve a request: create the member doc keyed by the member's own uid so the
 * Firestore rules (`members/{request.auth.uid}` + `memberUids`) let them in.
 */
export async function approveJoinRequest(tripId, request, { role = 'member', permissions = DEFAULT_PERMISSIONS } = {}) {
  return grantTripMembership(tripId, request, role, permissions, true);
}

async function grantTripMembership(tripId, request, role, permissions, recordApproval) {
  if (!db) throw new Error('DB not ready');
  const uid = request.id || request.uid;
  if (!uid || typeof uid !== 'string' || uid.includes('/') || uid.length > 128) {
    throw new Error('คำขอไม่ถูกต้อง (uid ไม่ถูกต้อง)');
  }
  try {
    const out = await approveJoinRequestInner(tripId, uid, request, role, permissions, recordApproval);
    invalidateJoins(tripId);
    return out;
  } catch (e) {
    rethrow(e, 'อนุมัติสมาชิกไม่สำเร็จ');
  }
}

async function approveJoinRequestInner(tripId, uid, request, role, permissions, recordApproval) {
  const tripRef = doc(db, 'trips', tripId);

  // Create membership and update the trip index atomically. Co-admin Rules permit
  // this paired change but reject an unpaired memberUids write.
  const writeMembership = (writer, profile) => {
    writer.set(doc(db, 'trips', tripId, 'members', uid), {
      uid,
      displayName: profile.displayName || 'Member',
      email: profile.email || null,
      photoURL: profile.photoURL || null,
      role,
      status: 'active',
      authType: 'account',
      loginReady: true,
      permissions,
      color: profile.color || brandPrimary(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      addedFrom: 'join-request'
    }, { merge: true });
    writer.update(tripRef, { memberUids: arrayUnion(uid), updatedAt: serverTimestamp() });
  };
  if (recordApproval) {
    const requestRef = doc(db, 'trips', tripId, 'joinRequests', uid);
    // Keep the decision readable to the requester, and commit it with access.
    await runTransaction(db, async tx => {
      const current = await tx.get(requestRef);
      if (!current.exists() || !isActionableJoinRequest(current.data())) {
        throw new Error('คำขอนี้ไม่อยู่ในคิวแล้ว — กรุณารีเฟรชคำขอ');
      }
      writeMembership(tx, current.data());
      tx.update(requestRef, {
        status: JOIN_APPROVED, resolvedAt: serverTimestamp(), updatedAt: serverTimestamp()
      });
    });
  } else {
    const batch = writeBatch(db);
    writeMembership(batch, request);
    await batch.commit();
  }

  return { uid, role, permissions };
}

export async function rejectJoinRequest(tripId, request, { reason = '' } = {}) {
  const uid = request.id || request.uid;
  try {
    const ref = doc(db, 'trips', tripId, 'joinRequests', uid);
    await runTransaction(db, async tx => {
      const current = await tx.get(ref);
      if (!current.exists() || !isActionableJoinRequest(current.data())) {
        throw new Error('คำขอนี้ไม่อยู่ในคิวแล้ว — กรุณารีเฟรชคำขอ');
      }
      tx.update(ref, { status: 'rejected', reason, resolvedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    });
    invalidateJoins(tripId);
  } catch (e) {
    console.warn('rejectJoinRequest failed', e?.code, e?.message);
    rethrow(e, 'ปฏิเสธคำขอไม่สำเร็จ');
  }
}

/** Admin-side: add somebody directly by their account email. */
export async function addMemberFromProfile(tripId, profile, { role = 'member', permissions = DEFAULT_PERMISSIONS } = {}) {
  return grantTripMembership(tripId, {
    uid: profile.id || profile.uid,
    displayName: profile.displayName,
    email: profile.email,
    photoURL: profile.photoURL
  }, role, permissions, false);
}
