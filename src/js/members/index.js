// Members — list / create / update / delete.
// Creating a member first tries the `createMemberAccount` Cloud Function (username + PIN login).
// If Functions are not deployed (the classic "internal" error) it falls back to writing the
// member document straight to Firestore so the group can still split expenses.
import { db, functions, serverTimestamp } from '../firebase.js';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, limit, writeBatch, arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { addMemberUidToTrip, removeMemberUidFromTrip } from '../trips/index.js';

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

  // 1) Preferred path — Cloud Function creates a real login account
  if (functions && data.pin) {
    try {
      const { httpsCallable } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js');
      const fn = httpsCallable(functions, 'createMemberAccount');
      const res = await fn({
        tripId,
        username,
        pin: data.pin,
        displayName,
        role: data.role || 'member',
        photoURL: data.photoURL || null,
        color: data.color || '#8bb89a',
        permissions: data.permissions || undefined
      });
      const uid = res?.data?.memberUid;
      if (uid) {
        try {
          await updateDoc(doc(db, `trips/${tripId}/members`, uid), {
            order,
            photoURL: data.photoURL || '',
            updatedAt: serverTimestamp()
          });
        } catch {}
        const member = await getMember(tripId, uid);
        return { id: uid, mode: 'account', member };
      }
    } catch (err) {
      console.warn('[Members] createMemberAccount failed → local fallback:', err?.code || err?.message);
      if (/already-exists|username taken|ซ้ำ/i.test(String(err?.code || '') + String(err?.message || ''))) {
        throw new Error('ชื่อผู้ใช้นี้ถูกใช้แล้ว — ลองชื่ออื่น');
      }
      if (!isFunctionUnavailable(err)) throw new Error(mapFunctionError(err));
      onNotice?.('ไม่สามารถสร้างบัญชีล็อกอินได้ (Cloud Functions ไม่พร้อม) — เพิ่มสมาชิกแบบไม่ใช้ล็อกอินให้แล้ว');
    }
  }

  // 2) Fallback — plain member document (no login), still usable for splitting
  const id = autoId('mb');
  const payload = buildMemberDoc({ ...data, order });
  await setDoc(doc(db, `trips/${tripId}/members`, id), {
    uid: id,
    ...payload,
    authType: 'local',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  await addMemberUidToTrip(tripId, id);
  return { id, mode: 'local', member: { id, uid: id, ...payload } };
}

export async function updateMember(tripId, memberId, updates) {
  const payload = { ...updates };
  if (payload.displayName != null) payload.displayName = String(payload.displayName).trim() || 'Member';
  if (payload.username != null) payload.username = String(payload.username).trim().toLowerCase();
  await updateDoc(doc(db, `trips/${tripId}/members`, memberId), { ...payload, updatedAt: serverTimestamp() });
}

/**
 * Delete a member. Expenses that reference the member are kept (history) but the
 * member disappears from pickers. Set `removeFromTrips` to also drop the uid array entry.
 */
export async function deleteMember(tripId, memberId, { uid = null } = {}) {
  const docId = memberId;
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
