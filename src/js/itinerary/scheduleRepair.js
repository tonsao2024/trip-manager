/**
 * Schedule repair — one continuous, ordered chain per day.
 *
 * The itinerary used to drift: each place kept the time that was typed for it,
 * so changing one stop left the rest of the day “jumping” (a 07:00 start
 * followed by a 10:00 museum, then a 09:20 lunch). This module rebuilds a day
 * as a chain instead:
 *
 *   start(first)  = the day's anchor (07:00 by default)
 *   end(item)     = start(item) + durationMinutes
 *   start(next)   = end(prev) + travelToNextMinutes
 *
 * The visit ORDER is never touched — only startAt / endAt are recalculated.
 * Two optional anchors keep special days honest:
 *
 *   - startOverrides: a day that begins with a flight starts when the flight
 *     actually leaves (not at 07:00).
 *   - endAnchors: a day that ends with a fixed arrival (the hotel check-in at
 *     21:00) pins that one stop, and everything after it keeps chaining.
 *
 * Pure functions only (no Firestore) so the logic is unit-tested in Node.
 */
import { dayjs } from '../utils/date.js';
import { haversineKm, hasCoords } from '../utils/route.js';

/** Every sightseeing day leaves the hotel at 07:00 unless it has its own anchor. */
export const DEFAULT_DAY_START = '07:00';

/**
 * Sensible visit length when a place has none yet (`durationMinutes` empty/0).
 * Only EVER fills an empty field — a duration the owner typed stays untouched.
 */
export const DEFAULT_VISIT_MINUTES = Object.freeze({
  sightseeing: 90,
  food: 60,
  transport: 30,
  stay: 60,
  activity: 90,
  shopping: 60,
  general: 60
});

const TITLE_HINTS = [
  [/เช็คอิน|เช็คเอาท์|check.?in|check.?out/i, 30],
  [/วัด|ศาลเจ้า|temple|shrine|pagoda/i, 60],
  [/มื้อ|อาหาร|breakfast|lunch|dinner|ราเมง|ramen|cafe|คาเฟ่|coffee/i, 60],
  [/ช้อป|shopping|ดองกี้|don quijote|donki/i, 90]
];

/** Visit minutes for a place without one: title hint first, then its category. */
export function defaultVisitMinutes(item = {}) {
  const text = `${item.title || ''} ${item.description || ''}`;
  for (const [re, minutes] of TITLE_HINTS) if (re.test(text)) return minutes;
  return DEFAULT_VISIT_MINUTES[item.category] || DEFAULT_VISIT_MINUTES.general;
}

/**
 * Rough door-to-door travel time between two stops, from their coordinates.
 * Walk for short hops, city transport for medium ones, longer rides beyond.
 * No coordinates → 10 min (a conservative same-day connection).
 */
export function estimateTravelMinutes(from, to) {
  if (!hasCoords(from) || !hasCoords(to)) return 10;
  const km = haversineKm(from.coordinates, to.coordinates);
  if (!(km > 0.05)) return 0;
  if (km <= 1.2) return Math.max(3, Math.round((km / 4.5) * 60) + 2);
  if (km <= 5) return Math.round((km / 15) * 60) + 8;
  return Math.min(180, Math.round((km / 30) * 60) + 10);
}

/**
 * Which existing fields need filling for a usable plan — visit length
 * (`durationMinutes`) and the leg to the next stop (`travelToNextMinutes`).
 * Fields that already hold a positive value are never changed.
 *
 * @returns {Map<string, { durationMinutes?: number, travelToNextMinutes?: number }>}
 */
export function planDurationFills(items = []) {
  const byDate = new Map();
  for (const item of items) {
    if (!item?.date) continue;
    if (!byDate.has(item.date)) byDate.set(item.date, []);
    byDate.get(item.date).push(item);
  }
  const fills = new Map();
  const put = (id, patch) => fills.set(id, { ...(fills.get(id) || {}), ...patch });
  for (const dayItems of byDate.values()) {
    const ordered = sortDayItems(dayItems);
    ordered.forEach((item, i) => {
      if (!(Number(item.durationMinutes) > 0)) {
        put(item.id, { durationMinutes: defaultVisitMinutes(item) });
      }
      if (i < ordered.length - 1 && !(Number(item.travelToNextMinutes) > 0)) {
        const minutes = estimateTravelMinutes(item, ordered[i + 1]);
        if (minutes > 0) put(item.id, { travelToNextMinutes: minutes });
      }
    });
  }
  return fills;
}

