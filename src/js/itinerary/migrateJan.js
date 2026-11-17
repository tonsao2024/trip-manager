/**
 * Jan 2026 Japan trip migration helpers
 *
 *  - Flight BKK→SGN 20:50-22:40 on 2026-01-15, SGN→Tokyo 00:25-07:45 on 2026-01-16
 *  - Hotel check-in The OneFive Tokyo Kameido 21:00 on 2026-01-22
 *  - Shift every sightseeing day hotel departure to 07:00, cascade times, keep order
 *
 * These are browser-side helpers (Firestore client SDK). Call from itinerary page
 * or from the console snippet in tools/console-migrate-jan.js.
 */
import { db, auth, serverTimestamp } from '../firebase.js';
import { collection, doc, addDoc, writeBatch } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { dayjs } from '../utils/date.js';
import { fetchItinerary } from './index.js';
import { recalculateSchedule } from '../utils/scheduling.js';

const SKIP_SHIFT_DATES = new Set(['2026-01-15', '2026-01-16', '2026-01-22']);

export async function createJanFlights(tripId, userId) {
  const flights = [
    {
      title: '✈️ BKK → SGN (ต่อเครื่อง)',
      date: '2026-01-15',
      startTz: 'Asia/Bangkok',
      startTime: '20:50',
      endTz: 'Asia/Bangkok',
      endTime: '22:40',
      from: 'BKK', to: 'SGN'
    },
    {
      title: '✈️ SGN → Tokyo (NRT/HND)',
      date: '2026-01-16',
      startTz: 'Asia/Ho_Chi_Minh',
      startTime: '00:25',
      endTz: 'Asia/Tokyo',
      endTime: '07:45',
      from: 'SGN', to: 'Tokyo'
    }
  ];
  const existing = await fetchItinerary(tripId, null);
  const ids = [];
  for (const f of flights) {
    if (existing.find(i => i.title === f.title && i.date === f.date)) continue;
    const startAt = dayjs.tz(`${f.date} ${f.startTime}`, 'YYYY-MM-DD HH:mm', f.startTz).toDate();
    const endAt = f.date === '2026-01-16'
      ? dayjs.tz('2026-01-16 07:45', 'YYYY-MM-DD HH:mm', 'Asia/Tokyo').toDate()
      : dayjs.tz(`${f.date} ${f.endTime}`, 'YYYY-MM-DD HH:mm', f.endTz).toDate();
    const durationMinutes = Math.max(1, Math.round((endAt - startAt) / 60000));
    const ref = await addDoc(collection(db, `trips/${tripId}/itineraryItems`), {
      title: f.title,
      description: `${f.from} → ${f.to}`,
      date: f.date,
      startAt,
      endAt,
      durationMinutes,
      travelToNextMinutes: 0,
      order: 999,
      category: 'transport',
      address: `${f.from} → ${f.to}`,
      coordinates: '',
      notes: '',
      status: 'planned',
      createdBy: userId, updatedBy: userId, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), version: 1
    });
    ids.push(ref.id);
  }
  return ids;
}

export async function createJanHotelCheckin(tripId, userId) {
  const title = '\uD83C\uDFE8 Check-in The OneFive Tokyo Kameido';
  const date = '2026-01-22';
  const existing = await fetchItinerary(tripId, null);
  if (existing.find(i => i.title === title && i.date === date)) return null;
  const startAt = dayjs.tz('2026-01-22 21:00', 'YYYY-MM-DD HH:mm', 'Asia/Tokyo').toDate();
  const ref = await addDoc(collection(db, `trips/${tripId}/itineraryItems`), {
    title,
    description: 'The OneFive Tokyo Kameido',
    date,
    startAt,
    endAt: dayjs(startAt).add(60, 'minute').toDate(),
    durationMinutes: 60,
    travelToNextMinutes: 0,
    order: 999,
    category: 'stay',
    address: 'The OneFive Tokyo Kameido, Kameido, Tokyo',
    coordinates: '35.6975,139.8306',
    notes: 'เช็คอิน 21:00',
    status: 'planned',
    stayCheckIn: '2026-01-22',
    stayCheckOut: '2026-01-23',
    createdBy: userId, updatedBy: userId, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), version: 1
  });
  return ref.id;
}

/**
 * Shift every sightseeing day's first item to 07:00 (trip timezone) and cascade
 * following items via recalculateSchedule — order is preserved.
 */
export async function shiftAllDaysTo0700(tripId, userId, tripTz = 'Asia/Tokyo') {
  const all = await fetchItinerary(tripId, null);
  const byDate = {};
  for (const it of all) {
    if (!it.date) continue;
    (byDate[it.date] ||= []).push(it);
  }
  for (const date of Object.keys(byDate).sort()) {
    if (SKIP_SHIFT_DATES.has(date)) continue;
    const dayItems = byDate[date].sort((a,b) => (a.order||0)-(b.order||0));
    if (!dayItems.length) continue;
    let target = dayItems[0];
    // Skip flight days — shift to next non-flight
    if (String(target.title).includes('✈')) {
      const next = dayItems.find(i => !String(i.title).includes('✈'));
      if (!next) continue;
      target = next;
    }
    const newStart = dayjs.tz(`${date} 07:00`, 'YYYY-MM-DD HH:mm', tripTz).toDate();
    const sorted = dayItems.map(i => ({ ...i })).sort((a,b) => (a.order||0)-(b.order||0));
    const idx = sorted.findIndex(i => i.id === target.id);
    if (idx >= 0) sorted[idx].startAt = newStart;
    const recalculated = recalculateSchedule(sorted, target.id, { newStartAt: newStart });
    const batch = writeBatch(db);
    for (const r of recalculated) {
      batch.update(doc(db, `trips/${tripId}/itineraryItems`, r.id), {
        startAt: r.startAt,
        endAt: r.endAt,
        order: r.order,
        durationMinutes: r.durationMinutes,
        travelToNextMinutes: r.travelToNextMinutes,
        updatedBy: userId,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  }
}

export async function runJanMigration(tripId, opts = {}) {
  const userId = opts.userId || auth?.currentUser?.uid || 'migration';
  const tz = opts.tripTz || 'Asia/Tokyo';
  await createJanFlights(tripId, userId);
  await createJanHotelCheckin(tripId, userId);
  await shiftAllDaysTo0700(tripId, userId, tz);
}
