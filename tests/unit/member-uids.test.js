// memberUids reconciliation: the members page (member documents) and the
// trip list (`trips.memberUids`) must agree, or a member signs in to an
// empty trip list while the admin still sees them in the trip.
import {
  memberAccessUids, expectedMemberUids, missingMemberUids,
  mergeTripsById, tripIdFromMemberPath, isInactiveMember
} from '../../src/js/utils/memberUids.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }
const eq = (a, b, msg) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);

export function testMemberAccessUids() {
  console.log('Testing member access uids...');

  // Account member: document id, uid field and auth uid are one value.
  eq(memberAccessUids({ id: 'google-1', uid: 'google-1', authType: 'account' }), ['google-1'], 'account member dedupes to one uid');
  // Username/PIN member: the custom-token login is the member document id.
  eq(memberAccessUids({ id: 'mb123', uid: 'mb123', authType: 'pin' }), ['mb123'], 'PIN member login uid is the document id');
  // A local member linked to an account later: both logins must keep working.
  eq(memberAccessUids({ id: 'mb123', uid: 'mb123', authUid: 'google-9' }), ['mb123', 'google-9'], 'linked member keeps both login uids');
  eq(memberAccessUids({ uid: 'only-uid' }), ['only-uid'], 'uid field alone is enough');
  eq(memberAccessUids(null), [], 'no member, no uids');
  eq(memberAccessUids({ id: 'bad/uid' }), [], 'a path-like id is never a uid');

  console.log('All member access uid tests passed');
}

export function testRevokedMemberStatus() {
  console.log('Testing revoked member statuses...');

  // Both spellings revoke access: `inactive` is what the rules and the sweep
  // write, `disabled` is what older builds of the สมาชิก status select wrote.
  assert(isInactiveMember({ status: 'inactive' }), 'inactive is revoked');
  assert(isInactiveMember({ status: 'disabled' }), 'disabled is revoked');
  assert(isInactiveMember({ status: 'DISABLED' }), 'case does not matter');
  assert(!isInactiveMember({ status: 'active' }), 'active is not revoked');
  assert(!isInactiveMember({}), 'a legacy document without status stays a member');
  assert(!isInactiveMember({ status: 'pending' }), 'a stuck pending row is not a revocation');

  // A revoked member document never contributes a uid to the trip listing.
  eq(expectedMemberUids([
    { id: 'u1', uid: 'u1', status: 'active' },
    { id: 'u2', uid: 'u2', status: 'disabled' },
    { id: 'u3', uid: 'u3', status: 'inactive' }
  ]), ['u1'], 'revoked members are not listed');

  console.log('All revoked status tests passed');
}

export function testMissingMemberUids() {
  console.log('Testing missing memberUids detection...');

  const members = [
    { id: 'u-admin', uid: 'u-admin', role: 'trip_admin', status: 'active' },
    { id: 'mb-som', uid: 'mb-som', displayName: 'ส้ม', status: 'active' },
    { id: 'u-gone', uid: 'u-gone', status: 'inactive' }
  ];

  // The reported bug: the admin's member list has ส้ม, the trip array does not.
  eq(missingMemberUids({ memberUids: ['u-admin'] }, members), ['mb-som'], 'member doc missing from memberUids is reported');
  eq(missingMemberUids(['u-admin', 'mb-som'], members), [], 'in-sync trip needs no repair');
  eq(missingMemberUids(undefined, members), ['u-admin', 'mb-som'], 'a trip with no array at all is fully repaired');
  assert(!expectedMemberUids(members).includes('u-gone'), 'inactive members are never re-added');

  console.log('All missing memberUids tests passed');
}

export function testMergeTripsAndMemberPath() {
  console.log('Testing trip merge + member path parsing...');

  const merged = mergeTripsById(
    [{ id: 'a' }, { id: 'b' }],
    [{ id: 'b', name: 'duplicate dropped' }, { id: 'c' }],
    null,
    [{ id: 'a' }]
  );
  eq(merged.map(t => t.id), ['a', 'b', 'c'], 'sources merge by id, first copy wins');

  eq(tripIdFromMemberPath('trips/t1/members/u2'), 't1', 'trip id from a member document path');
  eq(tripIdFromMemberPath('trips/t1/expenses/e1'), '', 'non-member paths yield no trip');
  eq(tripIdFromMemberPath('members/u2'), '', 'a top-level members collection is not a trip');
  eq(tripIdFromMemberPath(''), '', 'empty path yields no trip');

  console.log('All trip merge/path tests passed');
}
