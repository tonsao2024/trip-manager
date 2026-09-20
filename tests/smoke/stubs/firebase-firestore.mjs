// In-memory Firestore stand-in for the jsdom smoke test.
// Supports the subset the app uses: collection/doc/query/where/orderBy/limit,
// get/getDocs/setDoc/addDoc/updateDoc/deleteDoc, writeBatch, onSnapshot,
// serverTimestamp, Timestamp, arrayUnion/arrayRemove, increment, getCountFromServer.

const store = new Map(); // "trips/t1/expenses/e1" -> plain data object

export const __store = store;
export function __reset() { store.clear(); denyPaths = []; }

// --- simulated security rules: __deny('trips/t1/joinRequests') blocks a path ---
let denyPaths = [];
export function __deny(prefix) { denyPaths.push(prefix); }
export function __allowAll() { denyPaths = []; }
export function __allow(prefix) { denyPaths = denyPaths.filter(p => p !== prefix); }
function denyCheck(path) {
  if (denyPaths.some(p => path.startsWith(p))) {
    const err = new Error('Missing or insufficient permissions.');
    err.code = 'permission-denied';
    throw err;
  }
}
export function __seed(path, data) { store.set(path, { ...data }); }
export function __dump(path) { return store.get(path); }

// --- simulated network: read latency + a counter, so the smoke test can prove
// --- that switching menus does not cost a chain of round trips.
let readLatencyMs = 0;
const readCounts = new Map();
export function __setReadLatency(ms) { readLatencyMs = Math.max(0, Number(ms) || 0); }
export function __readStats() {
  const byPath = Object.fromEntries([...readCounts.entries()].sort((a, b) => b[1] - a[1]));
  return { total: [...readCounts.values()].reduce((n, v) => n + v, 0), byPath };
}
export function __resetReadStats() { readCounts.clear(); }
function countRead(path) {
  readCounts.set(path, (readCounts.get(path) || 0) + 1);
  if (!readLatencyMs) return Promise.resolve();
  return new Promise(r => setTimeout(r, readLatencyMs));
}

const segPath = (segs) => segs.filter(s => typeof s === 'string' && s.length).join('/');
const isMarker = (v) => v && typeof v === 'object' && typeof v.__fsMarker === 'string';

class Timestamp {
  constructor(seconds, nanoseconds = 0) { this.seconds = seconds; this.nanoseconds = nanoseconds; }
  static now() { return new Timestamp(Math.floor(Date.now() / 1000)); }
  static fromDate(d) { return new Timestamp(Math.floor(d.getTime() / 1000), (d.getMilliseconds() * 1e6) | 0); }
  static fromMillis(ms) { return Timestamp.fromDate(new Date(ms)); }
  toDate() { return new Date(this.seconds * 1000); }
  toMillis() { return this.seconds * 1000; }
  isEqual(other) { return other && other.seconds === this.seconds && other.nanoseconds === this.nanoseconds; }
  valueOf() { return this.toMillis(); }
}

export function getFirestore() { return { __db: true }; }
export function initializeFirestore() { return { __db: true }; }
export function enableIndexedDbPersistence() { return Promise.resolve(); }
export function serverTimestamp() { return { __fsMarker: 'serverTimestamp' }; }
export function deleteField() { return { __fsMarker: 'deleteField' }; }
export function arrayUnion(...values) { return { __fsMarker: 'arrayUnion', values }; }
export function arrayRemove(...values) { return { __fsMarker: 'arrayRemove', values }; }
export function increment(n = 1) { return { __fsMarker: 'increment', n }; }
export function documentId() { return '__name__'; }
export { Timestamp };

export function collection(db, ...segs) {
  if (!segs.length) throw new Error('[stub] collection() needs a path');
  return { __type: 'collection', path: segPath(segs) };
}

