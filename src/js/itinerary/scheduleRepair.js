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

/** Every sightseeing day leaves the hotel at 07:00 unless it has its own anchor. */
export const DEFAULT_DAY_START = '07:00';

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
