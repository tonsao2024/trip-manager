// Pure decisions behind the admin sweep + member-side join-request sync.
// (Firestore-facing behaviour is covered in tests/membership-repair.test.mjs.)
import {
  planMembershipRepair, planMyJoinRequestSync,
  isActionableJoinRequest, isStuckMemberStatus, isClosedMemberStatus
} from '../../src/js/utils/membershipRepair.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }
const eq = (a, b, msg) => assert(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);

export async function testMembershipRepairPlan() {
  console.log('Testing membership repair plans...');
  const trip = { memberUids: ['admin', 'inactive', 'legacy'] };
  const members = [
    { id: 'g1', uid: 'g1', status: 'pending' },
    { id: 'inactive', uid: 'inactive', status: 'inactive' },
    { id: 'mb-local', uid: 'mb-local', authUid: 'g2', status: 'active' }
  ];
  const requests = [
    { uid: 'g1', status: 'pending' },       // already a member → tombstone
    { uid: 'new', status: 'waiting_review' }, // unknown status → pending
    { uid: 'odd' },                          // legacy row with no status
    { uid: 'ghost', status: 'approved' },    // leave closed rows alone
    { uid: 'declined', status: 'rejected' }
  ];
  const plan = planMembershipRepair({ trip, members, requests });
  assert(plan.missing.includes('g1'), 'a pending member still needs their uid listed');
  assert(plan.missing.includes('mb-local') && plan.missing.includes('g2'), 'linked local+account uids are both restored');
  eq(plan.stale.join(','), 'inactive', 'only a doc explicitly marked inactive is pruned');
  assert(!plan.stale.includes('legacy'), 'an unmatched uid (legacy PIN login) is never removed');
  eq(plan.activateIds.join(','), 'g1', 'stuck member status is activated');
  eq(plan.resolveRequests.map(x => x.uid).join(','), 'g1', 'request of an existing member is resolved');
  eq(plan.normalizeRequests.map(x => x.uid).sort().join(','), 'new,odd', 'unknown/empty request statuses become actionable');
  eq(plan.counts.stale, 1, 'counts mirror the plan');

  // Idempotence: the same data after the writes must produce an empty plan.
  const after = planMembershipRepair({
    trip: { memberUids: ['admin', 'g1', 'mb-local', 'g2', 'legacy'] },
    members: [
      { id: 'g1', uid: 'g1', status: 'active' },
      { id: 'inactive', uid: 'inactive', status: 'inactive' },
      { id: 'mb-local', uid: 'mb-local', authUid: 'g2', status: 'active' }
    ],
    requests: [
      { uid: 'g1', status: 'approved' }, { uid: 'new', status: 'pending' },
      { uid: 'odd', status: 'pending' }, { uid: 'ghost', status: 'approved' },
      { uid: 'declined', status: 'rejected' }
    ]
  });
  eq(after.missing.length + after.stale.length + after.activateIds.length
    + after.resolveRequests.length + after.normalizeRequests.length, 0, 'a second sweep changes nothing');

  eq(isStuckMemberStatus('PENDING'), true, 'stuck status is case-insensitive');
  eq(isStuckMemberStatus('active'), false, 'active is not a stuck status');
  eq(isClosedMemberStatus('disabled'), true, 'disabled is a closed member');
  eq(isActionableJoinRequest({ status: 'approved' }), false, 'approved is not actionable');
  eq(isActionableJoinRequest({ status: 'rejected' }), false, 'rejected is not actionable');
  eq(isActionableJoinRequest({}), true, 'status-less legacy request stays actionable');
  console.log('All membership repair plan tests passed');
}

export async function testMyJoinRequestSyncPlan() {
  console.log('Testing my-request sync plans...');
  const mirrors = ['a', 'b', 'c', 'd', 'e'].map(tripId => ({ tripId, status: 'pending' }));
  const primaries = {
    b: { status: 'approved' },
    c: { status: 'rejected' },
    d: { status: 'pending' }, // joined, but the queue still says pending
    e: { status: 'pending' }
  };
  const plan = planMyJoinRequestSync({
    mirrors, primaries, joinedTripIds: ['d'], deniedTripIds: ['a']
  });
  eq(plan.create.length, 0, 'an unreadable primary is never guessed at');
  eq(plan.update.map(x => `${x.tripId}:${x.status}`).join(','), 'b:approved,c:rejected,d:approved', 'mirror keeps the decision and trip pointer');

  const republished = planMyJoinRequestSync({ mirrors, primaries, joinedTripIds: ['d'] });
  eq(republished.create.map(x => x.tripId).join(','), 'a', 'a mirror-only request is republished for the admin');
  eq(republished.create[0].reason, 'mirror-only', 'the report explains why it was created');

  const joinedOnly = planMyJoinRequestSync({
    mirrors: [{ tripId: 'x', status: 'pending' }], joinedTripIds: ['x']
  });
  eq(joinedOnly.create.length, 0, 'an approved member never re-creates a request');
  eq(joinedOnly.update[0]?.status, 'approved', 'the stale pending badge is cleared');
  console.log('All my-request sync plan tests passed');
}
