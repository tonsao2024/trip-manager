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