export function doc(dbOrRef, ...segs) {
  if (dbOrRef && dbOrRef.__type === 'collection') {
    const id = segs.length ? segPath(segs) : Math.random().toString(36).slice(2, 12);
    return { __type: 'doc', path: `${dbOrRef.path}/${id}`, id };
  }
  if (!segs.length) throw new Error('[stub] doc() needs a path');
  const path = segPath(segs);
  return { __type: 'doc', path, id: path.split('/').pop() };
}

export function query(ref, ...constraints) { return { __type: 'query', ref, constraints: constraints.filter(Boolean) }; }
export function where(field, op, value) { return { __type: 'where', field, op, value }; }
export function orderBy(field, direction = 'asc') { return { __type: 'orderBy', field, direction }; }
export function limit(n) { return { __type: 'limit', n }; }
export function startAfter(cursor) { return { __type: 'startAfter', cursor }; }
export function endAt() { return { __type: 'endAt' }; }

function readField(data, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), data);
}

function toComparable(v) {
  if (v && typeof v === 'object' && typeof v.seconds === 'number') return v.seconds;
  return v;
}

function matchWhere(data, c) {
  const actual = readField(data, c.field);
  const value = c.value;
  switch (c.op) {
    case '==': return toComparable(actual) === toComparable(value) || actual === value;
    case '!=': return toComparable(actual) !== toComparable(value);
    case '>': return toComparable(actual) > toComparable(value);
    case '>=': return toComparable(actual) >= toComparable(value);
    case '<': return toComparable(actual) < toComparable(value);
    case '<=': return toComparable(actual) <= toComparable(value);
    case 'in': return Array.isArray(value) && value.includes(actual);
    case 'array-contains': return Array.isArray(actual) && actual.includes(value);
    case 'array-contains-any': return Array.isArray(actual) && value.some(v => actual.includes(v));
    default: return true;
  }
}

