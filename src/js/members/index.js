import { expensePayments } from '../utils/payments.js';
// Members — list / create / update / delete.
// PIN hashes and username lookup records are managed by server callables only.
import { db, serverTimestamp } from '../firebase.js';
import { brandPrimary } from '../utils/brand.js';
import {
  collection, doc, getDoc, getDocs, getDocsFromServer, updateDoc, query, where, limit, writeBatch, arrayUnion, arrayRemove
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { cachedRead, cacheInvalidate, cacheForget, seedFromPersist, persistSet, persistDelete } from '../utils/datacache.js';
import { setMemberPin, publishMemberLookup, clearMemberPin, normalizeUsername } from '../auth/memberAuth.js';

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

/** Drop the cached member list (called by every member write + permissions). */
export function invalidateMembers(tripId) {
  cacheForget(`members:${tripId}`);
  cacheForget(`joins:${tripId}`);
  persistDelete(`members:${tripId}`);
}

async function loadMembersUncached(tripId, { fromServer = false } = {}) {
  const ref = collection(db, `trips/${tripId}/members`);
  const snap = await (fromServer ? getDocsFromServer(ref) : getDocs(ref));
  const members = snap.docs.map(d => ({ ...d.data(), id: d.id }));
  members.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.displayName || '').localeCompare(String(b.displayName || '')));
  return members;
}

export async function listMembers(tripId, { fresh = false } = {}) {
  if (!db) throw new Error('DB not ready');
  const key = `members:${tripId}`;
  if (fresh) { cacheForget(key); persistDelete(key); }
  else seedFromPersist(key);
  const members = await cachedRead(key, () => loadMembersUncached(tripId, { fromServer: fresh }), { maxAgeMs: 5 * 60 * 1000 });
  persistSet(key, members);
  return members;
}

