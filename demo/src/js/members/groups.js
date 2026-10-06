/**
 * Trip sub-groups (กลุ่มย่อย) — Firestore CRUD for
 * `trips/{tripId}/memberGroups/{groupId}`.
 *
 * The pure maths lives in src/js/utils/groups.js (and is re-exported here so the
 * app imports one module). Groups are a *planning* tool: creating, renaming,
 * re-colouring or deleting one must never be able to fail because a member doc
 * is missing, so writes only need a signed-in user (see firestore.rules).
 */
import { db, serverTimestamp } from '../firebase.js';
import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, writeBatch } from '../../../vendor/firebase/firestore.js';
import { cachedRead, cacheForget } from '../utils/datacache.js';
import { normalizeGroup, sortGroups, GROUP_COLORS, GROUP_ICONS } from '../utils/groups.js';

export {
  GROUP_COLORS, GROUP_ICONS, normalizeGroup, sortGroups, nextGroupName, groupMembers,
  groupIdsOfMember, groupsOfMember, memberGroupBadges, groupBudget, groupBudgetReport
} from '../utils/groups.js';

const cacheKey = (tripId) => `groups:${tripId}`;

export function invalidateGroups(tripId) {
  cacheForget(cacheKey(tripId));
}

async function loadGroupsUncached(tripId) {
  const snap = await getDocs(collection(db, `trips/${tripId}/memberGroups`));
  return sortGroups(snap.docs.map((d, i) => ({ id: d.id, ...d.data() })));
}

/** Every sub-group of the trip (cached, stale-while-revalidate). */
export async function listGroups(tripId, { fresh = false } = {}) {
  if (!db) return [];
  if (fresh) cacheForget(cacheKey(tripId));
  const groups = await cachedRead(cacheKey(tripId), () => loadGroupsUncached(tripId), { maxAgeMs: 60 * 1000 });
  return sortGroups(groups);
}

export async function createGroup(tripId, data = {}, uid = null) {
  if (!db) throw new Error('DB not ready');
  const name = String(data.name || '').trim();
  if (!name) throw new Error('ต้องมีชื่อกลุ่ม');
  const existing = await listGroups(tripId, { fresh: true }).catch(() => []);
  const payload = normalizeGroup(
    { ...data, name, order: existing.length ? Math.max(...existing.map(g => g.order)) + 1 : 0 },
    existing.length
  );
  const ref = await addDoc(collection(db, `trips/${tripId}/memberGroups`), {
    name: payload.name,
    color: payload.color || GROUP_COLORS[0],
    icon: payload.icon || GROUP_ICONS[0],
    note: payload.note,
    memberIds: payload.memberIds,
    order: payload.order,
    createdBy: uid || null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  invalidateGroups(tripId);
  return ref.id;
}

export async function updateGroup(tripId, groupId, patch = {}) {
  if (!db) throw new Error('DB not ready');
  const payload = { ...patch, updatedAt: serverTimestamp() };
  delete payload.id;
  if (payload.name != null) payload.name = String(payload.name).trim();
  if (payload.memberIds) payload.memberIds = [...new Set(payload.memberIds.filter(Boolean).map(String))];
  await updateDoc(doc(db, `trips/${tripId}/memberGroups`, groupId), payload);
  invalidateGroups(tripId);
}

export async function deleteGroup(tripId, groupId) {
  if (!db) throw new Error('DB not ready');
  await deleteDoc(doc(db, `trips/${tripId}/memberGroups`, groupId));
  invalidateGroups(tripId);
}

/** Save the order of the group list after a drag / move. */
export async function saveGroupOrder(tripId, orderedIds = []) {
  if (!db || !orderedIds.length) return;
  const batch = writeBatch(db);
  orderedIds.forEach((id, index) => {
    batch.update(doc(db, `trips/${tripId}/memberGroups`, id), { order: index, updatedAt: serverTimestamp() });
  });
  await batch.commit();
  invalidateGroups(tripId);
}

/**
 * Add / remove one member (used by the group form's member tiles and by the
 * “member → groups” picker on a member card).
 */
export async function setGroupMembers(tripId, groupId, memberIds = []) {
  return updateGroup(tripId, groupId, { memberIds: [...new Set(memberIds.filter(Boolean).map(String))] });
}

/** Pull a deleted member out of every group so no ghost ids linger. */
export async function forgetMemberFromGroups(tripId, memberId) {
  if (!db || !memberId) return;
  try {
    const groups = await listGroups(tripId, { fresh: true });
    await Promise.all(groups
      .filter(g => g.memberIds.includes(memberId))
      .map(g => updateGroup(tripId, g.id, { memberIds: g.memberIds.filter(id => id !== memberId) })));
  } catch (e) {
    console.warn('[Groups] could not clean up a removed member', e?.message);
  }
}
