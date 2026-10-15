import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dispatch, memberIds, recipientsFor, messageData, LIMITS } from '../sender.mjs';
import { firestoreStore } from '../firebase.mjs';

const now = Date.now();
const ts = millis => ({ toMillis: () => millis });
const appUrl = 'https://example.github.io/trip-manager/';
const note = (extra = {}) => ({ createdBy: 'alice', createdAt: ts(now - 60000), type: 'expense', title: 'Dinner', body: '฿120',
  recipients: ['alice', 'bob', 'outsider'], pushDelivery: { state: 'pending' }, ...extra });

function fixture(notes = [note()]) {
  const entries = notes.map((data, i) => ({ path: `trips/trip1/notifications/note${i}`, data, version: 1 }));
  const prefs = { bob: { push: true }, alice: { push: true } };
  const tokens = { bob: [{ path: 'users/bob/pushTokens/device', data: { token: 'bob-device', tripIds: ['trip1'] } }],
    alice: [{ path: 'users/alice/pushTokens/device', data: { token: 'alice-device' } }] };
  const messages = [], removed = [];
  let finishesFail = false;
  const store = {
    async expire(before, max) {
      let n = 0;
      for (const item of entries) if (n < max && item.data.pushDelivery.state === 'pending' && item.data.createdAt.toMillis() < before) {
        item.data.pushDelivery = { state: 'expired' }; item.version++; n++;
      }
      return n;
    },
    async pending(since, upper, max) {
      return entries.filter(x => x.data.pushDelivery.state === 'pending' && x.data.createdAt.toMillis() >= since && x.data.createdAt.toMillis() <= upper)
        .sort((a, b) => a.data.createdAt.toMillis() - b.data.createdAt.toMillis()).slice(0, max).map(e => ({ ...e, data: { ...e.data } }));
    },
    async trip() { return { createdBy: 'alice', memberUids: ['alice', 'bob'] }; },
    async members() { return []; },
    async prefs(uid) { return prefs[uid] || null; },
    async tokens(uid) { return tokens[uid] || []; },
    async claim(item, delivery) {
      const current = entries.find(e => e.path === item.path);
      if (current.version !== item.version || current.data.pushDelivery.state !== 'pending') return false;
      current.data.pushDelivery = delivery; current.version++;
      return true;
    },
    async finish(path, result) {
      if (finishesFail) throw new Error('Firestore unavailable after FCM accepted');
      entries.find(e => e.path === path).data.pushDelivery = result;
    },
    async removeToken(path) { removed.push(path); }
  };
  const messaging = { async send(message) { messages.push(message); return 'fcm-result'; } };
  return { store, messaging, entries, prefs, tokens, messages, removed,
    failFinish() { finishesFail = true; }, run: () => dispatch({ store, messaging, appUrl, now, runId: 'test-run' }) };
}

test('sends pending queue once, intersects membership, excludes author and sends data-only FCM', async () => {
  const f = fixture();
  const result = await f.run();
  assert.equal(result.sent, 1);
  assert.equal(f.messages[0].token, 'bob-device');
  assert.equal(f.messages[0].notification, undefined);
  assert.equal(f.messages[0].webpush.headers.Urgency, 'high');
  assert.equal(f.messages[0].data.url, `${appUrl}#/trip/trip1/dashboard`);
  assert.equal(f.entries[0].data.pushDelivery.state, 'complete');
  assert.equal((await f.run()).sent, 0);
  assert.equal(f.messages.length, 1);
});

test('concurrent scheduled/manual jobs atomically claim only once', async () => {
  const f = fixture();
  const results = await Promise.all([f.run(), f.run(), f.run()]);
  assert.equal(results.reduce((n, r) => n + r.sent, 0), 1);
  assert.equal(f.messages.length, 1);
});

test('no replay after FCM failure or a crash before completion receipt is saved', async () => {
  const f = fixture();
  f.failFinish();
  assert.equal((await f.run()).errors, 1);
  assert.equal(f.entries[0].data.pushDelivery.state, 'claimed');
  await f.run();
  assert.equal(f.messages.length, 1);
  const failed = fixture();
  failed.messaging.send = async () => { throw new Error('Ambiguous network timeout'); };
  assert.equal((await failed.run()).failed, 1);
  assert.equal(failed.entries[0].data.pushDelivery.state, 'partial');
  assert.equal((await failed.run()).scanned, 0);
});

test('preflight network errors stay pending for safe retry before any sends', async () => {
  const f = fixture();
  const original = f.store.trip;
  f.store.trip = async () => { throw new Error('temporary'); };
  assert.equal((await f.run()).errors, 1);
  assert.equal(f.entries[0].data.pushDelivery.state, 'pending');
  assert.equal(f.messages.length, 0);
  f.store.trip = original;
  assert.equal((await f.run()).sent, 1);
});

test('sender honors push/category/device/trip preferences and never broadcasts test messages', async () => {
  for (const prefs of [null, { push: false }, { push: true, enabled: false }, { push: true, expense: false }]) {
    const f = fixture(); f.prefs.bob = prefs;
    assert.equal((await f.run()).sent, 0);
  }
  const f = fixture();
  f.tokens.bob = [
    { path: 'x', data: { token: 'disabled', enabled: false } },
    { path: 'y', data: { token: 'other-trip', tripIds: ['trip2'] } }
  ];
  assert.equal((await f.run()).sent, 0);
  const t = fixture([note({ type: 'test', recipients: ['bob', 'outsider'] })]);
  assert.equal((await t.run()).sent, 1);
  assert.equal(t.messages[0].token, 'alice-device');
});

