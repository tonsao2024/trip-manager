// Integration tests against the smoke Firestore stub (not a security-rules emulator).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';
import { outDir } from './smoke/build.mjs';

const dom = new JSDOM('', { url: 'https://example.test/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.CustomEvent = dom.window.CustomEvent;

const fsdb = await import('./smoke/stubs/firebase-firestore.mjs');
const authStub = await import('./smoke/stubs/firebase-auth.mjs');
const trips = await import(pathToFileURL(path.join(outDir, 'trips/index.js')).href);
const joins = await import(pathToFileURL(path.join(outDir, 'members/join.js')).href);
const members = await import(pathToFileURL(path.join(outDir, 'members/index.js')).href);
const access = await import(pathToFileURL(path.join(outDir, 'members/access.js')).href);
const repair = await import(pathToFileURL(path.join(outDir, 'members/repair.js')).href);

beforeEach(() => {
  fsdb.__reset();
  authStub.__emitAuth(null);
  localStorage.clear();
  trips.clearTripsCache();
  members.invalidateMembers('t');
});

test('a Google/email member can be removed without the PIN callable or changes to expenses', async () => {
  fsdb.__seed('trips/t', { createdBy: 'admin', memberUids: ['admin'] });
  await joins.addMemberFromProfile('t', { uid: 'account-uid', email: 'member@example.test' });
  assert.equal(fsdb.__dump('trips/t/members/account-uid').loginReady, true);
  fsdb.__seed('trips/t/expenses/bill', { payerId: 'account-uid', amountMinor: 12000 });
  const bill = fsdb.__dump('trips/t/expenses/bill');
  const previousCommits = fsdb.__batchStats().commits.length;

  await members.deleteMember('t', 'account-uid');

  assert.equal(fsdb.__dump('trips/t/members/account-uid'), undefined);
  assert.deepEqual(fsdb.__dump('trips/t').memberUids, ['admin']);
  assert.deepEqual(fsdb.__batchStats().commits.slice(previousCommits), [2]);
  assert.deepEqual(fsdb.__dump('trips/t/expenses/bill'), bill);
});

test('removing a linked member clears every access uid, even if the member list is stale', async () => {
  fsdb.__seed('trips/t', { createdBy: 'admin', memberUids: ['admin', 'local-id', 'old-uid', 'account-uid'] });
  fsdb.__seed('trips/t/members/local-id', { authType: 'local', uid: 'local-id', loginReady: false });
  await members.listMembers('t');
  fsdb.__seed('trips/t/members/local-id', { authType: 'local', uid: 'old-uid', authUid: 'account-uid' });

  await members.deleteMember('t', 'local-id');

  assert.equal(fsdb.__dump('trips/t/members/local-id'), undefined);
  assert.deepEqual(fsdb.__dump('trips/t').memberUids, ['admin']);
});

test('a PIN or legacy login is not removed if server credential cleanup fails', async () => {
  const memberUids = ['admin', 'pin-member', 'legacy-member'];
  fsdb.__seed('trips/t', { createdBy: 'admin', memberUids });
  fsdb.__seed('trips/t/members/pin-member', { authType: 'pin', loginReady: true });
  fsdb.__seed('trips/t/members/legacy-member', { username: 'legacy-name' });

  for (const memberId of ['pin-member', 'legacy-member']) {
    await assert.rejects(members.deleteMember('t', memberId), (err) =>
      err.code === 'member-pin-cleanup-failed' && err.cause?.code === 'functions/internal');
    assert.ok(fsdb.__dump(`trips/t/members/${memberId}`));
  }
  assert.deepEqual(fsdb.__dump('trips/t').memberUids, memberUids);
  assert.deepEqual(fsdb.__batchStats().commits, []);
});

test('reconnect restores only the approved account listing and preserves the member settings', async () => {
  const trip = { createdBy: 'admin', memberUids: ['admin', 'other'] };
  const member = { uid: 'account', authType: 'account', status: 'active', role: 'member', permissions: {
    canEditItinerary: true, canEditExpense: false, canManageMembers: true
  } };
  fsdb.__seed('trips/t', trip);
  fsdb.__seed('trips/t/members/account', member);
  const before = await access.inspectMemberAccess('t', 'account');
  assert.equal(before.state, 'unlisted');
  assert.equal(before.permissions.canEditItinerary, true);
  assert.equal(before.permissions.canEditExpense, false);
  assert.equal(before.permissions.canManageMembers, true);
  assert.equal(await access.reconnectMemberAccess('t', 'account'), 'restored');
  assert.equal(await access.reconnectMemberAccess('t', 'account'), 'linked');
  assert.equal((await access.inspectMemberAccess('t', 'account')).state, 'linked');
  assert.deepEqual(fsdb.__dump('trips/t').memberUids, ['admin', 'other', 'account']);
  assert.deepEqual(fsdb.__dump('trips/t/members/account'), member);
});

test('reconnect does not restore disabled, deleted, local or mismatched memberships', async () => {
  fsdb.__seed('trips/t', { createdBy: 'admin', memberUids: ['admin'] });
  fsdb.__seed('trips/t/members/closed', { uid: 'closed', authType: 'account', status: 'disabled' });
  fsdb.__seed('trips/t/members/local', { uid: 'local', authType: 'local' });
  fsdb.__seed('trips/t/members/alias', { uid: 'alias', authUid: 'other', role: 'viewer' });
  assert.equal(await access.reconnectMemberAccess('t', 'closed'), 'closed');
  assert.equal(await access.reconnectMemberAccess('t', 'deleted'), 'missing');
  assert.equal(await access.reconnectMemberAccess('t', 'local'), 'not-account');
  assert.equal(await access.reconnectMemberAccess('t', 'alias'), 'mismatch');
  await trips.reconcileTripMemberUids('t', [{ id: 'closed', uid: 'closed', status: 'disabled' }]);
  assert.deepEqual(fsdb.__dump('trips/t').memberUids, ['admin']);
});

test('the member-side test uses the current Auth account and reports denied reads separately', async () => {
  fsdb.__seed('trips/t', { createdBy: 'admin', memberUids: ['admin', 'viewer'] });
  fsdb.__seed('trips/t/members/viewer', { uid: 'viewer', role: 'viewer', permissions: { canEditExpense: true } });
  await assert.rejects(access.testMyMemberAccess('t'), /Sign in required/);
  authStub.__emitAuth({ uid: 'viewer' });
  fsdb.__deny('trips/t/joinRequests');
  const actual = await access.testMyMemberAccess('t');
  assert.deepEqual([actual.trip, actual.itinerary, actual.expenses, actual.requests], ['ok', 'ok', 'ok', 'denied']);
  assert.equal(actual.listed, true);
  assert.equal(actual.permissions.canEditExpense, false);
  assert.equal(actual.permissions.canEditItinerary, false);
  assert.equal(actual.permissions.canManageMembers, false);
  assert.deepEqual(fsdb.__dump('trips/t').memberUids, ['admin', 'viewer']);
});

test('admin repair re-reads the trip and member, even when the displayed list is stale', async () => {
  fsdb.__seed('trips/t', { createdBy: 'admin', memberUids: ['admin'] });
  fsdb.__seed('trips/t/members/current', { uid: 'current', status: 'active' });
  fsdb.__seed('trips/t/members/disabled', { uid: 'disabled', status: 'inactive' });
  // The caller's stale list claims these members are active. One was deleted,
  // one was disabled, and the trip argument falsely claims current is listed.
  const stale = ['current', 'disabled', 'deleted'].map(id => ({ id, uid: id, status: 'active' }));
  const repaired = await trips.reconcileTripMemberUids('t', stale, ['admin', 'current']);
  assert.deepEqual(repaired, ['current']);
  assert.deepEqual(fsdb.__dump('trips/t').memberUids, ['admin', 'current']);
});

test('member discovery finds an existing active member and skips inactive members', async () => {
  fsdb.__seed('trips/active', { createdBy: 'admin', memberUids: ['admin'] });
  fsdb.__seed('trips/active/members/member', { uid: 'member', status: 'active' });
  fsdb.__seed('trips/inactive', { createdBy: 'admin', memberUids: ['admin'] });
  fsdb.__seed('trips/inactive/members/member', { uid: 'member', status: 'inactive' });
  const found = await trips.listTrips('member');
  assert.deepEqual(found.map(t => t.id), ['active']);
  assert.ok(fsdb.__dump('trips/active').memberUids.includes('member'));
  assert.ok(!fsdb.__dump('trips/inactive').memberUids.includes('member'));
});

test('a failed discovery is not silently presented as an empty membership', async () => {
  fsdb.__deny('members');
  await assert.rejects(trips.listTrips('member'), { code: 'trip-list-incomplete' });
});

test('a partial list remains visible, is flagged, and is not cached as complete', async () => {
  fsdb.__seed('trips/own', { createdBy: 'member', memberUids: ['member'] });
  fsdb.__deny('members');
  const found = await trips.listTrips('member');
  assert.deepEqual(found.map(t => t.id), ['own']);
  assert.equal(found.incomplete, true);
  assert.equal(localStorage.getItem('fuji_trips_cache'), null);
});

test('a failed uid query does not prevent finding a linked account via authUid', async () => {
  fsdb.__seed('trips/linked', { createdBy: 'admin', memberUids: ['admin'] });
  fsdb.__seed('trips/linked/members/local', { uid: 'local', authUid: 'member', status: 'active' });
  fsdb.__denyQueryField('members', 'uid');
  const found = await trips.listTrips('member');
  assert.deepEqual(found.map(t => t.id), ['linked']);
  assert.equal(found.incomplete, true);
});

test('a failed membership query is not masked by a successful empty creator query', async () => {
  fsdb.__denyQueryField('trips', 'memberUids');
  fsdb.__deny('members');
  await assert.rejects(trips.listTrips('member'), { code: 'trip-list-incomplete' });
});

/* ------------------------------------------------------------------ *
 * One-tap repair: member-side mirror sync + admin-side status sweep.
 * ------------------------------------------------------------------ */

test('member sync republishes a mirror-only pending request into the admin queue', async () => {
  fsdb.__seed('trips/t1', { createdBy: 'admin', memberUids: ['admin'] });
  fsdb.__seed('users/g1/joinRequests/t1', {
    uid: 'g1', tripId: 't1', displayName: 'น้องใหม่', email: 'g1@example.com', status: 'pending'
  });
  const report = await joins.syncMyJoinRequests('g1');
  assert.deepEqual(report.created, ['t1']);
  assert.equal(fsdb.__dump('trips/t1/joinRequests/g1')?.status, 'pending', 'admin can now see the request');
  assert.equal(fsdb.__dump('trips/t1/joinRequests/g1')?.repairedFromMirror, true, 'the repair is traceable');
  assert.ok(fsdb.__dump('users/g1/joinRequests/t1'), 'the member keeps the pending badge');
});

test('member sync preserves an approved lookup pointer without re-creating a request', async () => {
  fsdb.__seed('trips/t1', { createdBy: 'admin', memberUids: ['admin', 'g1'] });
  fsdb.__seed('users/g1/joinRequests/t1', { uid: 'g1', tripId: 't1', status: 'pending' });
  const report = await joins.syncMyJoinRequests('g1');
  assert.equal(report.statuses.get('t1'), 'approved');
  assert.equal(fsdb.__dump('users/g1/joinRequests/t1').status, 'approved', 'no more “รออนุมัติ” badge');
  assert.equal(fsdb.__dump('trips/t1/joinRequests/g1'), undefined, 'no ghost request in the admin queue');
});

test('member sync records approval and rejection without assuming the trip is readable', async () => {
  fsdb.__seed('trips/t1/joinRequests/g1', { uid: 'g1', status: 'approved' });
  fsdb.__seed('trips/t2/joinRequests/g1', { uid: 'g1', status: 'rejected' });
  fsdb.__seed('users/g1/joinRequests/t1', { uid: 'g1', tripId: 't1', status: 'pending' });
  fsdb.__seed('users/g1/joinRequests/t2', { uid: 'g1', tripId: 't2', status: 'pending' });
  const report = await joins.syncMyJoinRequests('g1');
  assert.deepEqual(report.updated, ['t1', 't2']);
  assert.equal(report.statuses.get('t1'), 'approved');
  assert.equal(await joins.getJoinedTrip('t1', 'g1'), null);
  assert.equal(fsdb.__dump('users/g1/joinRequests/t2')?.status, 'rejected');
});

test('a denied trip-side read is reported, never guessed at or silently discarded', async () => {
  fsdb.__seed('users/g1/joinRequests/t1', { uid: 'g1', tripId: 't1', status: 'pending' });
  fsdb.__deny('trips/t1/joinRequests');
  const report = await joins.syncMyJoinRequests('g1');
  assert.equal(report.created.length, 0, 'no blind write');
  assert.equal(report.denied.length, 1);
  assert.equal(report.statuses.get('t1'), 'unverified');
  assert.equal(fsdb.__dump('trips/t1/joinRequests/g1'), undefined);
  assert.ok(fsdb.__dump('users/g1/joinRequests/t1'), 'the member’s request is kept');
});

test('approval addresses the actual requester and keeps the decision readable even if the private mirror is unwritable by admins', async () => {
  fsdb.__seed('trips/t1', { createdBy: 'admin', memberUids: ['admin'] });
  fsdb.__seed('trips/t1/joinRequests/g1', { uid: 'stale-payload-uid', status: 'pending' });
  fsdb.__seed('users/g1/joinRequests/t1', { status: 'pending' });
  fsdb.__deny('users/g1/joinRequests');
  await joins.approveJoinRequest('t1', (await joins.listJoinRequests('t1'))[0]);
  assert.equal(fsdb.__dump('trips/t1/members/g1').uid, 'g1');
  assert.equal(fsdb.__dump('trips/t1/members/stale-payload-uid'), undefined);
  assert.deepEqual(fsdb.__dump('trips/t1').memberUids, ['admin', 'g1']);
  assert.equal(fsdb.__dump('trips/t1/joinRequests/g1').status, 'approved');
  fsdb.__allowAll();
  await assert.rejects(joins.cancelJoinRequest('t1', 'g1'), /อนุมัติแล้ว/);
  await assert.rejects(joins.rejectJoinRequest('t1', { id: 'g1' }), /กรุณารีเฟรชคำขอ/);
  assert.equal((await joins.syncMyJoinRequests('g1')).statuses.get('t1'), 'approved');
});

test('a stale approve action does not grant access after the request was removed', async () => {
  fsdb.__seed('trips/t1', { createdBy: 'admin', memberUids: ['admin'] });
  await assert.rejects(joins.approveJoinRequest('t1', { id: 'g1' }), /กรุณารีเฟรชคำขอ/);
  assert.equal(fsdb.__dump('trips/t1/members/g1'), undefined);
  assert.deepEqual(fsdb.__dump('trips/t1').memberUids, ['admin']);
});

test('a legacy approved trip opens via its request pointer when both list lookups fail', async () => {
  fsdb.__seed('users/g1/joinRequests/t1', { uid: 'g1', tripId: 't1', status: 'pending' });
  fsdb.__seed('users/g1/joinRequests/other', { uid: 'g1', status: 'pending' });
  fsdb.__seed('trips/t1', { createdBy: 'admin', memberUids: ['admin'] });
  fsdb.__seed('trips/t1/members/g1', { uid: 'g1', role: 'member', status: 'active' });
  fsdb.__seed('trips/other', { createdBy: 'admin', memberUids: ['admin'] });
  fsdb.__denyQueryField('trips', 'memberUids');
  fsdb.__deny('members');
  for (let i = 0; i < 2; i++) {
    const found = await trips.listTrips('g1', false, { fresh: true });
    assert.deepEqual(found.map(trip => trip.id), ['t1']);
    assert.equal(found.incomplete, true);
    await joins.syncMyJoinRequests('g1');
  }
  assert.equal(fsdb.__dump('trips/t1/joinRequests/g1'), undefined, 'no new request for an approved member');
  assert.equal(fsdb.__dump('users/g1/joinRequests/t1').status, 'approved');
});

test('admin sweep fixes pending members, drifted uids and stale requests together', async () => {
  fsdb.__seed('trips/t1', { createdBy: 'admin', memberUids: ['admin', 'inactive'] });
  fsdb.__seed('trips/t1/members/g1', { uid: 'g1', displayName: 'น้องใหม่', role: 'member', status: 'pending' });
  fsdb.__seed('trips/t1/members/inactive', { uid: 'inactive', role: 'member', status: 'inactive' });
  fsdb.__seed('trips/t1/joinRequests/g1', { uid: 'g1', status: 'pending' });
  fsdb.__seed('trips/t1/joinRequests/new', { uid: 'new', status: 'waiting_review' });
  const report = await repair.repairTripMembership('t1');
  assert.deepEqual(report.added, ['g1'], 'the member can list the trip again');
  assert.deepEqual(report.pruned, ['inactive'], 'inactive uid removed');
  assert.deepEqual(report.activated, ['g1'], 'pending member status normalised');
  assert.deepEqual(report.resolvedRequests, ['g1'], 'already-a-member request tombstoned');
  assert.deepEqual(report.normalizedRequests, ['new'], 'unknown status becomes actionable');
  const listed = fsdb.__dump('trips/t1').memberUids;
  assert.ok(listed.includes('g1') && !listed.includes('inactive'), 'memberUids matches the member documents');
  assert.equal(fsdb.__dump('trips/t1/members/g1').status, 'active');
  assert.equal(fsdb.__dump('trips/t1/joinRequests/g1').status, 'approved');
  assert.equal(fsdb.__dump('trips/t1/joinRequests/new').status, 'pending');
});

test('admin sweep is idempotent — a second pass changes nothing', async () => {
  fsdb.__seed('trips/t1', { createdBy: 'admin', memberUids: ['admin', 'g1', 'legacy'] });
  fsdb.__seed('trips/t1/members/g1', { uid: 'g1', role: 'member', status: 'active' });
  fsdb.__seed('trips/t1/joinRequests/g1', { uid: 'g1', status: 'approved' });
  fsdb.__seed('trips/t1/joinRequests/new', { uid: 'new', status: 'pending' });
  const report = await repair.repairTripMembership('t1');
  assert.deepEqual(report.added, []);
  assert.deepEqual(report.pruned, [], 'an unmatched legacy uid is left alone');
  assert.deepEqual(report.activated, []);
  assert.deepEqual(report.resolvedRequests, []);
  assert.deepEqual(report.normalizedRequests, []);
});

test('an unreadable request queue does not block the membership half of the sweep', async () => {
  fsdb.__seed('trips/t1', { createdBy: 'admin', memberUids: ['admin'] });
  fsdb.__seed('trips/t1/members/g1', { uid: 'g1', role: 'member', status: 'pending' });
  fsdb.__deny('trips/t1/joinRequests');
  const report = await repair.repairTripMembership('t1');
  assert.equal(report.requestsUnavailable, true);
  assert.deepEqual(report.added, ['g1']);
  assert.deepEqual(report.activated, ['g1']);
  assert.equal(report.warnings.some(w => w.step === 'joinRequests'), true, 'the UI gets a clear warning');
});
