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
  collection, doc, getDoc, getDocFromServer, getDocs, setDoc, updateDoc, deleteDoc, query, where, limit,
  writeBatch, arrayUnion
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { normalizeInviteCode, isValidInviteCode } from '../utils/invite.js';
import { isPermissionError } from '../utils/rulesHelper.js';
import { cacheForget } from '../utils/datacache.js';
import { planMyJoinRequestSync, JOIN_PENDING, JOIN_APPROVED } from '../utils/membershipRepair.js';

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

/** The full trip is read only when the caller is already an authorized member. */
export async function isUserAlreadyTripMember(tripId, uid) {
  if (!db || !tripId || !uid) return false;
  try {
    const snap = await getDoc(doc(db, 'trips', tripId));
    if (!snap.exists()) return false;
    const trip = snap.data();
    return trip.createdBy === uid || (Array.isArray(trip.memberUids) && trip.memberUids.includes(uid));
  } catch (e) {
    if (isPermissionError(e)) return false;
    throw e;
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
  // Remember the attempt on this device BEFORE writing: whether or not the
  // trip-side queue accepts it, the member can later re-check access to this
  // trip by id (see listJoinTargets) instead of being told their list is broken.
  rememberJoinTarget(user.uid, trip.id);
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
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return rows.sort((a, b) => String(b.requestedAt?.seconds || 0).localeCompare(String(a.requestedAt?.seconds || 0)));
}

function invalidateJoins(tripId) {
  cacheForget(`joins:${tripId}`);
  cacheForget(`members:${tripId}`);
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

/* ------------------------------------------------------------------ *
 * “Trips I asked to join” — the account's own memory of join attempts
 *
 * The trip list normally finds a trip through `trips.memberUids`, through the
 * `createdBy` index, or through this account's member documents (collection
 * group). All three need something the server may not have yet: an entry in the
 * array, an index, a published rule. When all three come back empty the member
 * is shown an error even though the admin DID approve them — the member
 * document exists and the trip is readable by id.
 *
 * The one source that is always available is the account's own record of “I
 * asked to join this trip”: the private mirror `users/{uid}/joinRequests/{id}`
 * (owner-only by rules, so the admin's cleanup is denied and it survives) plus a
 * small on-device list, which survives a deleted mirror. `listTrips` uses it as
 * the last resort: read those trips by id — the rules allow it exactly when the
 * membership is real — and repair the missing array entry.
 * ------------------------------------------------------------------ */
const JOIN_TARGET_KEY = 'fuji_join_targets';
const JOIN_TARGET_LIMIT = 20;

const safeTripId = (value) => {
  const id = String(value || '').trim();
  return id && !id.includes('/') && id.length <= 200 ? id : '';
};

/** Trip ids this device remembers asking to join (most recent first). */
export function rememberedJoinTargets(uid) {
  if (!uid) return [];
  try {
    const raw = JSON.parse(localStorage.getItem(JOIN_TARGET_KEY) || '{}');
    const list = raw?.[uid];
    return Array.isArray(list) ? list.map(safeTripId).filter(Boolean) : [];
  } catch { return []; }
}

function writeRememberedJoinTargets(uid, ids) {
  if (!uid) return;
  try {
    const raw = JSON.parse(localStorage.getItem(JOIN_TARGET_KEY) || '{}');
    raw[uid] = [...new Set(ids.map(safeTripId).filter(Boolean))].slice(0, JOIN_TARGET_LIMIT);
    localStorage.setItem(JOIN_TARGET_KEY, JSON.stringify(raw));
  } catch {}
}

/** Remember that this account asked to join a trip (called by requestToJoin). */
export function rememberJoinTarget(uid, tripId) {
  const id = safeTripId(tripId);
  if (!uid || !id) return;
  writeRememberedJoinTargets(uid, [id, ...rememberedJoinTargets(uid)]);
}

/** Forget it again — the member cancelled, or the trip is visible now. */
export function forgetJoinTarget(uid, tripId) {
  const id = safeTripId(tripId);
  if (!uid || !id) return;
  writeRememberedJoinTargets(uid, rememberedJoinTargets(uid).filter(entry => entry !== id));
}

/**
 * Every trip id this account may already belong to, taken from the two places
 * only its owner can read/write: the request mirrors and the on-device list.
 * Never throws — a missing mirror must not break the trip list.
 */
export async function listJoinTargets(uid) {
  if (!uid) return [];
  const out = new Set(rememberedJoinTargets(uid));
  let mirrors = [];
  try { mirrors = await listMyJoinRequests(uid); } catch (e) {
    console.warn('join target mirrors unavailable', e?.code || e?.message);
  }
  for (const row of mirrors) {
    const id = safeTripId(row?.tripId) || safeTripId(row?.id);
    if (id) out.add(id);
  }
  return [...out];
}

/**
 * Re-connect THIS account's private request mirrors with the admin's queue.
 *
 * `requestToJoin` writes two documents: the trip-side queue (what the admin
 * reads) and `users/{uid}/joinRequests/{tripId}` (what the member sees). When
 * the first write was denied by older rules (or dropped offline), only the
 * mirror survives: the member keeps seeing "รอแอดมินอนุมัติ" while the admin's
 * queue is empty. Firestore rules deliberately let only the owner read/write
 * that mirror, so the admin cannot sweep it — this member-side sync must do it.
 *
 * Also clears mirrors for trips the account can already see, including the
 * "approved but mirror cleanup was denied" case. Idempotent and read-fresh:
 * a denied trip-side read is reported, never guessed at.
 */
export async function syncMyJoinRequests(uid, { joinedTripIds = [] } = {}) {
  const report = { created: [], resolved: [], updated: [], cleared: [], denied: [], warnings: [] };
  if (!db || !uid) return report;
  let mirrors = [];
  try {
    mirrors = await listMyJoinRequests(uid);
  } catch (e) {
    report.warnings.push(e?.message || 'mirror read failed');
    return report;
  }
  if (!mirrors.length) return report;

  const primaries = {};
  const deniedTripIds = [];
  await Promise.all(mirrors.map(async (mirror) => {
    const tripId = String(mirror?.tripId || mirror?.id || '').trim();
    if (!tripId || tripId.includes('/')) return;
    try {
      const snap = await getDoc(doc(db, 'trips', tripId, 'joinRequests', uid));
      if (snap.exists()) primaries[tripId] = { ...snap.data() };
    } catch (e) {
      // Can't tell whether a primary exists — never overwrite or recreate it.
      deniedTripIds.push(tripId);
      report.denied.push({ tripId, code: e?.code || null, permission: isPermissionError(e) });
    }
  }));

  const plan = planMyJoinRequestSync({ mirrors, primaries, joinedTripIds, deniedTripIds });
  for (const { tripId, request } of plan.create) {
    try {
      await setDoc(doc(db, 'trips', tripId, 'joinRequests', uid), {
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
      }, { merge: true });
      report.created.push(tripId);
    } catch (e) {
      if (isPermissionError(e)) report.denied.push({ tripId, code: e?.code || null, permission: true });
      else report.warnings.push(`${tripId}: ${e?.message || e}`);
    }
  }
  for (const { tripId } of plan.resolve) {
    try {
      await updateDoc(doc(db, 'trips', tripId, 'joinRequests', uid), {
        status: JOIN_APPROVED, updatedAt: serverTimestamp(), resolvedBy: 'member-sync'
      });
      report.resolved.push(tripId);
    } catch (e) {
      report.warnings.push(`${tripId}: ${e?.message || e}`);
    }
  }
  for (const { tripId } of plan.clear) {
    try {
      await deleteDoc(doc(db, 'users', uid, 'joinRequests', tripId));
      report.cleared.push(tripId);
    } catch (e) {
      report.warnings.push(`${tripId}: ${e?.message || e}`);
    }
  }
  for (const { tripId, status } of plan.update) {
    try {
      await setDoc(doc(db, 'users', uid, 'joinRequests', tripId), {
        status, updatedAt: serverTimestamp()
      }, { merge: true });
      report.updated.push(tripId);
    } catch (e) {
      report.warnings.push(`${tripId}: ${e?.message || e}`);
    }
  }
  return report;
}

export async function cancelJoinRequest(tripId, uid) {
  if (!db) throw new Error('DB not ready');
  try {
    await deleteDoc(doc(db, 'trips', tripId, 'joinRequests', uid));
    await deleteDoc(doc(db, 'users', uid, 'joinRequests', tripId));
    forgetJoinTarget(uid, tripId);
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
  if (!db) throw new Error('DB not ready');
  const uid = request.uid || request.id;
  if (!uid || typeof uid !== 'string' || uid.includes('/') || uid.length > 128) {
    throw new Error('คำขอไม่ถูกต้อง (uid ไม่ถูกต้อง)');
  }
  try {
    const out = await approveJoinRequestInner(tripId, uid, request, role, permissions);
    invalidateJoins(tripId);
    return out;
  } catch (e) {
    rethrow(e, 'อนุมัติสมาชิกไม่สำเร็จ');
  }
}

async function approveJoinRequestInner(tripId, uid, request, role, permissions) {
  const tripRef = doc(db, 'trips', tripId);
  // Read the SERVER copy: the trip list of the member reads `memberUids`, so the
  // membership index must be written against the real document, never against a
  // cached copy (which may already list — or already have lost — this uid).
  const tripSnap = await getDocFromServer(tripRef);
  if (!tripSnap.exists()) throw new Error('Trip not found');

  // Create membership and update the trip index atomically. Co-admin Rules permit
  // this paired change but reject an unpaired memberUids write.
  const batch = writeBatch(db);
  batch.set(doc(db, 'trips', tripId, 'members', uid), {
    uid,
    displayName: request.displayName || 'Member',
    email: request.email || null,
    photoURL: request.photoURL || null,
    role,
    status: 'active',
    authType: 'account',
    loginReady: true,
    permissions,
    color: request.color || brandPrimary(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    addedFrom: 'join-request'
  }, { merge: true });
  // ALWAYS write the array entry, even when the (possibly cached) trip already
  // contains the uid. `arrayUnion` is idempotent, so this cannot duplicate an
  // entry — while skipping the write whenever the trip *looked* right is exactly
  // how an approved member ended up with a member document and no listing: the
  // admin sees them in สมาชิก, the member's trip list finds nothing.
  batch.update(tripRef, { memberUids: arrayUnion(uid), updatedAt: serverTimestamp() });
  await batch.commit();

  // Confirm from the server that the listing really landed. A member whose uid
  // is not in `memberUids` cannot find the trip (and older rules could drop the
  // paired write), so the admin is told instead of a silent “approved”.
  const listed = await tripListsMember(tripId, uid);

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

  return { uid, role, permissions, listed };
}

/**
 * Does the trip's `memberUids` array list this uid, according to the server?
 * Used right after an approval (never to decide access) — when the answer is
 * “no”, the admin gets a warning instead of a success message.
 */
export async function tripListsMember(tripId, uid) {
  if (!db || !tripId || !uid) return false;
  try {
    const snap = await getDocFromServer(doc(db, 'trips', tripId));
    const uids = snap.data()?.memberUids;
    return Array.isArray(uids) && uids.includes(uid);
  } catch (e) {
    console.warn('could not verify the trip listing', e?.code || e?.message);
    return false;
  }
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
    invalidateJoins(tripId);
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