test('inactive/removed authors are skipped; duplicate device tokens are sent once', async () => {
  const f = fixture();
  f.store.members = async () => [{ id: 'alice', data: { status: 'inactive' } }];
  assert.equal((await f.run()).skipped, 1);
  assert.equal(f.messages.length, 0);
  assert.deepEqual([...memberIds({ memberUids: ['alice', 'bob'] }, [{ id: 'bob', data: { status: 'inactive' } }])], ['alice']);
  const d = fixture(); d.tokens.bob.push(d.tokens.bob[0]);
  assert.equal((await d.run()).sent, 1);
});

test('old backlog expires without sending; bounded batches eventually drain', async () => {
  const f = fixture([note({ createdAt: ts(now - LIMITS.maxAgeMs - 1) }), note({ createdAt: ts(now - 3600000) })]);
  const result = await f.run();
  assert.equal(result.expired, 1);
  assert.equal(result.sent, 1); // Delayed by an hour is fine, unlike the old Worker 10-minute window.
  const batch = fixture(Array.from({ length: LIMITS.notes + 2 }, () => note()));
  assert.equal((await batch.run()).scanned, LIMITS.notes);
  assert.equal((await batch.run()).scanned, 2);
});

test('invalid notes and unsafe links cannot leak messages to arbitrary URLs/accounts', () => {
  const members = new Set(['alice', 'bob']);
  for (const n of [note({ createdBy: 'outsider' }), note({ type: '__proto__' }), note({ createdAt: '2026-10-14' }), note({ body: {} })]) {
    assert.throws(() => recipientsFor(n, members, now));
  }
  for (const link of ['https://evil.example/', 'javascript:alert(1)', '#/trip/other/page']) {
    assert.equal(messageData(note({ link }), 'trip1', 'note1', appUrl).url, `${appUrl}#/trip/trip1/dashboard`);
  }
  assert.equal(messageData(note({ link: '#/trip/trip1/expenses?id=1' }), 'trip1', 'note1', appUrl).url,
    `${appUrl}#/trip/trip1/expenses?id=1`);
});

test('only unregistered tokens are deleted; recipient cap rejects before first send', async () => {
  const f = fixture();
  f.messaging.send = async () => { throw Object.assign(new Error(), { code: 'messaging/registration-token-not-registered' }); };
  assert.equal((await f.run()).failed, 1);
  assert.deepEqual(f.removed, ['users/bob/pushTokens/device']);
  const auth = fixture();
  auth.messaging.send = async () => { throw Object.assign(new Error(), { code: 'messaging/authentication-error' }); };
  await auth.run(); assert.equal(auth.removed.length, 0);
  const many = fixture([note({ recipients: [] })]);
  many.store.trip = async () => ({ createdBy: 'alice', memberUids: Array.from({ length: LIMITS.recipients + 1 }, (_, i) => `u${i}`) });
  assert.equal((await many.run()).skipped, 1);
  assert.equal(many.messages.length, 0);
});

test('Firestore transaction rejects stale/nonpending snapshots and persists a server-only claim', async () => {
  const updates = [];
  let version = 3, state = 'pending';
  const db = {
    doc: path => ({ path }),
    async runTransaction(fn) { return fn({
      async get() { return { exists: true, updateTime: { isEqual: other => other === version }, get: () => state }; },
      update(ref, data) { updates.push({ ref, data }); state = data.pushDelivery.state; }
    }); }
  };
  const store = firestoreStore(db);
  const item = { path: 'trips/t1/notifications/n1', version: 2 };
  assert.equal(await store.claim(item, { state: 'claimed' }), false);
  item.version = 3;
  assert.equal(await store.claim(item, { state: 'claimed' }), true);
  assert.equal(await store.claim(item, { state: 'claimed' }), false);
  assert.equal(updates.length, 1);
  assert.ok(updates[0].data.pushDelivery.updatedAt);
});

test('queue queries use indexed pending state, timestamps and a strict batch limit', async () => {
  const calls = [];
  const query = {
    where(...args) { calls.push(['where', ...args]); return this; },
    orderBy(...args) { calls.push(['orderBy', ...args]); return this; },
    limit(n) { calls.push(['limit', n]); return this; },
    async get() { return { docs: [] }; }
  };
  const store = firestoreStore({ collectionGroup: name => { assert.equal(name, 'notifications'); return query; } });
  await store.pending(now - LIMITS.maxAgeMs, now, 20);
  assert.deepEqual(calls[0], ['where', 'pushDelivery.state', '==', 'pending']);
  assert.equal(calls[1][2], '>='); assert.equal(calls[2][2], '<=');
  assert.deepEqual(calls.at(-1), ['limit', 20]);
});

test('completion receipt cannot overwrite a replaced claim or a new pending document', async () => {
  let state = 'pending', runId = 'other-run', writes = 0;
  const db = { doc: path => ({ path }), async runTransaction(fn) { return fn({
    async get() { return { exists: true, get: field => field === 'pushDelivery.state' ? state : runId }; },
    update() { writes++; }
  }); } };
  const store = firestoreStore(db);
  await assert.rejects(store.finish('trips/t1/notifications/n1', { state: 'complete', runId: 'my-run' }));
  state = 'claimed';
  await assert.rejects(store.finish('trips/t1/notifications/n1', { state: 'complete', runId: 'my-run' }));
  runId = 'my-run';
  await store.finish('trips/t1/notifications/n1', { state: 'complete', runId: 'my-run' });
  assert.equal(writes, 1);
});
