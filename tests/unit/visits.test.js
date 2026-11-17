// v42.3 — Visit statistics (Members page).
// Pure helpers only: the Firestore half (src/js/visits/index.js) is exercised by
// the browser checks. These tests pin the numbers the owner asked for —
// “วันเวลาที่เข้าล่าสุด”, “จำนวนครั้ง”, “เวลาสะสม” — and the two sort orders
// (ผู้เข้าชมบ่อยสุด / ผู้ใช้เวลาชมมากที่สุด).
import {
  normalizeVisitDoc, normalizeTripVisit, visitRow, sortVisitRows, formatVisitDuration,
  visitStamp, visitRelative, isVisitingNow, summarizeVisits, toMs, VISIT_ONLINE_MS
} from '../../src/js/utils/visits.js';

function ok(value, label) { if (!value) throw new Error(label); }
function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const at = (iso) => Date.parse(iso);
const stamp = (ms) => ({ seconds: Math.floor(ms / 1000), nanoseconds: 0 });

export function testToMsReadsEveryTimestampShape() {
  const ms = at('2026-11-17T12:00:00Z');
  eq(toMs(ms), ms, 'number passes through');
  eq(toMs(new Date(ms)), ms, 'Date');
  eq(toMs({ seconds: Math.floor(ms / 1000), nanoseconds: 0 }), ms, 'Firestore Timestamp shape');
  eq(toMs(stamp(ms)), ms, 'stub Timestamp shape');
  eq(toMs({ toDate: () => new Date(ms) }), ms, 'toDate()');
  eq(toMs(new Date(ms).toISOString()), ms, 'ISO string');
  eq(toMs(null), null, 'null stays null');
}

export function testNormalizeVisitDocTurnsTimestampsIntoNumbers() {
  const t = at('2026-11-17T10:00:00Z');
  const doc = normalizeVisitDoc('u1', {
    uid: 'u1', totalMs: 3600000, sessions: 4, lastSeenAt: stamp(t), tripIds: ['t1']
  });
  eq(doc.totalMs, 3600000, 'total ms');
  eq(doc.sessions, 4, 'sessions');
  eq(doc.lastSeenAt, t, 'last seen is ms');
  eq(doc.tripIds.join(','), 't1', 'trip ids');
  eq(normalizeVisitDoc('u2', null).totalMs, 0, 'a missing document is all zeros');
  eq(normalizeVisitDoc('u3', { totalMs: 'x', sessions: -2 }).sessions, 0, 'garbage counts as zero');

  const trip = normalizeTripVisit('t1', { tripId: 't1', ms: 1200000, sessions: 3, lastSeenAt: stamp(t) });
  eq(trip.ms, 1200000, 'per-trip ms');
  eq(trip.sessions, 3, 'per-trip sessions');
  eq(trip.lastSeenAt, t, 'per-trip last seen');
  eq(normalizeTripVisit('t1', undefined).ms, 0, 'missing per-trip document is zero');
}

export function testVisitRowJoinsMemberAndTripNumbers() {
  const t = at('2026-11-17T10:00:00Z');
  const member = { id: 'u1', uid: 'u1', displayName: 'สมชาย', photoURL: '', color: '#8bb89a' };
  const stats = normalizeVisitDoc('u1', { totalMs: 9 * 3600000, sessions: 12, lastSeenAt: stamp(t) });
  const trip = normalizeTripVisit('t1', { ms: 40 * 60000, sessions: 5, lastSeenAt: stamp(t) });
  const row = visitRow(member, stats, trip);
  eq(row.name, 'สมชาย', 'name comes from the member');
  eq(row.tripMs, 40 * 60000, 'this trip’s time');
  eq(row.tripSessions, 5, 'this trip’s visits');
  eq(row.appMs, 9 * 3600000, 'whole-app time');
  eq(row.tracked, true, 'tracked');
  const empty = visitRow(member, null, null);
  eq(empty.tracked, false, 'no document → untracked');
  eq(empty.tripMs, 0, 'no document → zero time');
  eq(empty.tripLastSeen, null, 'no document → no last visit');
}

