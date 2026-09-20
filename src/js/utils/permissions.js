// Permissions — resolves what the signed-in user may do inside a trip.
import { db } from '../firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const CACHE_TTL = 60 * 1000;
const cache = new Map(); // tripId -> { data, ts }

export function clearPermissionsCache(tripId = null) {
  if (tripId) cache.delete(tripId);
  else cache.clear();
}

export function isAdminRole(role) {
  return role === 'trip_admin' || role === 'super_admin';
}

/**
 * @returns {Promise<{uid:string, role:string, isSuperAdmin:boolean, isTripAdmin:boolean,
 *                    isAdmin:boolean, permissions:object, member:object|null}>}
 */
export async function resolvePermissions(tripId, trip = null, uid = null) {
  const key = `${tripId}:${uid}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) return hit.data;

  let role = 'member';
  let permissions = { canEditItinerary: true, canEditExpense: true, canManageMembers: false };
  let member = null;
  let isSuperAdmin = false;

  if (uid) {
    if (trip?.createdBy && trip.createdBy === uid) {
      role = 'trip_admin';
      permissions = { canEditItinerary: true, canEditExpense: true, canManageMembers: true };
    }
    if (db) {
      try {
        const snap = await getDoc(doc(db, `trips/${tripId}/members/${uid}`));
        if (snap.exists()) {
          member = { id: snap.id, ...snap.data() };
          if (member.role) role = member.role;
          if (member.permissions) permissions = { ...permissions, ...member.permissions };
        }
      } catch (e) {
        console.warn('[Permissions] member read failed', e?.message);
      }
      if (role !== 'trip_admin' && role !== 'super_admin') {
        try {
          const userSnap = await getDoc(doc(db, `users/${uid}`));
          if (userSnap.exists() && userSnap.data().role === 'super_admin') {
            isSuperAdmin = true;
            role = 'super_admin';
          }
        } catch {}
      }
    }
  }

  const data = {
    uid,
    role,
    member,
    isSuperAdmin,
    isTripAdmin: role === 'trip_admin' || role === 'super_admin',
    isAdmin: isAdminRole(role),
    permissions
  };
  cache.set(key, { data, ts: Date.now() });
  return data;
}
