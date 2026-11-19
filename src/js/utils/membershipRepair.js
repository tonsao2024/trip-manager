// Membership repair — pure decisions, no Firebase and no DOM.
//
// Why this module exists: a person can be a real trip member in THREE places
// that are allowed to disagree with each other:
//
//   1. trips/{tripId}/members/{memberId}   — the list the admin sees.
//      A legacy/migrated row may carry `status: 'pending'` instead of 'active'.
//   2. trips/{tripId}.memberUids           — the array the member's own trip
//      list (and the Firestore list rule) queries. See memberUids.js.
//   3. join requests, written TWICE by requestToJoin():
//        trips/{tripId}/joinRequests/{uid}  — the queue the admin reads
//        users/{uid}/joinRequests/{tripId}  — the member's private mirror
//
// If the trip-side write failed (old rules / offline) the member still sees
// "รอแอดมินอนุมัติ" from their mirror while the admin's queue is empty. If the
// mirror cleanup failed after an approval (only its owner may write it), the
// badge stays forever even though the membership exists. The repair button
// needs a plan that is safe to re-run, so all decisions live here and the
// Firestore writes live in members/repair.js + members/join.js.

import { memberAccessUids, isInactiveMember, missingMemberUids } from './memberUids.js';

export const JOIN_PENDING = 'pending';
export const JOIN_APPROVED = 'approved';
export const JOIN_REJECTED = 'rejected';

const STUCK_MEMBER_STATUSES = new Set([
  'pending', 'waiting', 'awaiting', 'awaiting_approval', 'wait', 'review'
]);
const CLOSED_MEMBER_STATUSES = new Set(['inactive', 'disabled']);

const norm = (value) => String(value ?? '').trim().toLowerCase();

/** A member row left in a "waiting for approval" state instead of active/inactive. */
export function isStuckMemberStatus(status) {
  return STUCK_MEMBER_STATUSES.has(norm(status));
}

/** A member row that must no longer grant access (inactive / disabled). */
export function isClosedMemberStatus(status) {
  return CLOSED_MEMBER_STATUSES.has(norm(status)) || isInactiveMember({ status });
}

/** Only pending (or status-less legacy) requests get Approve/Decline buttons. */
export function isActionableJoinRequest(request) {
  const status = norm(request?.status);
  return !status || status === JOIN_PENDING || STUCK_MEMBER_STATUSES.has(status);
}

/** Safe uid of a request row; never invent one from an arbitrary string. */
export function requestUid(request) {
  const uid = typeof request?.uid === 'string' ? request.uid
    : typeof request?.id === 'string' ? request.id : '';
  return uid && !uid.includes('/') && uid.length <= 128 ? uid : '';
}

/**
 * What the admin-side "sweep" should change. Pure: the caller has already read
 * fresh copies of the trip, every member document and every join request.
 *
 * - `missing` / `stale`: memberUids entries to add / remove. A uid with NO
 *   member document is never removed — legacy PIN logins still rely on it.
 * - `activateIds`: member docs stuck in 'pending' → 'active'.
 * - `resolveRequests`: queue rows whose person is already a member → 'approved'
 *   tombstone (keeps history, stops showing Approve again, tells the member-side
 *   sync to drop its stale mirror).
 * - `normalizeRequests`: rows with an unknown/empty status → 'pending'.
 */
export function planMembershipRepair({ trip = null, members = [], requests = [] } = {}) {
  const listed = Array.isArray(trip?.memberUids)
    ? [...new Set(trip.memberUids.filter(uid => typeof uid === 'string' && uid))]
    : [];
  const ownerByUid = new Map();
  for (const member of members || []) {
    for (const uid of memberAccessUids(member)) {
      if (!ownerByUid.has(uid)) ownerByUid.set(uid, member);
    }
  }
  const memberUids = new Set(ownerByUid.keys());
  const listedSet = new Set(listed);

  const missing = missingMemberUids(listed, members || []);
  const stale = listed.filter(uid => {
    const member = ownerByUid.get(uid);
    // Only prune when a document explicitly says the person is closed. An
    // unmatched uid may be a legacy/PIN account that still needs trip access.
    return Boolean(member && isClosedMemberStatus(member.status));
  });
  const activateIds = (members || [])
    .filter(member => typeof member.id === 'string' && member.id && isStuckMemberStatus(member.status))
    .map(member => member.id);

  const resolveRequests = [];
  const normalizeRequests = [];
  for (const request of requests || []) {
    const uid = requestUid(request);
    if (!uid) continue;
    const status = norm(request.status);
    // The array alone grants access under the legacy fallback rule, so it counts
    // as membership even without a member document.
    const alreadyMember = memberUids.has(uid) || listedSet.has(uid);
    if (alreadyMember) {
      if (status !== JOIN_APPROVED) resolveRequests.push({ uid, status });
    } else if (!isActionableJoinRequest(request) && status !== JOIN_APPROVED && status !== JOIN_REJECTED) {
      normalizeRequests.push({ uid, status });
    } else if (!status) {
      normalizeRequests.push({ uid, status });
    }
  }

  return {
    listed,
    missing,
    stale,
    activateIds,
    resolveRequests,
    normalizeRequests,
    counts: {
      missing: missing.length,
      stale: stale.length,
      activate: activateIds.length,
      resolve: resolveRequests.length,
      normalize: normalizeRequests.length
    }
  };
}

/**
 * What the member-side "sync my requests" should change. Pure: `primaries` is a
 * map tripId -> trip-side request document (or undefined when it was absent),
 * `deniedTripIds` are reads that failed so we never guess about them.
 *
 * - joined trip: drop the private mirror and mark any still-pending primary as
 *   approved. Never create a new primary for somebody who is already in.
 * - mirror-only (no primary): re-publish the request so the admin can see it.
 * - primary approved: drop the mirror.
 * - primary rejected: copy the status into the mirror (no fake "waiting").
 */
export function planMyJoinRequestSync({ mirrors = [], primaries = {}, joinedTripIds = [], deniedTripIds = [] } = {}) {
  const joined = new Set((joinedTripIds || []).map(String));
  const denied = new Set((deniedTripIds || []).map(String));
  const create = [];
  const resolve = [];
  const update = [];
  const clear = [];
  const seen = new Set();

  for (const mirror of mirrors || []) {
    const tripId = String(mirror?.tripId || mirror?.id || '').trim();
    if (!tripId || tripId.includes('/') || seen.has(tripId)) continue;
    seen.add(tripId);
    const primary = primaries[tripId];

    if (joined.has(tripId)) {
      clear.push({ tripId, reason: 'joined' });
      if (primary && norm(primary.status) !== JOIN_APPROVED) {
        resolve.push({ tripId, status: primary.status });
      }
      continue;
    }
    if (denied.has(tripId)) continue;               // unreadable: leave untouched
    if (!primary) {
      create.push({ tripId, request: mirror, reason: 'mirror-only' });
      continue;
    }
    const status = norm(primary.status);
    if (status === JOIN_APPROVED) {
      clear.push({ tripId, reason: 'approved' });
    } else if (status === JOIN_REJECTED && norm(mirror.status) !== status) {
      update.push({ tripId, status });
    }
  }
  return { create, resolve, update, clear };
}
