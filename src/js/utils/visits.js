// Visit statistics — pure helpers (no Firestore, no DOM) so the numbers can be
// unit-tested. The Firestore half lives in src/js/visits/index.js.
//
// What the documents mean (see src/js/visits/index.js):
//   visitStats/{uid}              { uid, lastSeenAt, sessions, totalMs, tripIds[] }
//   visitStats/{uid}/trips/{id}   { tripId, sessions, ms, lastSeenAt }
// One small document per account (plus one tiny row per trip they entered) —
// NOT one per visit — so the free Spark plan only sees a write when someone
// opens the app or closes a session.

/** How often the open tab adds its elapsed time to the document. */
export const VISIT_HEARTBEAT_MS = 60 * 1000;
/** “กำลังใช้งานอยู่” threshold in the Members page. */
export const VISIT_ONLINE_MS = 5 * 60 * 1000;
/** A single flush never claims more than this — a sleeping laptop must not
 *  bank an hour of “viewing time” after one late wake-up. */
export const VISIT_MAX_FLUSH_MS = 10 * 60 * 1000;

const TZ = 'Asia/Bangkok';

/** Firestore Timestamp | {seconds} | Date | ISO string | ms → milliseconds. */
export function toMs(value) {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof value?.toDate === 'function') {
    try { const t = value.toDate().getTime(); return Number.isFinite(t) ? t : null; } catch { return null; }
  }
  if (typeof value?.seconds === 'number') {
    return value.seconds * 1000 + Math.floor((Number(value.nanoseconds) || 0) / 1e6);
  }
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : null;
  }
  return null;
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Normalise one `visitStats/{uid}` document (the whole-app totals). */
export function normalizeVisitDoc(uid, data) {
  const source = data && typeof data === 'object' ? data : {};
  return {
    uid: String(uid || source.uid || ''),
    totalMs: num(source.totalMs),
    sessions: num(source.sessions),
    lastSeenAt: toMs(source.lastSeenAt),
    tripIds: Array.isArray(source.tripIds) ? source.tripIds.filter(Boolean).map(String) : []
  };
}

/** Normalise one `visitStats/{uid}/trips/{tripId}` document (this trip only). */
export function normalizeTripVisit(tripId, data) {
  const source = data && typeof data === 'object' ? data : {};
  return {
    tripId: String(tripId || source.tripId || ''),
    ms: num(source.ms),
    sessions: num(source.sessions),
    lastSeenAt: toMs(source.lastSeenAt)
  };
}

/**
 * Join one trip member with their two visit documents.
 * Either document may be null (nobody has opened the app since tracking began).
 */
export function visitRow(member = {}, stats = null, trip = null) {
  return {
    id: member.id || member.uid || stats?.uid || '',
    uid: stats?.uid || member.uid || member.id || '',
    name: member.displayName || member.name || '',
    photoURL: member.photoURL || '',
    color: member.color || '',
    // this trip
    tripMs: num(trip?.ms),
    tripSessions: num(trip?.sessions),
    tripLastSeen: trip?.lastSeenAt ?? null,
    // the whole web app (every trip)
    appMs: num(stats?.totalMs),
    appSessions: num(stats?.sessions),
    appLastSeen: toMs(stats?.lastSeenAt),
    tracked: !!(stats || trip)
  };
}

/** Keys the Members page can sort by — most recent, most often, longest. */
export const VISIT_SORTS = ['recent', 'frequent', 'duration'];

export function sortVisitRows(rows = [], key = 'recent') {
  const list = [...rows];
  const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'th');
  if (key === 'frequent') {
    return list.sort((a, b) => (b.tripSessions - a.tripSessions) || (b.tripMs - a.tripMs) || byName(a, b));
  }
  if (key === 'duration') {
    return list.sort((a, b) => (b.tripMs - a.tripMs) || (b.tripSessions - a.tripSessions) || byName(a, b));
  }
  return list.sort((a, b) => {
    const ta = a.tripLastSeen ?? a.appLastSeen ?? -1;
    const tb = b.tripLastSeen ?? b.appLastSeen ?? -1;
    return (tb - ta) || (b.tripSessions - a.tripSessions) || byName(a, b);
  });
}

/** “3 ชม. 40 น.” — a compact human duration. */
export function formatVisitDuration(ms, lang = 'th') {
  const total = num(ms);
  const minutes = Math.round(total / 60000);
  if (total > 0 && minutes === 0) return lang === 'th' ? 'น้อยกว่า 1 น.' : '<1 min';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (lang === 'th') {
    if (!hours) return `${rest} น.`;
    return rest ? `${hours} ชม. ${rest} น.` : `${hours} ชม.`;
  }
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function bangkokDayKey(ms) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  } catch {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}

function clock(ms, lang) {
  try {
    return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', {
      timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false
    }).format(new Date(ms));
  } catch {
    const d = new Date(ms);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
}

function shortDate(ms, lang, withYear = false) {
  try {
    return new Intl.DateTimeFormat(lang === 'th' ? 'th-TH' : 'en-GB', {
      timeZone: TZ, day: 'numeric', month: 'short', ...(withYear ? { year: '2-digit' } : {})
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

/**
 * The absolute stamp shown in the “เข้าล่าสุด” column:
 * “วันนี้ 19:20”, “เมื่อวาน 08:05”, “12 พ.ย. 21:40”.
 */
export function visitStamp(ms, now = Date.now(), lang = 'th') {
  if (!ms) return lang === 'th' ? 'ยังไม่เคยเข้า' : 'never';
  const day = bangkokDayKey(ms);
  const today = bangkokDayKey(now);
  const yesterday = bangkokDayKey(now - 86400000);
  if (day === today) return `${lang === 'th' ? 'วันนี้' : 'Today'} ${clock(ms, lang)}`;
  if (day === yesterday) return `${lang === 'th' ? 'เมื่อวาน' : 'Yesterday'} ${clock(ms, lang)}`;
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return `${shortDate(ms, lang, !sameYear)} ${clock(ms, lang)}`;
}

/** “5 นาทีที่แล้ว” — only while it still adds information (under a day). */
export function visitRelative(ms, now = Date.now(), lang = 'th') {
  if (!ms) return '';
  const diff = now - ms;
  if (diff < 0) return '';
  const min = Math.floor(diff / 60000);
  if (min < 1) return lang === 'th' ? 'เมื่อสักครู่' : 'just now';
  if (min < 60) return lang === 'th' ? `${min} นาทีที่แล้ว` : `${min} min ago`;
  if (diff < 86400000) {
    const h = Math.floor(min / 60);
    return lang === 'th' ? `${h} ชม. ที่แล้ว` : `${h}h ago`;
  }
  return '';
}

/** True while the member looks like they are in the app right now. */
export function isVisitingNow(lastSeenMs, now = Date.now()) {
  if (!lastSeenMs) return false;
  const diff = now - lastSeenMs;
  return diff >= 0 && diff <= VISIT_ONLINE_MS;
}

/** Headline numbers for the stats card. */
export function summarizeVisits(rows = [], now = Date.now()) {
  let online = 0, tracked = 0, sessions = 0, tripMs = 0, appMs = 0, latest = null;
  for (const row of rows) {
    if (row.tracked) tracked += 1;
    if (isVisitingNow(row.tripLastSeen ?? null, now)) online += 1;
    sessions += num(row.tripSessions);
    tripMs += num(row.tripMs);
    appMs += num(row.appMs);
    const seen = row.tripLastSeen ?? row.appLastSeen ?? null;
    if (seen && (!latest || seen > latest)) latest = seen;
  }
  return { total: rows.length, tracked, online, sessions, tripMs, appMs, latest };
}
