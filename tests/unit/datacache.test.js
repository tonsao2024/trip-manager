// stale-while-revalidate cache: the invalidation epoch must stop a read that was
// in flight BEFORE a write from re-caching (or re-persisting) its stale result,
// and a read started AFTER the write must fetch fresh instead of being handed the
// old in-flight promise. This is the race that could hide a freshly added expense.
import {
  cachedRead, cachePeek, cacheSet, cacheInvalidate, cacheForget, cacheClear,
  cacheStats, persistGet,
} from '../../src/js/utils/datacache.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }
const eq = (a, b, msg) => assert(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);
const tick = () => new Promise(r => setTimeout(r, 0));

// A localStorage whose stored keys are own enumerable properties, so the cache's
// `Object.keys(localStorage)` sweeps behave like a real browser.
function freshLocalStorage() {
  const ls = {};
  Object.defineProperties(ls, {
    getItem: { value: (k) => (Object.prototype.hasOwnProperty.call(ls, k) ? ls[k] : null) },
    setItem: { value: (k, v) => { ls[k] = String(v); } },
    removeItem: { value: (k) => { delete ls[k]; } },
    clear: { value: () => { for (const k of Object.keys(ls)) delete ls[k]; } },
  });
  return ls;
}
const origLS = globalThis.localStorage;
function withLS(fn) {
  return async () => {
    globalThis.localStorage = freshLocalStorage();
    try { cacheClear(); await fn(); }
    finally { cacheClear(); globalThis.localStorage = origLS; }
  };
}

export const testInFlightReadDoesNotReCacheAfterInvalidation = withLS(async () => {
  let resolveLoad;
  const loader = () => new Promise(r => { resolveLoad = r; });
  const pending = cachedRead('race:exps', loader, { background: false });
  await tick();
  assert(cacheStats().inflight >= 1, 'the read is in flight');

  cacheInvalidate('race:exps');          // a write lands mid-read
  resolveLoad([{ id: 'old' }]);          // the pre-write read finally resolves
  const val = await pending;

  eq(val[0].id, 'old', 'the original caller still receives its result');
  eq(cachePeek('race:exps'), null, 'the stale result is NOT re-cached');
  eq(persistGet('race:exps'), null, 'the stale result is NOT persisted');
});

export const testReReadAfterInvalidationFetchesFresh = withLS(async () => {
  let resolveOld;
  const oldLoader = () => new Promise(r => { resolveOld = r; });
  const first = cachedRead('reread:exps', oldLoader, { background: false });
  await tick();
  cacheInvalidate('reread:exps');

  let freshCalled = false;
  const freshLoader = () => { freshCalled = true; return Promise.resolve([{ id: 'new' }]); };
  const second = await cachedRead('reread:exps', freshLoader, { background: false });

  assert(freshCalled, 'a fresh loader runs after invalidation (not the stale in-flight one)');
  eq(second[0].id, 'new', 'the re-read returns fresh data');

  resolveOld([{ id: 'old' }]);           // the abandoned read resolves late
  await first;
  await tick();
  eq(cachePeek('reread:exps').value[0].id, 'new', 'the late stale read does not clobber the fresh cache');
  eq(persistGet('reread:exps')[0].id, 'new', 'the persisted mirror stays fresh too');
});

export const testCacheForgetAlsoGuardsInFlight = withLS(async () => {
  let resolveLoad;
  const pending = cachedRead('forget:trip', () => new Promise(r => { resolveLoad = r; }), { background: false });
  await tick();
  cacheForget('forget:trip');            // the write-path helper
  resolveLoad({ name: 'stale' });
  await pending;
  eq(cachePeek('forget:trip'), null, 'cacheForget drops the in-flight read as well');
  eq(persistGet('forget:trip'), null, 'cacheForget leaves no persisted stale copy');
});

export const testCacheClearGuardsInFlight = withLS(async () => {
  let resolveLoad;
  const pending = cachedRead('clear:trip', () => new Promise(r => { resolveLoad = r; }), { background: false });
  await tick();
  cacheClear();                          // "Refresh"
  resolveLoad({ name: 'stale' });
  await pending;
  eq(cachePeek('clear:trip'), null, 'cacheClear prevents the abandoned read from repopulating');
});

export const testConcurrentReadsStillDedupe = withLS(async () => {
  let calls = 0;
  const loader = () => { calls++; return new Promise(r => setTimeout(() => r(['x']), 5)); };
  const [a, b] = await Promise.all([
    cachedRead('dedupe:k', loader, { background: false }),
    cachedRead('dedupe:k', loader, { background: false }),
  ]);
  eq(calls, 1, 'concurrent reads share a single loader');
  eq(a[0], 'x', 'first caller gets the value');
  eq(b[0], 'x', 'second caller gets the value');
});

export const testFreshHitSkipsTheLoader = withLS(async () => {
  cacheSet('hit:k', ['cached']);
  let calls = 0;
  const val = await cachedRead('hit:k', () => { calls++; return Promise.resolve(['fresh']); }, { background: false });
  eq(calls, 0, 'a fresh cache hit does not call the loader');
  eq(val[0], 'cached', 'the cached value is returned');
});

export const testNormalReadCachesAndPersists = withLS(async () => {
  const val = await cachedRead('persist:k', () => Promise.resolve(['v']), { background: false });
  eq(val[0], 'v', 'the loader value is returned');
  eq(cachePeek('persist:k').value[0], 'v', 'the value is cached in memory');
  eq(persistGet('persist:k')[0], 'v', 'the value is persisted for the next page load');
});