export async function getMember(tripId, memberId) {
  const cached = await listMembers(tripId).catch(() => null);
  const hit = cached?.find(m => m.id === memberId);
  if (hit) return hit;
  const snap = await getDoc(doc(db, `trips/${tripId}/members`, memberId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export function buildMemberDoc({ displayName, username = '', role = 'member', color = brandPrimary(), photoURL = '', permissions, order = 999, createdByName = '' }) {
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

/**
 * Create a member.
 * @returns {{id:string, mode:'account'|'local', member:object}}
 */
async function createMemberInner(tripId, data, { order = 999, onNotice } = {}) {
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

  // Create the normal trip-member record first. A PIN does not become usable until
  // the server callable has stored its hash and private username index.
  const id = autoId('mb');
  const payload = buildMemberDoc({ ...data, username, order });
  const canLogin = Boolean(username && data.pin);
  const batch = writeBatch(db);
  batch.set(doc(db, `trips/${tripId}/members`, id), {
    uid: id,
    ...payload,
    authType: canLogin ? 'pin' : 'local',
    loginReady: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    createdBy: data.createdBy || null
  });
  batch.update(doc(db, 'trips', tripId), {
    memberUids: arrayUnion(id),
    updatedAt: serverTimestamp()
  });
  await batch.commit();

  if (canLogin) {
    try {
      await setMemberPin(tripId, id, data.pin, username);
    } catch (e) {
      console.warn('[Members] server PIN setup failed:', e?.code || e?.message);
      onNotice?.(e.message || 'ตั้ง PIN ไม่สำเร็จ — ตรวจสอบการ deploy Cloud Functions แล้วลองอีกครั้ง');
      return { id, mode: 'local', member: { id, uid: id, ...payload, loginReady: false } };
    }
  }

  return {
    id,
    mode: canLogin ? 'pin' : 'local',
    member: { id, uid: id, ...payload, loginReady: canLogin }
  };
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

async function updateMemberInner(tripId, memberId, updates, { pin = null } = {}) {
  const payload = { ...updates };
  if (payload.displayName != null) payload.displayName = String(payload.displayName).trim() || 'Member';
  if (payload.username != null) payload.username = normalizeUsername(payload.username);

  const previous = await getMember(tripId, memberId).catch(() => null);
  const oldUsername = normalizeUsername(previous?.username);
  const newUsername = payload.username != null ? payload.username : oldUsername;
  const usernameChanged = oldUsername !== newUsername;
  const pinValue = pin == null ? '' : String(pin);

  if (pinValue && (pinValue.length < 4 || pinValue.length > 12)) throw new Error('PIN ต้อง 4-12 ตัวอักษร');
  if (pinValue && !newUsername) throw new Error('ต้องมีชื่อผู้ใช้ก่อนจึงจะตั้ง PIN ได้');
  if (usernameChanged && newUsername) {
    const existing = await findMemberByUsername(tripId, newUsername);
    if (existing && existing.id !== memberId) throw new Error('ชื่อผู้ใช้นี้ถูกใช้แล้วในทริปนี้ — ลองชื่ออื่น');
  }

  const memberRef = doc(db, `trips/${tripId}/members`, memberId);
  await updateDoc(memberRef, { ...payload, updatedAt: serverTimestamp() });

  try {
    if (pinValue) {
      // The callable replaces any old username mapping and stores the new hash.
      await setMemberPin(tripId, memberId, pinValue, newUsername, usernameChanged ? oldUsername : null);
    } else if (usernameChanged && newUsername) {
      await publishMemberLookup(newUsername, tripId, memberId, oldUsername);
    } else if (usernameChanged && !newUsername) {
      await clearMemberPin(tripId, memberId, oldUsername);
    }
  } catch (e) {
    // Keep the old lookup and member username in sync if a server operation fails.
    if (usernameChanged) {
      await updateDoc(memberRef, { username: oldUsername, updatedAt: serverTimestamp() }).catch(() => {});
    }
    throw e;
  }
  return true;
}

/**
 * Delete a member. Expenses that reference the member are kept (history) but the
 * member disappears from pickers. Set `removeFromTrips` to also drop the uid array entry.
 */
async function deleteMemberInner(tripId, memberId, { uid = null } = {}) {
  const docId = memberId;
  const member = await getMember(tripId, docId).catch(() => null);
  if (member?.username || member?.loginReady) await clearMemberPin(tripId, docId, member?.username);

  const memberUid = uid || member?.uid || docId;
  const tripRef = doc(db, 'trips', tripId);
  const tripSnap = await getDoc(tripRef);
  const batch = writeBatch(db);
  batch.delete(doc(db, `trips/${tripId}/members`, docId));
  if (tripSnap.exists() && (tripSnap.data().memberUids || []).includes(memberUid)) {
    batch.update(tripRef, { memberUids: arrayRemove(memberUid), updatedAt: serverTimestamp() });
  }
  await batch.commit();
  return true;
}

async function reorderMembersInner(tripId, ids, userId) {
  const batch = writeBatch(db);
  ids.forEach((id, idx) => {
    batch.update(doc(db, `trips/${tripId}/members`, id), { order: idx, updatedBy: userId, updatedAt: serverTimestamp() });
  });
  await batch.commit();
}

export async function countMemberReferences(tripId, memberId) {
  const result = { expensesPaid: 0, expensesShared: 0, itemsEstimated: 0 };
  try {
    // No cap: a member referenced only by bill #301 must still be reported as
    // “in use”, otherwise the delete confirmation understates the impact.
    const exps = await getDocs(collection(db, `trips/${tripId}/expenses`));
    exps.docs.forEach(d => {
      const data = d.data();
      if (data.status === 'voided') return;
      if (expensePayments(data).some(p => p.memberId === memberId)) result.expensesPaid++;
      if ((data.allocations || []).some(a => a.memberId === memberId && a.amountMinor)) result.expensesShared++;
    });
    const items = await getDocs(collection(db, `trips/${tripId}/itineraryItems`));
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

/* ---------------------------------------------------------------- *
 * Public API — every write drops the cached member/join-request list
 * so the members menu repaints instantly instead of re-reading.
 * ---------------------------------------------------------------- */

async function withMemberInvalidation(tripId, fn) {
  try { return await fn(); } finally { invalidateMembers(tripId); }
}

export function createMember(tripId, data, options = {}) {
  return withMemberInvalidation(tripId, () => createMemberInner(tripId, data, options));
}

export function updateMember(tripId, memberId, updates, options = {}) {
  return withMemberInvalidation(tripId, () => updateMemberInner(tripId, memberId, updates, options));
}

export function deleteMember(tripId, memberId, options = {}) {
  return withMemberInvalidation(tripId, () => deleteMemberInner(tripId, memberId, options));
}

export function reorderMembers(tripId, ids, userId) {
  return withMemberInvalidation(tripId, () => reorderMembersInner(tripId, ids, userId));
}

/**
 * Fill in missing profile photos (v44).
 *
 * The owner asked the debt map to show “ภาพโปรไฟล์จริง” for every member. A member
 * document stores the photo that was on the account when the person joined, but
 * older rows (and everyone who joined before photos were copied) have none — so
 * the map fell back to an initial. The public profile directory is the same source
 * the join flow reads, so it is asked for the missing pictures here.
 *
 * Best-effort by design: a denied or offline read just leaves the initial, and
 * results are cached for the session so opening the page again costs nothing.
 */
const profilePhotoCache = new Map();

export async function hydrateMemberPhotos(members = []) {
  if (!db) return members || [];
  const missing = (members || []).filter(m => m && !m.photoURL && m.uid);
  if (!missing.length) return members || [];
  const found = new Map();
  await Promise.all(missing.map(async (member) => {
    const uid = member.uid;
    if (profilePhotoCache.has(uid)) {
      const cached = profilePhotoCache.get(uid);
      if (cached) found.set(member.id, cached);
      return;
    }
    let photo = '';
    for (const path of [`publicProfiles/${uid}`, `users/${uid}`]) {
      try {
        const snap = await getDoc(doc(db, path));
        const value = snap.exists() ? String(snap.data()?.photoURL || '') : '';
        if (value) { photo = value; break; }
      } catch { /* not readable for this account — try the next source */ }
    }
    profilePhotoCache.set(uid, photo);
    if (photo) found.set(member.id, photo);
  }));
  if (!found.size) return members || [];
  return (members || []).map(member => (found.has(member.id) ? { ...member, photoURL: found.get(member.id) } : member));
}