/** A “YYYY-MM-DD” date + “HH:mm” time read in a specific IANA timezone → Date. */
export function zonedDateTime(dateStr, time, timezone = 'Asia/Bangkok') {
  return dayjs.tz(`${dateStr} ${String(time || '00:00').slice(0, 5)}`, 'YYYY-MM-DD HH:mm', timezone).toDate();
}

/** The order the plan is shown in: `order`, then start time as a tie-breaker. */
export function sortDayItems(items = []) {
  return [...items].sort((a, b) =>
    (Number(a.order) || 0) - (Number(b.order) || 0) ||
    new Date(a.startAt || 0) - new Date(b.startAt || 0)
  );
}

/**
 * Chain one day's items from `anchorStartAt`.
 * Returns new item objects in the same order, with recalculated startAt/endAt.
 * When the anchor is missing the stored times are returned untouched.
 */
export function chainDaySchedule(items = [], anchorStartAt) {
  const ordered = sortDayItems(items);
  let cursor = anchorStartAt ? dayjs(anchorStartAt) : null;
  return ordered.map((item) => {
    if (!cursor) return { ...item };
    const startAt = cursor.toDate();
    const duration = Math.max(0, Number(item.durationMinutes) || 0);
    const end = cursor.add(duration, 'minute');
    cursor = end.add(Math.max(0, Number(item.travelToNextMinutes) || 0), 'minute');
    return { ...item, startAt, endAt: end.toDate() };
  });
}

/**
 * Pin one stop of an already-chained day to a fixed time (the 21:00 hotel
 * check-in). Everything after the pinned stop keeps chaining from it, so the
 * day never jumps back and forth.
 */
export function anchorDayEnd(dayItems = [], { at, match } = {}) {
  if (!at || !dayItems.length) return dayItems;
  const out = [...dayItems];
  const idx = typeof match === 'function' ? out.findIndex(match) : -1;
  const target = idx >= 0 ? idx : out.length - 1;
  const anchor = dayjs(at);
  const pin = (i) => {
    const start = i === target ? anchor : dayjs(out[i - 1]?.endAt || anchor).add(
      Math.max(0, Number(out[i - 1]?.travelToNextMinutes) || 0), 'minute');
    const end = start.add(Math.max(0, Number(out[i].durationMinutes) || 0), 'minute');
    out[i] = { ...out[i], startAt: start.toDate(), endAt: end.toDate() };
  };
  pin(target);
  for (let i = target + 1; i < out.length; i++) pin(i);
  return out;
}

/**
 * Build the new schedule for every day in the itinerary.
 *
 * @param {Array} items                 itinerary items ({ id, date, order, startAt, durationMinutes, travelToNextMinutes })
 * @param {object} opts
 * @param {string} opts.timezone        trip timezone (07:00 is read here)
 * @param {string} [opts.dayStart]      anchor for normal days (default 07:00)
 * @param {object} [opts.startOverrides] { 'YYYY-MM-DD': Date } — flight days
 * @param {object} [opts.endAnchors]     { 'YYYY-MM-DD': { at: Date, match?: (item) => boolean } }
 * @returns {Array<{ date: string, items: Array }>} days in calendar order
 */
export function planTripSchedule(items = [], {
  timezone = 'Asia/Tokyo',
  dayStart = DEFAULT_DAY_START,
  startOverrides = {},
  endAnchors = {}
} = {}) {
  const byDate = new Map();
  for (const item of items) {
    if (!item?.date) continue;
    if (!byDate.has(item.date)) byDate.set(item.date, []);
    byDate.get(item.date).push(item);
  }
  return [...byDate.keys()].sort().map((date) => {
    const dayItems = byDate.get(date);
    const anchor = startOverrides[date] || zonedDateTime(date, dayStart, timezone);
    let scheduled = chainDaySchedule(dayItems, anchor);
    if (endAnchors[date]) scheduled = anchorDayEnd(scheduled, endAnchors[date]);
    return { date, items: scheduled };
  });
}

/** Flatten `planTripSchedule` output into { id, date, startAt, endAt } updates. */
export function scheduleUpdates(days = []) {
  return days.flatMap((day) => day.items.map((item) => ({
    id: item.id,
    date: day.date,
    order: item.order,
    startAt: item.startAt,
    endAt: item.endAt
  })));
}

/** True when two schedules describe the same instants (idempotent re-runs). */
export function sameInstant(a, b) {
  const ta = a ? new Date(a).getTime() : null;
  const tb = b ? new Date(b).getTime() : null;
  return ta === tb;
}
