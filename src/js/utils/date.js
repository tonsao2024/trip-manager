import dayjs from 'https://esm.sh/dayjs@1.11.13';
import utc from 'https://esm.sh/dayjs@1.11.13/plugin/utc';
import timezone from 'https://esm.sh/dayjs@1.11.13/plugin/timezone';
import relativeTime from 'https://esm.sh/dayjs@1.11.13/plugin/relativeTime';
import customParse from 'https://esm.sh/dayjs@1.11.13/plugin/customParseFormat';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.extend(customParse);

export { dayjs };

/* ------------------------------------------------------------------ *
 * Thai dates (v35) — Buddhist-era years through Intl, e.g. “15 ม.ค. 2570”.
 * dayjs never had its Thai locale loaded, so Thai screens used to print
 * English month names (“Friday, 15 Jan 2027”). Intl ships with every browser,
 * needs no extra download and already uses the Buddhist calendar for th-TH.
 * ------------------------------------------------------------------ */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Any date-ish value → Date. Date-only strings stay on their calendar day. */
function toJsDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return isNaN(value) ? null : value;
  if (typeof value === 'object' && typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    try { const d = value.toDate(); return isNaN(d) ? null : d; } catch { return null; }
  }
  const m = String(value).match(DATE_ONLY);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value);
  return isNaN(d) ? null : d;
}

function intlFormat(d, opts, tz) {
  try { return new Intl.DateTimeFormat('th-TH', tz ? { ...opts, timeZone: tz } : opts).format(d); }
  catch { return new Intl.DateTimeFormat('th-TH', opts).format(d); }
}

/**
 * “15 ม.ค. 2570” · `{ year:false }` → “15 ม.ค.” · `{ weekday:true }` → “ศุกร์ 15 ม.ค. 2570”.
 * @param {*} value  Date, ISO string, “YYYY-MM-DD”, Firestore timestamp or dayjs
 * @param {{weekday?:boolean, year?:boolean, month?:'short'|'long', tz?:string}} [opts]
 */
export function thaiDate(value, { weekday = false, year = true, month = 'short', tz = '' } = {}) {
  const d = toJsDate(value);
  if (!d) return '';
  const dateOnly = typeof value === 'string' && DATE_ONLY.test(value);
  const opts = { day: 'numeric', month };
  if (year) opts.year = 'numeric';
  if (weekday) opts.weekday = 'long';
  let out = intlFormat(d, opts, dateOnly ? '' : tz);
  // “วันศุกร์ที่ 15 ม.ค. 2570” → “ศุกร์ 15 ม.ค. 2570”
  if (weekday) out = out.replace(/^วัน/, '').replace(/ที่\s/, ' ');
  return out;
}

/** Day / month / Buddhist year of a value, for building ranges. */
function thaiParts(value) {
  const d = toJsDate(value);
  if (!d) return null;
  const parts = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).formatToParts(d);
  const get = (type) => parts.find(p => p.type === type)?.value || '';
  return { day: get('day'), month: get('month'), year: get('year'), m: d.getMonth(), y: d.getFullYear() };
}

/**
 * Trip range in one short line: “15–20 ม.ค. 2570”, “28 ม.ค. – 3 ก.พ. 2570”,
 * “28 ธ.ค. 2569 – 3 ม.ค. 2570”. Missing end → just the start date.
 */
export function thaiDateRange(start, end) {
  const a = thaiParts(start);
  const b = thaiParts(end);
  if (!a && !b) return '';
  if (!a || !b) return thaiDate(a ? start : end);
  if (a.y === b.y && a.m === b.m) {
    return a.day === b.day ? `${a.day} ${a.month} ${a.year}` : `${a.day}–${b.day} ${a.month} ${a.year}`;
  }
  if (a.y === b.y) return `${a.day} ${a.month} – ${b.day} ${b.month} ${b.year}`;
  return `${a.day} ${a.month} ${a.year} – ${b.day} ${b.month} ${b.year}`;
}

export function formatDate(date, locale = 'th', tz = 'Asia/Bangkok') {
  if (!date) return '-';
  if (locale === 'th') return thaiDate(date, { weekday: true, tz }) || '-';
  return dayjs(date).tz(tz).format('dddd, D MMM YYYY');
}

export function formatTime(date, tz = 'Asia/Bangkok', is24h = true) {
  if (!date) return '-';
  const d = dayjs(date).tz(tz);
  return is24h ? d.format('HH:mm') : d.format('hh:mm A');
}

export function formatDateTime(date, tz = 'Asia/Bangkok', is24h = true) {
  if (!date) return '-';
  const d = dayjs(date).tz(tz);
  return `${thaiDate(date, { tz }) || d.format('DD MMM YYYY')} ${is24h ? d.format('HH:mm') : d.format('hh:mm A')}`;
}

export function getCurrentTimes() {
  const now = dayjs();
  return {
    bangkok: now.tz('Asia/Bangkok'),
    tokyo: now.tz('Asia/Tokyo'),
    local: now
  };
}

export function parseDurationInput(value, unit = 'minutes') {
  // unit: minutes, hours, hour_min
  if (unit === 'hours') return Math.round(Number(value) * 60);
  if (unit === 'hour_min') {
    const [h, m] = String(value).split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }
  return Math.round(Number(value) || 0);
}

export function formatDuration(minutes) {
  if (!minutes || minutes <= 0) return '0 นาที';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h && m) return `${h} ชม. ${m} นาที`;
  if (h) return `${h} ชม.`;
  return `${m} นาที`;
}

export function getTripDays(startDate, endDate) {
  const start = dayjs(startDate).startOf('day');
  const end = dayjs(endDate).startOf('day');
  const days = [];
  let cur = start;
  while (cur.isBefore(end) || cur.isSame(end, 'day')) {
    days.push(cur.toDate());
    cur = cur.add(1, 'day');
  }
  return days;
}

export function determineUpNextDay(tripDays, itineraryItems) {
  const today = dayjs().startOf('day');
  // Find today with items
  const todayStr = today.format('YYYY-MM-DD');
  const hasToday = tripDays.find(d => dayjs(d).format('YYYY-MM-DD') === todayStr);
  if (hasToday) return todayStr;

  // Find nearest future day with items
  const future = tripDays
    .map(d => dayjs(d))
    .filter(d => d.isAfter(today))
    .sort((a,b) => a.valueOf() - b.valueOf());
  if (future.length) return future[0].format('YYYY-MM-DD');

  // Fallback first or last
  if (tripDays.length) {
    if (today.isBefore(dayjs(tripDays[0]))) return dayjs(tripDays[0]).format('YYYY-MM-DD');
    return dayjs(tripDays[tripDays.length -1]).format('YYYY-MM-DD');
  }
  return null;
}

export function isOverlapping(startA, endA, startB, endB) {
  return dayjs(startA).isBefore(endB) && dayjs(startB).isBefore(endA);
}
