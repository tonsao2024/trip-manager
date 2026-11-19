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
const trips = await import(pathToFileURL(path.join(outDir, 'trips/index.js')).href);
const joins = await import(pathToFileURL(path.join(outDir, 'members/join.js')).href);
const repair = await import(pathToFileURL(path.join(outDir, 'members/repair.js')).href);

beforeEach(() => {
  fsdb.__reset();
  localStorage.clear();
  trips.clearTripsCache();
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

test('member sync clears a stale mirror for a joined trip without re-creating a request', async () => {
  fsdb.__seed('trips/t1', { createdBy: 'admin', memberUids: ['admin', 'g1'] });
  fsdb.__seed('users/g1/joinRequests/t1', { uid: 'g1', tripId: 't1', status: 'pending' });
  const report = await joins.syncMyJoinRequests('g1', { joinedTripIds: ['t1'] });
  assert.deepEqual(report.cleared, ['t1']);
  assert.equal(fsdb.__dump('users/g1/joinRequests/t1'), undefined, 'no more “รออนุมัติ” badge');
  assert.equal(fsdb.__dump('trips/t1/joinRequests/g1'), undefined, 'no ghost request in the admin queue');
});

test('member sync drops the mirror of an approved request and copies a rejection', async () => {
  fsdb.__seed('trips/t1/joinRequests/g1', { uid: 'g1', status: 'approved' });
  fsdb.__seed('trips/t2/joinRequests/g1', { uid: 'g1', status: 'rejected' });
  fsdb.__seed('users/g1/joinRequests/t1', { uid: 'g1', tripId: 't1', status: 'pending' });
  fsdb.__seed('users/g1/joinRequests/t2', { uid: 'g1', tripId: 't2', status: 'pending' });
  const report = await joins.syncMyJoinRequests('g1');
  assert.deepEqual(report.cleared, ['t1']);
  assert.deepEqual(report.updated, ['t2']);
  assert.equal(fsdb.__dump('users/g1/joinRequests/t2')?.status, 'rejected');
});

test('a denied trip-side read is reported, never guessed at or silently discarded', async () => {
  fsdb.__seed('users/g1/joinRequests/t1', { uid: 'g1', tripId: 't1', status: 'pending' });
  fsdb.__deny('trips/t1/joinRequests');
  const report = await joins.syncMyJoinRequests('g1');
  assert.equal(report.created.length, 0, 'no blind write');
  assert.equal(report.denied.length, 1, 'the UI can explain that rules must be published');
  assert.equal(fsdb.__dump('trips/t1/joinRequests/g1'), undefined);
  assert.ok(fsdb.__dump('users/g1/joinRequests/t1'), 'the member’s request is kept');
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

/* ------------------------------------------------------------------ *
 * A newly approved member must get in even when the listing drifted and the
 * collection-group index is not deployed yet (the reported incident).
 * ------------------------------------------------------------------ */

test('approval always lands the uid in memberUids — never skipped because a cached trip looked right', async () => {
  fsdb.__seed('trips/t1', { createdBy: 'admin', memberUids: ['admin'] });
  fsdb.__seed('trips/t1/members/g1', { uid: 'g1', role: 'member', status: 'active' });
  // The device's cache claims g1 is already listed; the server copy does not.
  // Deciding from that snapshot is how an approval created the member document
  // but left the trip listing empty (admin sees them, they see no trip).
  fsdb.__staleGet('trips/t1', { createdBy: 'admin', memberUids: ['admin', 'g1'] });
  const result = await joins.approveJoinRequest('t1', { uid: 'g1', displayName: 'น้องใหม่' });
  assert.equal(result.listed, true, 'the approval reports the listing as verified');
  assert.deepEqual(fsdb.__dump('trips/t1').memberUids, ['admin', 'g1'], 'server array repaired');
  assert.deepEqual(fsdb.__dump('trips/t1/members/g1').status, 'active');
});

test('approving twice does not duplicate the memberUids entry', async () => {
  fsdb.__seed('trips/t1', { createdBy: 'admin', memberUids: ['admin', 'g1'] });
  await joins.approveJoinRequest('t1', { uid: 'g1' });
  await joins.approveJoinRequest('t1', { uid: 'g1' });
  assert.deepEqual(fsdb.__dump('trips/t1').memberUids, ['admin', 'g1']);
});

test('an approved member gets in through their join mirror when the list query and discovery both fail', async () => {
  fsdb.__seed('trips/t1', { createdBy: 'admin', memberUids: ['admin'] });
  fsdb.__seed('trips/t1/members/g1', { uid: 'g1', status: 'active' });
  fsdb.__seed('users/g1/joinRequests/t1', { uid: 'g1', tripId: 't1', status: 'approved' });
  // Exactly the production combination: the memberUids entry is missing (so the
  // indexed query finds nothing) and the collection-group index is not deployed
  // (so member-document discovery fails too).
  fsdb.__denyQueryField('trips', 'memberUids');
  fsdb.__deny('members');
  const found = await trips.listTrips('g1');
  assert.deepEqual(found.map(t => t.id), ['t1'], 'the trip named by the member’s own request is readable by id');
  assert.ok(fsdb.__dump('trips/t1').memberUids.includes('g1'), 'the listing is repaired on the way');
  assert.equal(found.incomplete, true, 'the page can still say it was a partial check');
});

test('a trip remembered on the device is re-checked even after the mirror is gone', async () => {
  fsdb.__seed('trips/t9', { createdBy: 'admin', memberUids: ['admin'] });
  fsdb.__seed('trips/t9/members/g9', { uid: 'g9', status: 'active' });
  joins.rememberJoinTarget('g9', 't9');
  fsdb.__denyQueryField('trips', 'memberUids');
  fsdb.__deny('members');
  const found = await trips.listTrips('g9');
  assert.deepEqual(found.map(t => t.id), ['t9']);
  assert.ok(fsdb.__dump('trips/t9').memberUids.includes('g9'));
});

test('a request the admin has not approved yet stays pending — no trip and no scary error', async () => {
  fsdb.__seed('trips/t2', { createdBy: 'admin', memberUids: ['admin'] });
  fsdb.__seed('users/g2/joinRequests/t2', { uid: 'g2', tripId: 't2', status: 'pending' });
  // Not a member: the rules keep the trip document closed.
  fsdb.__deny('trips/t2');
  const found = await trips.listTrips('g2');
  assert.deepEqual(found, [], 'no trip invented for a pending request');
});

test('a failed lookup reports which source failed instead of one generic sentence', async () => {
  fsdb.__denyQueryField('trips', 'memberUids');
  fsdb.__deny('members');
  const error = await trips.listTrips('member').then(() => null, e => e);
  assert.equal(error.code, 'trip-list-incomplete');
  assert.ok(Array.isArray(error.details) && error.details.length >= 2, 'per-source details for the notice');
  assert.ok(error.details.some(d => d.code === 'failed-precondition'), 'the missing index is named');
  assert.equal(error.requiresDeploy, true, 'the UI knows to point at rules/indexes');
});
