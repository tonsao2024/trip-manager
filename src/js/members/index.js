// Members — list / create / update / delete.
// Member accounts are created entirely in the browser: the PIN is hashed with
// PBKDF2-SHA256 and stored on the member document, plus a public username → trip
// lookup so the login page can find the member without Cloud Functions.
// (The old `createMemberAccount` function returned "internal" on projects where
// functions were never deployed — login then broke completely.)
import { db, functions, serverTimestamp } from '../firebase.js';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, limit, writeBatch, arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { addMemberUidToTrip, removeMemberUidFromTrip } from '../trips/index.js';
import { setMemberPin, publishMemberLookup, unpublishMemberLookup, normalizeUsername } from '../auth/memberAuth.js';

export const MEMBER_ROLES = [
  { id: 'trip_admin', th: 'ผู้ดูแลทริป', en: 'Trip admin', icon: 'shield-check' },
  { id: 'member', th: 'สมาชิก', en: 'Member', icon: 'user' },
  { id: 'viewer', th: 'ดูอย่างเดียว', en: 'Viewer', icon: 'eye' }
];

let counter = 0;
function autoId(prefix = 'm') {
  counter = (counter + 1) % 100000;
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${counter.toString(36)}`;
}

export async function listMembers(tripId) {
  if (!db) throw new Error('DB not ready');
  const snap = await getDocs(collection(db, `trips/${tripId}/members`));
  const members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  members.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.displayName || '').localeCompare(String(b.displayName || '')));
  return members;
}

export async function getMember(tripId, memberId) {
  const snap = await getDoc(doc(db, `trips/${tripId}/members`, memberId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function buildMemberDoc({ displayName, username = '', role = 'member', color = '#8bb89a', photoURL = '', permissions, order = 999, createdByName = '' }) {
  return {
    displayName: displayName || username || 'Member',
    username: (username || '').trim().toLowerCase(),
    role,
    status: 'active',
    color,
    avatar: '',
    photoURL: photoURL || '',
    permissions: permissions || {
      canEditItinerary: role !== 'viewer',
      canEditExpense: role !== 'viewer',
      canManageMembers: role === 'trip_admin'
    },
    order,
    createdByName
  };
}

/** Errors that mean "the backend function is unavailable / broken" → use local fallback. */
function isFunctionUnavailable(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  return /internal|unavailable|not-found|not found|failed-precondition|unimplemented|permission-denied|functions\//i.test(code + ' ' + msg)
    || /internal/i.test(msg);
}

/**
 * Create a member.
 * @returns {{id:string, mode:'account'|'local', member:object}}
 */
export async function createMember(tripId, data, { order = 999, onNotice } = {}) {
  const displayName = (data.displayName || '').trim();
  const username = (data.username || '').trim();
  if (!displayName && !username) throw new Error('กรุณากรอกชื่อสมาชิก');
  if (username && !/^[a-zA-Z0-9_.@-]{3,32}$/.test(username)) {
    throw new Error('ชื่อผู้ใช้ต้องเป็น a-z 0-9 _ . - และยาว 3-32 ตัวอักษร');
  }
  if (data.pin && (data.pin.length < 4 || data.pin.length > 12)) throw new Error('PIN ต้อง 4-12 ตัวอักษร');
  if (username) {
    const existing = await findMemberByUsername(tripId, username);
    if (existing) throw new Error('ชื่อผู้ใช้นี้ถูกใช้แล้วในทริปนี้ — ลองชื่ออื่น');
  }

  /* 1) Local-first: create the member document and store the hashed PIN on it.
   *    This always works (no Cloud Functions required) and enables member login. */
  const id = autoId('mb');
  const payload = buildMemberDoc({ ...data, order });
  const canLogin = Boolean(username && data.pin);
  await setDoc(doc(db, `trips/${tripId}/members`, id), {
    uid: id,
    ...payload,
    authType: 'pin',
    loginReady: canLogin,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: data.createdBy || null
  });
  await addMemberUidToTrip(tripId, id);

  if (canLogin) {
    try {
      await setMemberPin(tripId, id, data.pin);
      await publishMemberLookup(username, tripId, id);
    } catch (e) {
      console.warn('[Members] PIN setup failed:', e?.message);
      onNotice?.(e.message || 'ตั้ง PIN ไม่สำเร็จ — แก้ไขสมาชิกเพื่อตั้ง PIN อีกครั้ง');
      return { id, mode: 'local', member: { id, uid: id, ...payload, loginReady: false } };
    }
  }

  /* 2) Optional: if Cloud Functions are deployed, also mirror a real Auth account
   *    so the member can sign in with Firebase Auth (nice-to-have, never required). */
  if (canLogin && functions) {
    try {
      const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js');
      const fn = httpsCallable(functions, 'createMemberAccount');
      const res = await fn({
        tripId, username, pin: data.pin, displayName,
        role: data.role || 'member',
        photoURL: data.photoURL || null,
        color: data.color || '#8bb89a',
        permissions: data.permissions || undefined
      });
      if (res?.data?.memberUid) {
        await updateDoc(doc(db, `trips/${tripId}/members`, id), { authUid: res.data.memberUid, authType: 'pin+auth' }).catch(() => {});
      }
    } catch (err) {
      // Silent by design: the local account already works, so the user sees no error.
      console.warn('[Members] optional Cloud Function mirror skipped:', err?.code || err?.message);
    }
  }

  return { id, mode: canLogin ? 'pin' : 'local', member: { id, uid: id, ...payload } };
}

/** Is this username already used inside the trip? */
async function findMemberByUsername(tripId, username) {
  const norm = normalizeUsername(username);
  if (!norm) return null;
  try {
    const snap = await getDocs(query(collection(db, `trips/${tripId}/members`), where('username', '==', norm), limit(1)));
    return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch (e) {
    console.warn('[Members] username check failed', e?.code || e?.message);
    return null;
  }
}

export async function updateMember(tripId, memberId, updates, { pin = null } = {}) {
  const payload = { ...updates };
  if (payload.displayName != null) payload.displayName = String(payload.displayName).trim() || 'Member';
  if (payload.username != null) payload.username = normalizeUsername(payload.username);

  const previous = await getMember(tripId, memberId).catch(() => null);

  await updateDoc(doc(db, `trips/${tripId}/members`, memberId), { ...payload, updatedAt: serverTimestamp() });

  // Username changed → move the login lookup to the new name
  const newUsername = payload.username;
  if (newUsername && previous?.username && previous.username !== newUsername) {
    await unpublishMemberLookup(previous.username);
    try { await publishMemberLookup(newUsername, tripId, memberId); } catch (e) { console.warn('[Members] lookup move failed', e?.message); }
  }

  // New PIN supplied → re-hash and (re)enable login
  if (pin) {
    if (pin.length < 4 || pin.length > 12) throw new Error('PIN ต้อง 4-12 ตัวอักษร');
    const username = newUsername || previous?.username;
    if (!username) throw new Error('ต้องมีชื่อผู้ใช้ก่อนจึงจะตั้ง PIN ได้');
    await setMemberPin(tripId, memberId, pin);
    await publishMemberLookup(username, tripId, memberId);
  }
  return true;
}

/**
 * Delete a member. Expenses that reference the member are kept (history) but the
 * member disappears from pickers. Set `removeFromTrips` to also drop the uid array entry.
 */
export async function deleteMember(tripId, memberId, { uid = null } = {}) {
  const docId = memberId;
  const member = await getMember(tripId, docId).catch(() => null);
  if (member?.username) await unpublishMemberLookup(member.username);
  await deleteDoc(doc(db, `trips/${tripId}/members`, docId));
  await removeMemberUidFromTrip(tripId, uid || docId);
  return true;
}

export async function reorderMembers(tripId, ids, userId) {
  const batch = writeBatch(db);
  ids.forEach((id, idx) => {
    batch.update(doc(db, `trips/${tripId}/members`, id), { order: idx, updatedBy: userId, updatedAt: serverTimestamp() });
  });
  await batch.commit();
}

export async function countMemberReferences(tripId, memberId) {
  const result = { expensesPaid: 0, expensesShared: 0, itemsEstimated: 0 };
  try {
    const exps = await getDocs(query(collection(db, `trips/${tripId}/expenses`), limit(300)));
    exps.docs.forEach(d => {
      const data = d.data();
      if (data.payerId === memberId) result.expensesPaid++;
      if ((data.allocations || []).some(a => a.memberId === memberId && a.amountMinor)) result.expensesShared++;
    });
    const items = await getDocs(query(collection(db, `trips/${tripId}/itineraryItems`), limit(300)));
    items.docs.forEach(d => {
      const data = d.data();
      if (data.estimatePayerId === memberId || (data.estimateShareWith || []).includes(memberId)) result.itemsEstimated++;
    });
  } catch (e) {
    console.warn('[Members] reference count failed', e?.message);
  }
  return result;
}

export function mapFunctionError(err) {
  const code = String(err?.code || '');
  const msg = String(err?.message || '');
  if (code.includes('internal')) {
    return 'Cloud Function แจ้งข้อผิดพลาดภายใน (internal) — มักเกิดจากยังไม่ deploy functions หรือ service account ไม่พร้อม';
  }
  if (code.includes('unauthenticated')) return 'กรุณาเข้าสู่ระบบใหม่';
  if (code.includes('permission-denied')) return 'ไม่มีสิทธิ์เพิ่มสมาชิก — ต้องเป็นผู้ดูแลทริป';
  if (code.includes('already-exists')) return 'ชื่อผู้ใช้นี้ถูกใช้แล้ว';
  if (code.includes('not-found')) return 'ไม่พบ Cloud Function createMemberAccount — ต้อง deploy functions ก่อน';
  return msg || 'เพิ่มสมาชิกไม่สำเร็จ';
}