export function testSortByRecentFrequentAndDuration() {
  const base = { photoURL: '', color: '' };
  const rows = [
    visitRow({ id: 'a', displayName: 'A', ...base }, null, normalizeTripVisit('t1', { ms: 600000, sessions: 2, lastSeenAt: stamp(1000) })),
    visitRow({ id: 'b', displayName: 'B', ...base }, null, normalizeTripVisit('t1', { ms: 90000, sessions: 9, lastSeenAt: stamp(9000) })),
    visitRow({ id: 'c', displayName: 'C', ...base }, null, normalizeTripVisit('t1', { ms: 3600000, sessions: 4, lastSeenAt: stamp(5000) })),
    visitRow({ id: 'd', displayName: 'D', ...base }, null, null)
  ];
  eq(sortVisitRows(rows, 'recent').map(r => r.id).join(''), 'bcad', 'recent: newest first, never-visited last');
  eq(sortVisitRows(rows, 'frequent').map(r => r.id).join(''), 'bcad', 'frequent: 9 → 4 → 2 → 0');
  eq(sortVisitRows(rows, 'duration').map(r => r.id).join(''), 'cabd', 'duration: longest first');
  eq(rows.map(r => r.id).join(''), 'abcd', 'sorting does not mutate the source list');
}

export function testFormatVisitDuration() {
  eq(formatVisitDuration(0, 'th'), '0 น.', 'zero');
  eq(formatVisitDuration(20000, 'th'), 'น้อยกว่า 1 น.', 'under a minute');
  eq(formatVisitDuration(22 * 60000, 'th'), '22 น.', 'minutes only');
  eq(formatVisitDuration(3 * 3600000, 'th'), '3 ชม.', 'whole hours');
  eq(formatVisitDuration(3 * 3600000 + 40 * 60000, 'th'), '3 ชม. 40 น.', 'hours and minutes');
  eq(formatVisitDuration(3 * 3600000 + 40 * 60000, 'en'), '3h 40m', 'english');
}

export function testVisitStampAndRelative() {
  const now = at('2026-11-17T12:00:00Z');            // 19:00 in Bangkok
  eq(visitStamp(at('2026-11-17T12:00:00Z'), now, 'th'), 'วันนี้ 19:00', 'today');
  eq(visitStamp(at('2026-11-16T12:00:00Z'), now, 'th').startsWith('เมื่อวาน'), true, 'yesterday');
  eq(visitStamp(null, now, 'th'), 'ยังไม่เคยเข้า', 'never visited');
  eq(visitRelative(at('2026-11-17T11:55:00Z'), now, 'th'), '5 นาทีที่แล้ว', 'five minutes ago');
  eq(visitRelative(at('2026-11-17T09:00:00Z'), now, 'th'), '3 ชม. ที่แล้ว', 'three hours ago');
  eq(visitRelative(at('2026-11-14T09:00:00Z'), now, 'th'), '', 'older than a day stays quiet');
  eq(isVisitingNow(at('2026-11-17T11:58:00Z'), now), true, 'two minutes ago is “online”');
  eq(isVisitingNow(at('2026-11-17T11:00:00Z'), now), false, 'an hour ago is not');
  eq(isVisitingNow(null, now), false, 'never is not online');
  ok(VISIT_ONLINE_MS === 5 * 60 * 1000, 'online window is five minutes');
}

export function testSummarizeVisits() {
  const now = at('2026-11-17T12:00:00Z');
  const rows = [
    visitRow({ id: 'a', displayName: 'A' }, normalizeVisitDoc('a', { totalMs: 600000, sessions: 2 }), normalizeTripVisit('t1', { ms: 600000, sessions: 2, lastSeenAt: stamp(at('2026-11-17T11:59:00Z')) })),
    visitRow({ id: 'b', displayName: 'B' }, normalizeVisitDoc('b', { totalMs: 90000, sessions: 3 }), normalizeTripVisit('t1', { ms: 90000, sessions: 3, lastSeenAt: stamp(at('2026-11-15T09:00:00Z')) })),
    visitRow({ id: 'c', displayName: 'C' }, null, null)
  ];
  const sum = summarizeVisits(rows, now);
  eq(sum.total, 3, 'every member counted');
  eq(sum.tracked, 2, 'two have a document');
  eq(sum.online, 1, 'one is online');
  eq(sum.sessions, 5, 'visits sum');
  eq(sum.tripMs, 690000, 'time sums');
  eq(sum.latest, at('2026-11-17T11:59:00Z'), 'latest visit');
}