function childDocs(collectionPath) {
  const prefix = `${collectionPath}/`;
  return [...store.entries()]
    .filter(([p]) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
    .map(([p, data]) => ({ id: p.split('/').pop(), path: p, data }));
}

function snapshotDocs(entries) {
  return entries.map(({ id, path, data }) => ({
    id,
    ref: { __type: 'doc', path, id },
    exists: () => true,
    data: () => ({ ...data }),
    get: (field) => readField(data, field)
  }));
}

function makeSnapshot(entries, collectionPath) {
  const docs = snapshotDocs(entries);
  return {
    docs,
    size: docs.length,
    empty: docs.length === 0,
    metadata: { fromCache: false, hasPendingWrites: false },
    forEach: (cb) => docs.forEach(cb),
    docChanges: () => docs.map(d => ({ type: 'added', doc: d })),
    ref: { __type: 'collection', path: collectionPath }
  };
}

function resolveCollectionPath(target) {
  if (target.__type === 'query') return resolveCollectionPath(target.ref);
  return target.path;
}

export async function getDocs(target) {
  const path = resolveCollectionPath(target);
  denyCheck(path);
  await countRead(path);
  const constraints = target.__type === 'query' ? target.constraints : [];
  let entries = childDocs(path);
  for (const c of constraints) {
    if (c.__type === 'where') entries = entries.filter(e => matchWhere(e.data, c));
  }
  const order = constraints.filter(c => c.__type === 'orderBy');
  for (const o of order) {
    entries.sort((a, b) => {
      const av = toComparable(readField(a.data, o.field));
      const bv = toComparable(readField(b.data, o.field));
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return o.direction === 'desc' ? -cmp : cmp;
    });
  }
  const lim = constraints.find(c => c.__type === 'limit');
  if (lim) entries = entries.slice(0, lim.n);
  return makeSnapshot(entries, path);
}

export async function getDoc(ref) {
  denyCheck(ref.path);
  await countRead(ref.path);
  const data = store.get(ref.path);
  if (!data) {
    return { id: ref.id, ref, exists: () => false, data: () => undefined, get: () => undefined };
  }
  return { id: ref.id, ref, exists: () => true, data: () => ({ ...data }), get: (f) => readField(data, f) };
}

function applyValue(existing, key, value) {
  if (isMarker(value)) {
    if (value.__fsMarker === 'serverTimestamp') return new Timestamp(Math.floor(Date.now() / 1000), 0);
    if (value.__fsMarker === 'deleteField') return undefined;
    if (value.__fsMarker === 'arrayUnion') {
      const arr = Array.isArray(existing) ? existing.slice() : [];
      value.values.forEach(v => { if (!arr.some(x => JSON.stringify(x) === JSON.stringify(v))) arr.push(v); });
      return arr;
    }
    if (value.__fsMarker === 'arrayRemove') {
      const arr = Array.isArray(existing) ? existing.slice() : [];
      return arr.filter(x => !value.values.some(v => JSON.stringify(v) === JSON.stringify(x)));
    }
    if (value.__fsMarker === 'increment') return (Number(existing) || 0) + value.n;
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
    const base = (existing && typeof existing === 'object' && !Array.isArray(existing)) ? { ...existing } : {};
    for (const [k, v] of Object.entries(value)) {
      const next = applyValue(base[k], k, v);
      if (next === undefined) delete base[k]; else base[k] = next;
    }
    return base;
  }
  return value;
}

function mergeData(existing, incoming, merge) {
  const out = merge && existing ? { ...existing } : {};
  for (const [k, v] of Object.entries(incoming || {})) {
    const next = applyValue(out[k], k, v);
    if (next === undefined) delete out[k]; else out[k] = next;
  }
  return out;
}

export async function setDoc(ref, data, opts = {}) {
  denyCheck(ref.path);
  const existing = store.get(ref.path);
  store.set(ref.path, mergeData(existing, data, opts.merge));
}

export async function addDoc(coll, data) {
  denyCheck(coll.path);
  const id = `auto-${Math.random().toString(36).slice(2, 10)}`;
  const path = `${coll.path}/${id}`;
  store.set(path, mergeData(null, data, false));
  return { id, path, __type: 'doc' };
}

export async function updateDoc(ref, data) {
  denyCheck(ref.path);
  const existing = store.get(ref.path);
  if (!existing) throw new Error(`[stub] updateDoc missing doc ${ref.path}`);
  store.set(ref.path, mergeData(existing, data, true));
}

export async function deleteDoc(ref) { denyCheck(ref.path); store.delete(ref.path); }

export function writeBatch() {
  const ops = [];
  return {
    set: (ref, data, opts) => ops.push(() => setDoc(ref, data, opts || {})),
    update: (ref, data) => ops.push(() => updateDoc(ref, data)),
    delete: (ref) => ops.push(() => deleteDoc(ref)),
    commit: async () => { for (const op of ops) await op(); ops.length = 0; }
  };
}

export function onSnapshot(target, onNext, onError) {
  const emit = async () => {
    try {
      const path = resolveCollectionPath(target);
      if (target && target.__type === 'doc') {
        const data = store.get(path);
        onNext({ id: path.split('/').pop(), exists: () => !!data, data: () => ({ ...(data || {}) }) });
        return;
      }
      const snap = await getDocs(target);
      onNext(snap);
    } catch (e) { if (onError) onError(e); }
  };
  setTimeout(emit, 0);
  return () => {};
}

export async function getCountFromServer(target) {
  const snap = await getDocs(target);
  return { data: () => ({ count: snap.size }) };
}

export async function waitForPendingWrites() { return undefined; }
export function clearIndexedDbPersistence() { return Promise.resolve(); }

export default {
  getFirestore, collection, doc, query, where, orderBy, limit, getDocs, getDoc,
  setDoc, addDoc, updateDoc, deleteDoc, writeBatch, onSnapshot, serverTimestamp, Timestamp
};
