// Paste this into the browser console while on the itinerary page (logged in as trip_admin)
// It performs the 3 data tasks requested: flights, 07:00 shift, hotel check-in.
// Assumes tripId is taken from the URL hash like #/trip/<tripId>/itinerary
//
//  Usage:
//    1) Open your trip itinerary page
//    2) Open DevTools Console
//    3) Copy-paste the whole file and press Enter
//    4) Watch toast + console logs
//
//  Requires: currentUser, currentTrip set (renderItinerary already loaded them)

(async () => {
  const hash = location.hash || '';
  const m = hash.match(/\/trip\/([^\/\?]+)/);
  const tripId = m ? m[1] : null;
  if (!tripId) { console.error('Cannot find tripId from hash', hash); return; }
  const { db } = await import('../src/js/firebase.js');
  const { collection, doc, getDocs, addDoc, updateDoc, writeBatch, query, orderBy, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  const { dayjs } = await import('../src/js/utils/date.js');
  const { fetchItinerary } = await import('../src/js/itinerary/index.js');
  const { recalculateSchedule } = await import('../src/js/utils/scheduling.js');

  const tripSnap = await (await import('../src/js/trips/index.js')).loadTrip ? null : null;
  // Get trip timezone (fallback to Asia/Tokyo for Jan Japan trip)
  let tripTz = 'Asia/Tokyo';
  try {
    const tDoc = await (await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')).getDoc(doc(db, `trips/${tripId}`));
    if (tDoc.exists()) tripTz = tDoc.data().timezone || tripTz;
  } catch {}

  const uid = (await import('../src/js/firebase.js')).auth?.currentUser?.uid || 'migration';

  console.log('[migrate] tripId', tripId, 'tz', tripTz);

  // 1) Flights: BKK -> SGN 20:50-22:40 on 2026-01-15, SGN->NRT 00:25-07:45 on 2026-01-16
  async function ensureFlight({ title, date, startLocal, endLocal, tz, from, to, flightNumber }) {
    const startAt = dayjs.tz(`${date} ${startLocal}`, 'YYYY-MM-DD HH:mm', tz).toDate();
    // end may be next calendar day if red-eye
    const endDate = endLocal < startLocal ? dayjs.tz(date, 'YYYY-MM-DD', tz).add(1, 'day').format('YYYY-MM-DD') : date;
    // Actually endLocal is time string, need full date for end
    let endAt;
    // If endLocal contains date, use it; else construct from end date + time
    // SGN->Tokyo red-eye: start 2026-01-16 00:25 SGN tz, end 2026-01-16 07:45 Tokyo tz -> better store as Tokyo time
    if (title.includes('SGN')) {
      // Second leg arrives Tokyo time
      endAt = dayjs.tz(`2026-01-16 07:45`, 'YYYY-MM-DD HH:mm', 'Asia/Tokyo').toDate();
    } else {
      endAt = dayjs.tz(`${endDate} ${endLocal}`, 'YYYY-MM-DD HH:mm', tz).toDate();
    }
    const durationMinutes = Math.round((endAt - startAt) / 60000);
    const payload = {
      title,
      description: `${from} → ${to} ${flightNumber || ''}`.trim(),
      date,
      startAt,
      endAt,
      durationMinutes: Math.max(1, durationMinutes),
      travelToNextMinutes: 0,
      order: 999, // will be appended at end, then re-ordered
      category: 'transport',
      address: `${from} → ${to}`,
      coordinates: '',
      notes: flightNumber ? `Flight ${flightNumber}` : '',
      status: 'planned',
    };
    // Check if similar flight already exists
    const all = await fetchItinerary(tripId, null);
    const exists = all.find(i => i.title === title && i.date === date);
    if (exists) { console.log('[migrate] flight exists', title, exists.id); return exists.id; }
    const ref = await addDoc(collection(db, `trips/${tripId}/itineraryItems`), {
      ...payload,
      createdBy: uid, updatedBy: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), version: 1
    });
    console.log('[migrate] created flight', title, ref.id);
    return ref.id;
  }

  await ensureFlight({
    title: '✈️ BKK → SGN (ต่อเครื่อง)',
    date: '2026-01-15',
    startLocal: '20:50', endLocal: '22:40',
    tz: 'Asia/Bangkok',
    from: 'BKK', to: 'SGN', flightNumber: ''
  });
  await ensureFlight({
    title: '✈️ SGN → Tokyo (NRT/HND)',
    date: '2026-01-16',
    startLocal: '00:25', endLocal: '07:45',
    tz: 'Asia/Ho_Chi_Minh',
    from: 'SGN', to: 'Tokyo', flightNumber: ''
  });

  // 2) Hotel check-in 22 Jan 21:00
  async function ensureHotel() {
    const title = '🏨 Check-in The OneFive Tokyo Kameido';
    const date = '2026-01-22';
    const startAt = dayjs.tz('2026-01-22 21:00', 'YYYY-MM-DD HH:mm', 'Asia/Tokyo').toDate();
    const payload = {
      title,
      description: 'The OneFive Tokyo Kameido',
      date,
      startAt,
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
    };
    const all = await fetchItinerary(tripId, null);
    const exists = all.find(i => i.title === title && i.date === date);
    if (exists) { console.log('[migrate] hotel exists', exists.id); return exists.id; }
    const ref = await addDoc(collection(db, `trips/${tripId}/itineraryItems`), {
      ...payload,
      endAt: dayjs(startAt).add(60, 'minute').toDate(),
      createdBy: uid, updatedBy: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), version: 1
    });
    console.log('[migrate] created hotel', ref.id);
    return ref.id;
  }
  await ensureHotel();

  // 3) Shift every sightseeing day to 07:00, keep order, cascade times
  const allItems = await fetchItinerary(tripId, null);
  // Group by date
  const byDate = {};
  for (const it of allItems) {
    if (!it.date) continue;
    (byDate[it.date] = byDate[it.date] || []).push(it);
  }
  const dates = Object.keys(byDate).sort();
  console.log('[migrate] dates', dates);

  // For each date, if first non-flight is sightseeing/general, shift its start to 07:00 tripTz
  // Flights on 2026-01-15 and 2026-01-16 keep their fixed times — skip those dates for 07:00 shift
  const skipShift = new Set(['2026-01-15', '2026-01-16', '2026-01-22']);
  for (const date of dates) {
    if (skipShift.has(date)) { console.log('[migrate] skip shift for', date); continue; }
    const dayItems = byDate[date].sort((a,b) => (a.order||0)-(b.order||0));
    if (!dayItems.length) continue;
    // Find first stay/sightseeing/general that is not a flight
    const first = dayItems.find(i => i.category !== 'transport' || !String(i.title).includes('✈')) || dayItems[0];
    // If first is a flight, find next non-flight
    // Actually we want hotel departure item — often category stay or first item of day
    // For simplicity, take first item by order and shift it to 07:00 unless it's a flight
    let target = dayItems[0];
    if (String(target.title).includes('✈')) {
      // Find next non-flight
      const next = dayItems.find(i => !String(i.title).includes('✈'));
      if (!next) continue;
      target = next;
    }
    const newStart = dayjs.tz(`${date} 07:00`, 'YYYY-MM-DD HH:mm', tripTz).toDate();
    console.log('[migrate] shift date', date, 'target', target.title, 'old', target.startAt, 'new', newStart);

    // Build sorted array for recalc
    const sorted = dayItems.map(i => ({ ...i })).sort((a,b) => (a.order||0)-(b.order||0));
    // recalculateSchedule expects items sorted and changedItemId
    sorted.forEach(i => {
      if (i.id === target.id) i.startAt = newStart;
    });
    const recalculated = recalculateSchedule(sorted, target.id, { newStartAt: newStart });
    // Write batch
    const batch = writeBatch(db);
    for (const r of recalculated) {
      const ref = doc(db, `trips/${tripId}/itineraryItems`, r.id);
      batch.update(ref, {
        startAt: r.startAt,
        endAt: r.endAt,
        order: r.order,
        durationMinutes: r.durationMinutes,
        travelToNextMinutes: r.travelToNextMinutes,
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
    console.log('[migrate] shifted', date, '-> 07:00');
  }

  console.log('[migrate] done. Reload page.');
})();
