// Tiny stale-while-revalidate cache for Firestore reads.
//
// Why: every menu used to re-read the trip, the member list, the expense list and
// (since v9) the trip's expense groups from the server before it could paint, so
// each tap cost 3–7 round trips and felt slow on mobile. Reads now go through this
// cache: the first visit fills it, later visits paint instantly from memory and
// refresh in the background; writes invalidate the affected keys immediately.
//
// API
//   cachedRead(key, loader, { maxAgeMs })  → value (never rejects when a stale
//                                            value exists)
//   cachePeek(key) / cacheSet(key, value)  → manual access
//   cacheInvalidate(prefix)                → drop every key starting with prefix
//   cacheClear()                           → drop everything (used by "Refresh")

const store = new Map();     // key -> { value, ts }
const inflight = new Map();  // key -> Promise (dedupe concurrent reads)

const DEFAULT_MAX_AGE = 60 * 1000;   // served without asking the server again

export function cachePeek(key) {
  const hit = store.get(key);
  return hit ? { value: hit.value, age: Date.now() - hit.ts } : null;
}

export function cacheSet(key, value) {
  store.set(key, { value, ts: Date.now() });
  return value;
}

export function cacheInvalidate(prefix) {
  if (!prefix) return;
  for (const key of [...store.keys()]) {
    if (key === prefix || key.startsWith(prefix)) store.delete(key);
  }
}

/**
 * Forget a key (or every key with a prefix) in BOTH layers.
 *
 * Always use this before writing: leaving a persisted (localStorage) copy behind
 * would make the next read serve the stale value again — that is exactly the bug
 * that made a freshly approved member invisible.
 */
export function cacheForget(prefix) {
  if (!prefix) return;
  cacheInvalidate(prefix);
  try {
    for (const key of Object.keys(localStorage)) {
      if (!key.startsWith(PERSIST_PREFIX)) continue;
      const bare = key.slice(PERSIST_PREFIX.length);
      if (bare === prefix || bare.startsWith(prefix)) localStorage.removeItem(key);
    }
  } catch { /* ignore */ }
}

export function cacheClear() {
  store.clear();
  inflight.clear();
  // persisted mirrors too — "Refresh" must really go back to the server
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PERSIST_PREFIX)) localStorage.removeItem(key);
    }
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ *
 * Persistent mirror — lets a *reloaded* page paint the trip, its groups
 * and the member list before the first Firestore response arrives.
 * ------------------------------------------------------------------ */
const PERSIST_PREFIX = 'fuji_cache:';
const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;   // 24h: cache, not a stale archive

export function persistSet(key, value) {
  try {
    localStorage.setItem(PERSIST_PREFIX + key, JSON.stringify({ value, ts: Date.now() }));
  } catch { /* quota / private mode — memory cache still works */ }
}

export function persistGet(key, { maxAgeMs = PERSIST_MAX_AGE } = {}) {
  try {
    const raw = localStorage.getItem(PERSIST_PREFIX + key);
    if (!raw) return null;
    const { value, ts } = JSON.parse(raw);
    if (!ts || Date.now() - ts > maxAgeMs) { localStorage.removeItem(PERSIST_PREFIX + key); return null; }
    return value === undefined ? null : value;
  } catch { return null; }
}

export function persistDelete(key) {
  try { localStorage.removeItem(PERSIST_PREFIX + key); } catch { /* ignore */ }
}

/**
 * Seed the memory cache from the persistent mirror (marked stale, so the value
 * is served immediately and refreshed in the background).
 */
export function seedFromPersist(key) {
  if (store.has(key)) return false;
  const seed = persistGet(key);
  if (seed === null) return false;
  cacheSet(key, seed);
  cacheStale(key);
  return true;
}

export function cacheStats() {
  return { size: store.size, inflight: inflight.size, keys: [...store.keys()] };
}

function run(key, loader) {
  const pending = inflight.get(key);
  if (pending) return pending;
  const promise = Promise.resolve()
    .then(loader)
    .then((value) => {
      store.set(key, { value, ts: Date.now() });
      inflight.delete(key);
      return value;
    })
    .catch((e) => {
      inflight.delete(key);
      throw e;
    });
  inflight.set(key, promise);
  return promise;
}

/**
 * Read `key` through the cache.
 *
 * - fresh value → returned immediately, no request
 * - stale value → returned immediately, refreshed in the background
 * - nothing yet → awaits the loader (concurrent callers share one request)
 *
 * @param {string} key
 * @param {() => Promise<any>} loader
 * @param {{maxAgeMs?: number, background?: boolean}} [options]
 *   `background: false` disables the silent refresh (only used by tests).
 */
export async function cachedRead(key, loader, { maxAgeMs = DEFAULT_MAX_AGE, background = true } = {}) {
  const hit = store.get(key);
  if (hit) {
    const age = Date.now() - hit.ts;
    if (age <= maxAgeMs) return hit.value;
    if (background) {
      run(key, loader).catch((e) => console.warn(`[cache] refresh failed for ${key}`, e?.message || e));
      return hit.value;
    }
  }
  return run(key, loader);
}

/** Force the next read of `key` to hit the server (keeps serving the old value). */
export function cacheStale(key) {
  const hit = store.get(key);
  if (hit) hit.ts = 0;
}
