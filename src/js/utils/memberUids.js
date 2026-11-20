// memberUids reconciliation — pure logic, no Firebase and no DOM.
//
// Why this module exists (the “admin sees everyone, nobody else sees the trip”
// bug): a trip keeps its people in TWO places that must agree.
//
//   1. `trips/{tripId}/members/{memberId}` — the member documents. This is
//      what the trip admin's Members page reads, so the admin always sees
//      everybody, even when the second list is broken.
//   2. `trips/{tripId}.memberUids` — a flat array of login uids on the trip
//      document itself. The trip-list query (`memberUids array-contains uid`)
//      and the Firestore list rule can only see this array: Firestore cannot
//      answer “which trips have a members/{myUid} document?” from the trip
//      documents alone.
//
// Whenever the two drift apart — a member document exists but its login uid
// never landed in `memberUids` (legacy trips, a silently failed write, a
// duplicated trip whose members were copied without the array, …) — the
// member signs in successfully and is shown an empty trip list, while the
// admin, reading the member documents, sees nothing wrong.

/**
 * Every login uid a member document can be signed in as.
 *
 * - Account members (join-request approval / add-by-email): the document id,
 *   its `uid` field and the Firebase Auth uid are all the same value.
 * - Username/PIN members: the custom-token login *is* the member document id
 *   (`mb…`), stored in both `id` and `uid`.
 * - A local member later linked to an account keeps the `mb…` id and gains an
 *   `authUid`; both logins must keep working, so both uids are returned.
 */
export function memberAccessUids(member) {
  if (!member || typeof member !== 'object') return [];
  const out = [];
  for (const value of [member.id, member.uid, member.authUid]) {
    const uid = typeof value === 'string' ? value.trim() : '';
    if (uid && !uid.includes('/') && !out.includes(uid)) out.push(uid);
  }
  return out;
}

/** A member document that must not grant access any more. */
export function isInactiveMember(member) {
  return ['inactive', 'disabled'].includes(String(member?.status || '').trim().toLowerCase());
}

/**
 * The uids `trips/{tripId}.memberUids` *should* contain for a member list:
 * every access uid of every active member document.
 */
export function expectedMemberUids(members = []) {
  const out = [];
  for (const member of members || []) {
    if (isInactiveMember(member)) continue;
    for (const uid of memberAccessUids(member)) {
      if (!out.includes(uid)) out.push(uid);
    }
  }
  return out;
}

/**
 * Access uids present in the member documents but missing from the trip's
 * `memberUids` array — exactly the people who cannot see the trip.
 * Accepts either the trip document or the raw array as the first argument.
 */
export function missingMemberUids(tripOrUids, members = []) {
  const listed = Array.isArray(tripOrUids) ? tripOrUids : tripOrUids?.memberUids;
  const have = new Set(Array.isArray(listed) ? listed.filter(u => typeof u === 'string') : []);
  return expectedMemberUids(members).filter(uid => !have.has(uid));
}

/** Merge trip lists from several queries, keeping the first copy of each id. */
export function mergeTripsById(...lists) {
  const out = [];
  const seen = new Set();
  for (const list of lists) {
    for (const trip of list || []) {
      if (!trip?.id || seen.has(trip.id)) continue;
      seen.add(trip.id);
      out.push(trip);
    }
  }
  return out;
}

/**
 * Trip id of a member document, from its Firestore path
 * (`trips/{tripId}/members/{memberId}`). Returns '' for any other shape, so
 * a stray `members` collection elsewhere can never invent a trip.
 */
export function tripIdFromMemberPath(path) {
  const parts = String(path || '').split('/').filter(Boolean);
  if (parts.length < 4) return '';
  const membersIdx = parts.lastIndexOf('members');
  if (membersIdx < 2 || parts[membersIdx - 2] !== 'trips') return '';
  return parts[membersIdx - 1] || '';
}
