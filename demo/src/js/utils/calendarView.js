// ─────────────────────────────────────────────────────────────────────────────
// Calendar view — the month grid behind the “ปฏิทิน” tab on the itinerary page
// (Wanderlog shows the plan on a calendar as well as a timeline).
//
// Pure date maths only: build a month matrix, mark the trip window, the days
// that hold items and hand the UI everything it needs to draw.
// ─────────────────────────────────────────────────────────────────────────────

const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const WEEKDAYS_TH = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
export const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** '2026-04-05' + n days → '2026-04-06' (UTC-safe, no timezone drift). */
export function addDaysISO(isoDate = '', days = 0) {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function parseISODate(isoDate = '') {
  const [y, m, d] = String(isoDate).split('-').map(Number);
  if (!y || !m || !d) return null;
  return { year: y, month: m, day: d };
}

export function isoOf(year, month, day) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function monthLabel(year, month, lang = 'th') {
  const idx = Math.min(12, Math.max(1, Number(month))) - 1;
  return lang === 'th' ? `${TH_MONTHS[idx]} ${year}` : `${EN_MONTHS[idx]} ${year}`;
}

export function monthShort(month, lang = 'th') {
  const idx = Math.min(12, Math.max(1, Number(month))) - 1;
  return lang === 'th' ? TH_MONTHS_SHORT[idx] : EN_MONTHS[idx].slice(0, 3);
}

export function daysInMonth(year, month) {
  return new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
}

/** Weekday of the 1st of the month (0 = Sunday), used for the leading blanks. */
export function firstWeekday(year, month) {
  return new Date(Date.UTC(Number(year), Number(month) - 1, 1)).getUTCDay();
}

export function shiftMonth(year, month, delta) {
  const total = Number(year) * 12 + (Number(month) - 1) + Number(delta);
  const y = Math.floor(total / 12);
  const m = (total % 12 + 12) % 12 + 1;
  return { year: y, month: m };
}

/**
 * Build a 6 × 7 month matrix.
 *
 * @param {number} year
 * @param {number} month 1-12
 * @param {{trip?:{startDate?:string,endDate?:string}, items?:Array<{date?:string,title?:string,category?:string}>,
 *          today?:string, lang?:string, maxPills?:number}} [opts]
 * @returns {{year:number, month:number, label:string, weekdays:string[], weeks:Array<Array<object>>,
 *            tripDays:number, firstTripDay:string, plannedDays:number}}
 */
export function buildMonthGrid(year, month, { trip = null, items = [], today = '', lang = 'th', maxPills = 3 } = {}) {
  const start = String(trip?.startDate || '');
  const end = String(trip?.endDate || '');
  const todayISO = today || new Date().toISOString().slice(0, 10);

  const byDate = new Map();
  for (const item of items) {
    const key = String(item?.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(item);
  }

  const lead = firstWeekday(year, month);
  const total = daysInMonth(year, month);
  const gridStart = addDaysISO(isoOf(year, month, 1), -lead);

  const weeks = [];
  let tripDays = 0;
  let plannedDays = 0;
  for (let w = 0; w < 6; w++) {
    const week = [];
    for (let d = 0; d < 7; d++) {
      const iso = addDaysISO(gridStart, w * 7 + d);
      const parsed = parseISODate(iso) || { month: 0 };
      const inMonth = parsed.year === Number(year) && parsed.month === Number(month);
      const dayItems = byDate.get(iso) || [];
      const inTrip = !!(start && end && iso >= start && iso <= end);
      if (inTrip && inMonth) tripDays++;
      if (inTrip && dayItems.length) plannedDays++;
      week.push({
        iso,
        day: parsed.day,
        inMonth,
        inTrip,
        isToday: iso === todayISO,
        isFirstTripDay: iso === start,
        isLastTripDay: iso === end,
        count: dayItems.length,
        pills: dayItems.slice(0, maxPills).map(i => ({ title: i.title || '', category: i.category || 'general' })),
        extra: Math.max(0, dayItems.length - maxPills)
      });
    }
    weeks.push(week);
  }

  return {
    year: Number(year),
    month: Number(month),
    label: monthLabel(year, month, lang),
    weekdays: lang === 'th' ? WEEKDAYS_TH : WEEKDAYS_EN,
    weeks,
    tripDays,
    firstTripDay: start,
    plannedDays
  };
}

/** Which month should the calendar open on for a trip? */
export function defaultMonthFor(trip = null, today = '') {
  const start = parseISODate(String(trip?.startDate || ''));
  if (start) return { year: start.year, month: start.month };
  const t = parseISODate(today || new Date().toISOString().slice(0, 10));
  return t ? { year: t.year, month: t.month } : { year: new Date().getFullYear(), month: new Date().getMonth() + 1 };
}

/** Months that intersect the trip window (for the month switcher chips). */
export function tripMonths(trip = {}) {
  const s = parseISODate(String(trip?.startDate || ''));
  const e = parseISODate(String(trip?.endDate || ''));
  if (!s) return [];
  const out = [];
  let cur = { year: s.year, month: s.month };
  const stop = e ? { year: e.year, month: e.month } : cur;
  let guard = 0;
  while (guard++ < 24) {
    out.push({ ...cur });
    if (cur.year === stop.year && cur.month === stop.month) break;
    cur = shiftMonth(cur.year, cur.month, 1);
  }
  return out;
}

/** Items of one day, ordered by time (falls back to their stored order). */
export function itemsForDay(items = [], iso = '') {
  return items
    .filter(i => String(i?.date || '') === iso)
    .sort((a, b) => {
      const ta = String(a?.startAt || '').slice(11, 16) || '99:99';
      const tb = String(b?.startAt || '').slice(11, 16) || '99:99';
      if (ta !== tb) return ta < tb ? -1 : 1;
      return (Number(a?.order) || 0) - (Number(b?.order) || 0);
    });
}

/** “5 วัน • 12 จุดหมาย” summary under the calendar title. */
export function calendarSummary(trip = {}, items = []) {
  const start = parseISODate(String(trip?.startDate || ''));
  const end = parseISODate(String(trip?.endDate || ''));
  let days = 0;
  if (start && end) {
    const a = Date.UTC(start.year, start.month - 1, start.day);
    const b = Date.UTC(end.year, end.month - 1, end.day);
    days = Math.max(1, Math.round((b - a) / 86400000) + 1);
  }
  return { days, stops: items.length };
}
