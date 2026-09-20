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
import { db, serverTimestamp } from '../firebase.js';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, limit
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { normalizeInviteCode, isValidInviteCode } from '../utils/invite.js';
import { isPermissionError } from '../utils/rulesHelper.js';

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

/** Find a trip by the code the admin shared. */
export async function findTripByInviteCode(code) {
  if (!db) throw new Error('DB not ready');
  if (!isValidInviteCode(code)) throw new Error('รหัสเชิญต้องมี 6 ตัวอักษร');
  const norm = normalizeInviteCode(code);
  try {
    const snap = await getDocs(query(collection(db, 'trips'), where('inviteCode', '==', norm), limit(1)));
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
  } catch (e) {
    console.warn('findTripByInviteCode failed', e?.code, e?.message);
    // A permission error here means the rules do not allow listing trips yet.
    rethrow(e, 'ค้นหาทริปไม่ได้ — ตรวจสอบรหัสเชิญและอินเทอร์เน็ตอีกครั้ง');
  }
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

export async function listJoinRequests(tripId) {
  if (!db) throw new Error('DB not ready');
  const snap = await getDocs(collection(db, 'trips', tripId, 'joinRequests'));
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return rows.sort((a, b) => String(b.requestedAt?.seconds || 0).localeCompare(String(a.requestedAt?.seconds || 0)));
}

/** Requests the signed-in user sent (status shown on the trips page). */
export async function listMyJoinRequests(uid) {
  if (!db || !uid) return [];
  try {
    const snap = await getDocs(collection(db, 'users', uid, 'joinRequests'));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('listMyJoinRequests failed', e?.code, e?.message);
    return [];
  }
}

export async function cancelJoinRequest(tripId, uid) {
  if (!db) throw new Error('DB not ready');
  try {
    await deleteDoc(doc(db, 'trips', tripId, 'joinRequests', uid));
    await deleteDoc(doc(db, 'users', uid, 'joinRequests', tripId));
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
  if (!db) throw new Error('DB not ready');
  const uid = request.uid || request.id;
  if (!uid) throw new Error('คำขอไม่ถูกต้อง (ไม่มี uid)');
  try {
    return await approveJoinRequestInner(tripId, uid, request, role, permissions);
  } catch (e) {
    rethrow(e, 'อนุมัติสมาชิกไม่สำเร็จ');
  }
}

async function approveJoinRequestInner(tripId, uid, request, role, permissions) {
  // 1) member document — the id MUST be the member's uid (rules check it)
  await setDoc(doc(db, 'trips', tripId, 'members', uid), {
    uid,
    displayName: request.displayName || 'Member',
    email: request.email || null,
    photoURL: request.photoURL || null,
    role,
    status: 'active',
    authType: 'account',
    loginReady: true,
    permissions,
    color: request.color || '#8bb89a',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    addedFrom: 'join-request'
  }, { merge: true });

  // 2) trip.memberUids drives the rules on /trips/{tripId}
  const tripRef = doc(db, 'trips', tripId);
  const tripSnap = await getDoc(tripRef);
  const uids = new Set(tripSnap.exists() ? (tripSnap.data().memberUids || []) : []);
  uids.add(uid);
  await updateDoc(tripRef, { memberUids: [...uids], updatedAt: serverTimestamp() });

  // 3) clean up the request + mirror (the mirror belongs to the member, so a
  //    denial there is harmless — the member's list filters approved trips).
  try {
    await deleteDoc(doc(db, 'trips', tripId, 'joinRequests', uid));
  } catch (e) {
    console.warn('cleanup request failed', e?.code, e?.message);
  }
  try {
    await deleteDoc(doc(db, 'users', uid, 'joinRequests', tripId));
  } catch (e) {
    console.warn('cleanup mirror failed (member-owned)', e?.code, e?.message);
  }

  return { uid, role, permissions };
}

export async function rejectJoinRequest(tripId, request, { reason = '' } = {}) {
  const uid = request.uid || request.id;
  try {
    await updateDoc(doc(db, 'trips', tripId, 'joinRequests', uid), {
      status: 'rejected', reason, updatedAt: serverTimestamp()
    });
    await setDoc(doc(db, 'users', uid, 'joinRequests', tripId), {
      ...request, tripId, uid, status: 'rejected', reason, updatedAt: serverTimestamp()
    }, { merge: true });
  } catch (e) {
    console.warn('rejectJoinRequest failed', e?.code, e?.message);
    rethrow(e, 'ปฏิเสธคำขอไม่สำเร็จ');
  }
}

/** Admin-side: add somebody directly by their account email. */
export async function addMemberFromProfile(tripId, profile, { role = 'member', permissions = DEFAULT_PERMISSIONS } = {}) {
  return approveJoinRequest(tripId, {
    uid: profile.id || profile.uid,
    displayName: profile.displayName,
    email: profile.email,
    photoURL: profile.photoURL
  }, { role, permissions });
}
