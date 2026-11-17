// Visit statistics — the Firestore half.
//
//   visitStats/{uid}              { uid, lastSeenAt, sessions, totalMs, tripIds[] }
//   visitStats/{uid}/trips/{id}   { tripId, sessions, ms, lastSeenAt }
//
// Why two tiny documents instead of one nested map: Firestore only understands
// dotted field paths in `update()`, *not* in `set(…, {merge:true})`, and a
// `merge` on a nested map replaces the whole map (which would erase the numbers
// of the other trips). Two flat documents stay correct under increments.
//
// Design rules that keep the FREE Spark plan comfortably out of trouble:
//   • two small documents per person, never one per visit;
//   • one write pair when a session starts, then at most one pair per minute
//     while the tab is *visible*, plus one pair when it is hidden or closed;
//   • no timers while the tab is in the background (hidden tabs write nothing);
//   • reads happen only when the Members page is opened (two per member).
//
// Everything here is best-effort: a failed statistics write must never break a
// page. Failures are logged quietly and the UI simply shows less data.

import { db, serverTimestamp } from '../firebase.js';
import {
  doc, setDoc, updateDoc, getDoc, increment, arrayUnion
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  normalizeVisitDoc, normalizeTripVisit, VISIT_HEARTBEAT_MS, VISIT_MAX_FLUSH_MS
} from '../utils/visits.js';

const COLLECTION = 'visitStats';

let session = null;      // { tripId, uid, ref, tripRef, lastTick }
let timer = null;
let listening = false;

const isVisible = () => (typeof document === 'undefined' ? true : document.visibilityState !== 'hidden');

function clearTimer() {
  if (timer) { clearInterval(timer); timer = null; }
}

function detach() {
  if (!listening || typeof document === 'undefined') return;
  document.removeEventListener('visibilitychange', onVisibility);
  if (typeof window !== 'undefined') window.removeEventListener('pagehide', onPageHide);
  listening = false;
}

function onVisibility() {
  if (!session) return;
  if (document.visibilityState === 'hidden') {
    flushVisit();            // bank the time spent so far…
    session.lastTick = 0;    // …and stop the clock while the tab is in the background
  } else {
    session.lastTick = Date.now();
  }
}

function onPageHide() {
  flushVisit();
}

/**
 * Start (or move) the visit session. Safe to call on every navigation — it is a
 * no-op when the same person is already inside the same trip.
 */
export function trackVisit({ tripId, uid } = {}) {
  if (!db || !tripId || !uid) return false;
  if (session && session.tripId === tripId && session.uid === uid) return true;
  stopVisit();
  session = {
    tripId,
    uid,
    ref: doc(db, COLLECTION, uid),
    tripRef: doc(db, COLLECTION, uid, 'trips', tripId),
    lastTick: isVisible() ? Date.now() : 0
  };
  if (!listening && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
    if (typeof window !== 'undefined') window.addEventListener('pagehide', onPageHide);
    listening = true;
  }
  timer = setInterval(() => {
    if (!session) return;
    if (!isVisible()) { session.lastTick = 0; return; }
    if (!session.lastTick) session.lastTick = Date.now();
    flushVisit();
  }, VISIT_HEARTBEAT_MS);
  startSessionWrite(session);
  return true;
}

/** One write pair per session: counts the visit and stamps the last-seen time. */
async function startSessionWrite(s) {
  try {
    await Promise.all([
      setDoc(s.ref, {
        uid: s.uid,
        lastSeenAt: serverTimestamp(),
        sessions: increment(1),
        totalMs: increment(0),
        tripIds: arrayUnion(s.tripId)
      }, { merge: true }),
      setDoc(s.tripRef, {
        tripId: s.tripId,
        lastSeenAt: serverTimestamp(),
        sessions: increment(1),
        ms: increment(0)
      }, { merge: true })
    ]);
  } catch (e) {
    console.warn('[visits] start failed', e?.code || e?.message || e);
  }
}

/**
 * Add the time elapsed since the last tick to both documents.
 * `force` is used when leaving; normal ticks skip sub-second gaps.
 */
export function flushVisit({ force = false } = {}) {
  const s = session;
  if (!db || !s) return Promise.resolve(false);
  const now = Date.now();
  const elapsed = s.lastTick ? Math.max(0, now - s.lastTick) : 0;
  if (isVisible()) s.lastTick = now;
  if (!elapsed) return Promise.resolve(!!force);
  const ms = Math.min(elapsed, VISIT_MAX_FLUSH_MS);
  if (!force && ms < 1000) return Promise.resolve(false);
  const writes = [
    updateDoc(s.ref, { lastSeenAt: serverTimestamp(), totalMs: increment(ms) }),
    updateDoc(s.tripRef, { ms: increment(ms), lastSeenAt: serverTimestamp() })
  ];
  return Promise.all(writes)
    .then(() => true)
    .catch(async (e) => {
      // A document may be missing (an admin reset it); recreate quietly.
      try {
        await Promise.all([
          setDoc(s.ref, { uid: s.uid, totalMs: ms, sessions: 0, lastSeenAt: serverTimestamp() }, { merge: true }),
          setDoc(s.tripRef, { tripId: s.tripId, ms, sessions: 0, lastSeenAt: serverTimestamp() }, { merge: true })
        ]);
        return true;
      } catch {
        console.warn('[visits] flush failed', e?.code || e?.message || e);
        return false;
      }
    });
}

/** Bank the remaining time and stop tracking (sign-out, leaving every trip). */
export function stopVisit() {
  if (!session) return;
  flushVisit({ force: true });
  clearTimer();
  detach();
  session = null;
}

/** For tests / diagnostics: is a session open? */
export function visitSessionState() {
  return session ? { tripId: session.tripId, uid: session.uid } : null;
}

/**
 * Read both documents for every member (the Members page is the only caller).
 * @returns {Promise<Map<string, {stats: object|null, trip: object|null}>>}
 */
export async function loadVisitStats(uids = [], tripId = '') {
  const out = new Map();
  if (!db) return out;
  const ids = [...new Set((uids || []).filter(Boolean).map(String))];
  await Promise.all(ids.map(async (uid) => {
    const row = { stats: null, trip: null };
    try {
      const snap = await getDoc(doc(db, COLLECTION, uid));
      if (snap?.exists?.()) row.stats = normalizeVisitDoc(uid, snap.data());
    } catch (e) {
      console.warn('[visits] read failed', e?.code || e?.message || e);
    }
    if (tripId) {
      try {
        const snap = await getDoc(doc(db, COLLECTION, uid, 'trips', tripId));
        if (snap?.exists?.()) row.trip = normalizeTripVisit(tripId, snap.data());
      } catch (e) {
        console.warn('[visits] trip read failed', e?.code || e?.message || e);
      }
    }
    if (row.stats || row.trip) out.set(uid, row);
  }));
  return out;
}
