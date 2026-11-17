/**
 * Jan 2026 Japan trip — data repair (runs in the browser, writes Firestore).
 *
 * Two kinds of fixes live here:
 *
 *  1. Canonical facts that should never drift:
 *       • 15 Jan  BKK → SGN   20:50–22:40 (Asia/Bangkok)
 *       • 16 Jan  SGN → Tokyo 00:25–07:45 (00:25 Asia/Ho_Chi_Minh → 07:45 Asia/Tokyo)
 *       • 22 Jan  check-in The OneFive Tokyo Kameido at 21:00 (Asia/Tokyo)
 *     Existing documents are updated in place (no duplicates); a missing one is
 *     created once.
 *
 *  2. The day schedule: every sightseeing day leaves the hotel at 07:00 and the
 *     stops then follow one continuous chain (duration + travel time), keeping
 *     the visit order exactly as it is. Flight days start at the flight time;
 *     22 Jan finishes at the 21:00 hotel check-in.
 *
 * The routine is idempotent: running it twice changes nothing the second time.
 *
 * Entry points:
 *   • Settings → Advanced → “จัดเวลาแผนเดินทาง” (admin)
 *   • the console snippet in tools/console-migrate-jan.js
 */
import { db, auth, serverTimestamp } from '../firebase.js';
import { collection, doc, addDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { fetchItinerary } from './index.js';
import {
  planTripSchedule, planDurationFills, zonedDateTime, sameInstant, DEFAULT_DAY_START
} from './scheduleRepair.js';

export const JAN_TRIP_DATES = ['2026-01-15', '2026-01-16', '2026-01-22'];

const FLIGHTS = [
  {
    key: 'bkk-sgn',
    date: '2026-01-15',
    start: { date: '2026-01-15', time: '20:50', tz: 'Asia/Bangkok' },
    end: { date: '2026-01-15', time: '22:40', tz: 'Asia/Bangkok' },
    title: '✈️ BKK → SGN (ต่อเครื่อง)',
    description: 'BKK → SGN',
    from: 'BKK',
    to: 'SGN',
    matches: (it) => /BKK/i.test(`${it.title} ${it.address} ${it.description}`) &&
      /SGN/i.test(`${it.title} ${it.address} ${it.description}`)
  },
  {
    key: 'sgn-tyo',
    date: '2026-01-16',
    start: { date: '2026-01-16', time: '00:25', tz: 'Asia/Ho_Chi_Minh' },
    end: { date: '2026-01-16', time: '07:45', tz: 'Asia/Tokyo' },
    title: '✈️ SGN → Tokyo (NRT/HND)',
    description: 'SGN → Tokyo',
    from: 'SGN',
    to: 'Tokyo',
    matches: (it) => /SGN/i.test(`${it.title} ${it.address} ${it.description}`) &&
      /(Tokyo|NRT|HND|โตเกียว)/i.test(`${it.title} ${it.address} ${it.description}`)
  }
];

const HOTEL = {
  date: '2026-01-22',
  time: '21:00',
  timezone: 'Asia/Tokyo',
  title: '🏨 Check-in The OneFive Tokyo Kameido',
  address: 'The OneFive Tokyo Kameido, Kameido, Tokyo',
  coordinates: '35.6975,139.8306',
  nameMatches: (it) => /onefive|kameido/i.test(`${it.title} ${it.address} ${it.description}`),
  matches: (it) => /onefive|kameido/i.test(`${it.title} ${it.address} ${it.description}`) ||
    (it.category === 'stay' && it.stayCheckIn === '2026-01-22')
};

const orderOf = (item) => Number(item.order) || 0;

/** Shallow compare, treating Dates by instant. */
function sameValue(a, b) {
  if (a instanceof Date || b instanceof Date) return sameInstant(a, b);
  return a === b;
}

/** Only the keys whose value actually differs — keeps re-runs write-free. */
function changedKeys(before, next) {
  const out = {};
  for (const [key, value] of Object.entries(next)) {
    if (!sameValue(before?.[key], value)) out[key] = value;
  }
  return out;
}

function pickFlight(items, spec) {
  const candidates = items.filter((it) => it.date === spec.date);
  // Fallback to the whole trip: an older import may have filed the connection
  // on the departure date instead of the arrival date.
  return candidates.find((it) => it.title === spec.title) ||
    candidates.find(spec.matches) ||
    items.find(spec.matches) || null;
}

function flightPayload(spec) {
  const startAt = zonedDateTime(spec.start.date, spec.start.time, spec.start.tz);
  const endAt = zonedDateTime(spec.end.date, spec.end.time, spec.end.tz);
  return {
    startAt,
    endAt,
    durationMinutes: Math.max(1, Math.round((endAt - startAt) / 60000)),
    title: spec.title,
    description: spec.description,
    address: `${spec.from} → ${spec.to}`,
    date: spec.date,
    category: 'transport',
    startTz: spec.start.tz,
    endTz: spec.end.tz,
    from: spec.from,
    to: spec.to
  };
}

async function ensureFlight(tripId, items, spec, uid, report) {
  const payload = flightPayload(spec);
  const existing = pickFlight(items, spec);
  if (existing) {
    const patch = changedKeys(existing, payload);
    // The flight is always the first card of its day (new flight, not a place).
    const dayOrders = items.filter((it) => it.date === spec.date && it.id !== existing.id).map(orderOf);
    if (dayOrders.length && orderOf(existing) >= Math.min(...dayOrders)) patch.order = Math.min(...dayOrders) - 1;
    Object.assign(existing, payload, patch.order != null ? { order: patch.order } : {});
    report.flights.push({ id: existing.id, created: false, patch });
    return existing;
  }
  const dayOrders = items.filter((it) => it.date === spec.date).map(orderOf);
  const order = dayOrders.length ? Math.min(...dayOrders) - 1 : 0;
  const doc = {
    ...payload,
    travelToNextMinutes: 0,
    order,
    coordinates: '',
    notes: '',
    status: 'planned',
    updatedBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    version: 1
  };
  const ref = await addDoc(collection(db, `trips/${tripId}/itineraryItems`), { ...doc, createdBy: uid });
  const created = { id: ref.id, ...doc };
  items.push(created);
  report.flights.push({ id: ref.id, created: true, patch: {} });
  report.created++;
  return created;
}

async function ensureHotel(tripId, items, uid, report) {
  const startAt = zonedDateTime(HOTEL.date, HOTEL.time, HOTEL.timezone);
  // Name first: a different hotel that also checks in on 22 Jan must not be
  // mistaken for The OneFive.
  const existing = items.find(HOTEL.nameMatches) || items.find(HOTEL.matches);
  if (existing) {
    // Keep the stay's own dates, duration and notes — only the arrival time is
    // being repaired. (The hotel may legitimately span several nights.)
    const duration = Math.max(1, Number(existing.durationMinutes) || 60);
    const endAt = new Date(+startAt + duration * 60000);
    const patch = changedKeys(existing, { startAt, endAt });
    const dayOthers = items.filter((it) => it.date === HOTEL.date && it.id !== existing.id).map(orderOf);
    if (dayOthers.length && orderOf(existing) < Math.max(...dayOthers)) patch.order = Math.max(...dayOthers) + 1;
    Object.assign(existing, { startAt, endAt }, patch.order != null ? { order: patch.order } : {});
    report.hotel = { id: existing.id, created: false, patch };
    return existing;
  }
  const payload = {
    startAt,
    endAt: new Date(+startAt + 60 * 60000),
    durationMinutes: 60,
    stayCheckIn: HOTEL.date,
    stayCheckOut: '2026-01-23',
    notes: 'เช็คอิน 21:00'
  };
  const dayOrders = items.filter((it) => it.date === HOTEL.date).map(orderOf);
  const doc = {
    title: HOTEL.title,
    description: 'The OneFive Tokyo Kameido',
    date: HOTEL.date,
    ...payload,
    travelToNextMinutes: 0,
    order: dayOrders.length ? Math.max(...dayOrders) + 1 : 0,
    category: 'stay',
    address: HOTEL.address,
    coordinates: HOTEL.coordinates,
    status: 'planned',
    createdBy: uid,
    updatedBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    version: 1
  };
  const ref = await addDoc(collection(db, `trips/${tripId}/itineraryItems`), doc);
  const created = { id: ref.id, ...doc };
  items.push(created);
  report.hotel = { id: ref.id, created: true, patch: {} };
  report.created++;
  return created;
}

/**
 * Repair the whole plan of the Jan 2026 Japan trip.
 * @param {string} tripId
 * @param {{ userId?: string, timezone?: string }} [opts]
 */
export async function repairJanItinerary(tripId, { userId, timezone = 'Asia/Tokyo' } = {}) {
  const uid = userId || auth?.currentUser?.uid || 'migration';
  const items = await fetchItinerary(tripId, null, { fresh: true });
  if (!items.length) throw new Error('ทริปนี้ยังไม่มีแผนการเดินทาง');
  // Safety rail: this repair owns the 15–22 Jan 2026 Japan plan. Never insert
  // those flights / that hotel into an unrelated trip.
  if (!isJanTrip(items)) {
    throw new Error('ทริปนี้ไม่ใช่แผนญี่ปุ่น 15–22 ม.ค. 2026 (ไม่พบรายการในช่วงนั้น)');
  }

  const report = { created: 0, days: 0, updated: 0, filledDurations: 0, filledTravel: 0, flights: [], hotel: null };
  const flightItems = {};
  for (const spec of FLIGHTS) {
    const item = await ensureFlight(tripId, items, spec, uid, report);
    flightItems[spec.date] = item.startAt;
  }
  const hotelItem = await ensureHotel(tripId, items, uid, report);

  // Fill the two fields the plan already has — visit length and the leg to the
  // next stop — but only where they are empty. Typed values are never replaced.
  const byId = new Map(items.map((it) => [it.id, it]));
  const fills = planDurationFills(items);
  for (const [id, patch] of fills) {
    const target = byId.get(id);
    if (target) Object.assign(target, patch);
  }
  report.filledDurations = [...fills.values()].filter((p) => p.durationMinutes != null).length;
  report.filledTravel = [...fills.values()].filter((p) => p.travelToNextMinutes != null).length;

  const startOverrides = {
    '2026-01-15': flightItems['2026-01-15'],
    '2026-01-16': flightItems['2026-01-16']
  };
  // Only pin the check-in when it really sits on 22 Jan; a stay that started on
  // an earlier date must not drag that day's last stop to 21:00.
  const endAnchors = hotelItem.date === HOTEL.date ? {
    [HOTEL.date]: {
      at: hotelItem.startAt,
      match: (it) => it.id === hotelItem.id
    }
  } : {};

  const days = planTripSchedule(items, {
    timezone,
    dayStart: DEFAULT_DAY_START,
    startOverrides,
    endAnchors
  });

  // Patches collected above are applied in the same batch as the new times.
  const patches = new Map();
  for (const flight of report.flights) patches.set(flight.id, flight.patch);
  if (report.hotel) {
    const current = patches.get(report.hotel.id) || {};
    patches.set(report.hotel.id, { ...current, ...report.hotel.patch });
  }
  for (const [id, patch] of fills) {
    patches.set(id, { ...(patches.get(id) || {}), ...patch });
  }

  let batch = writeBatch(db);
  let pending = 0;
  for (const day of days) {
    report.days++;
    for (const item of day.items) {
      const original = byId.get(item.id);
      const patch = patches.get(item.id) || {};
      const data = {
        ...patch,
        ...(sameInstant(original?.startAt, item.startAt) ? {} : { startAt: item.startAt }),
        ...(sameInstant(original?.endAt, item.endAt) ? {} : { endAt: item.endAt })
      };
      if (!Object.keys(data).length) continue;
      batch.update(doc(db, `trips/${tripId}/itineraryItems`, item.id), {
        ...data,
        updatedBy: uid,
        updatedAt: serverTimestamp(),
        version: (Number(original?.version) || 0) + 1
      });
      report.updated++;
      pending++;
      if (pending >= 400) { await batch.commit(); batch = writeBatch(db); pending = 0; }
    }
  }
  if (pending) await batch.commit();

  // Refresh the cached list the itinerary page reads from.
  await fetchItinerary(tripId, null, { fresh: true });
  return report;
}

/** True when the trip has at least one stop inside the 15–22 Jan 2026 window. */
export function isJanTrip(items = []) {
  return items.some((it) => it.date >= JAN_TRIP_DATES[0] && it.date <= JAN_TRIP_DATES[JAN_TRIP_DATES.length - 1]);
}
