// Unit tests — reservations (types, timeline, warnings, add-to-plan payload).
import {
  RESERVATION_TYPES, reservationTypeDef, sortReservations, reservationStamp, isUpcoming,
  upcomingReservations, groupReservationsByDate, routeLabel, reservationsCostByCurrency,
  reservationToItineraryPayload, durationBetween, reservationWarnings
} from '../../src/js/utils/reservations.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

const R = (over = {}) => ({ id: 'r', type: 'flight', title: 'TG676', date: '2026-03-28', startTime: '08:15', ...over });

export function testReservationTypes() {
  assert(RESERVATION_TYPES.length >= 8, 'several reservation types');
  assert(reservationTypeDef('hotel').id === 'hotel', 'known type resolves');
  assert(reservationTypeDef('unknown').id === 'other', 'unknown type falls back to other');
  for (const t of RESERVATION_TYPES) {
    assert(t.icon && t.th && t.en, `type ${t.id} needs icon + labels`);
  }
}

export function testSortAndGroup() {
  const list = [
    R({ id: 'c', date: '2026-03-30', startTime: '09:00' }),
    R({ id: 'a', date: '2026-03-28', startTime: '18:00' }),
    R({ id: 'b', date: '2026-03-28', startTime: '06:00' }),
    R({ id: 'd', date: '', title: 'no date' })
  ];
  const sorted = sortReservations(list).map(r => r.id);
  assert(sorted.join('') === 'bacd', `expected bacd, got ${sorted.join('')}`);
  const groups = groupReservationsByDate(list);
  assert(groups.length === 3, 'two dated days + unscheduled');
  assert(groups[0].items.map(r => r.id).join('') === 'ba', 'same-day entries sorted by time');
  assert(groups[2].date === 'unscheduled', 'undated entries go last');
}

export function testUpcoming() {
  const now = '2026-03-28T08:00';
  assert(isUpcoming(R(), now), 'a later same-day start is upcoming');
  assert(!isUpcoming(R({ date: '2026-03-27' }), now), 'past date is not upcoming');
  assert(reservationStamp(R()) === '2026-03-28T08:15', 'stamp is date + time');
  const next = upcomingReservations([
    R({ id: 'late', startTime: '20:00' }),
    R({ id: 'soon', startTime: '09:00' }),
    R({ id: 'past', date: '2026-03-01' })
  ], now, 2).map(r => r.id);
  assert(next.join('') === 'soonlate', `next reservations in order, got ${next.join('')}`);
}

export function testRouteAndMoney() {
  assert(routeLabel({ from: 'BKK', to: 'NRT' }) === 'BKK → NRT', 'route label');
  assert(routeLabel({ from: 'BKK' }) === 'BKK', 'partial route');
  const totals = reservationsCostByCurrency([
    R({ costMinor: 120000, currency: 'THB' }),
    R({ costMinor: 80000, currency: 'THB' }),
    R({ costMinor: 9000, currency: 'JPY' }),
    R({ costMinor: 0, currency: 'THB' })
  ]);
  assert(totals.THB === 200000 && totals.JPY === 9000, 'totals per currency');
}

export function testDuration() {
  assert(durationBetween('08:15', '11:45') === 210, 'same-day duration');
  assert(durationBetween('23:30', '01:00') === 90, 'overnight duration');
  assert(durationBetween('', '10:00') === 0, 'missing time = 0');
}

export function testToItinerary() {
  const payload = reservationToItineraryPayload(R({ confirmation: 'ABC123', seat: '12A', provider: 'THAI' }), { date: '2026-03-28', startAt: '08:15', order: 1 });
  assert(payload.title === 'TG676', 'title kept');
  assert(payload.category === 'transport', 'flights are transport');
  assert(payload.date === '2026-03-28' && payload.startAt === '08:15', 'slot applied');
  assert(payload.description.includes('ABC123'), 'confirmation code copied into the note');
  const hotel = reservationToItineraryPayload({ type: 'hotel', title: 'Keio Plaza', date: '2026-03-28' });
  assert(hotel.category === 'stay', 'hotels are stay');
}

export function testWarnings() {
  const warn = reservationWarnings({ type: 'flight', title: 'X' });
  assert(warn.length === 2, 'missing code + missing route flagged');
  assert(reservationWarnings({ type: 'restaurant', title: 'X', confirmation: 'Y' }).length === 0, 'restaurants are lenient');
  const hotel = reservationWarnings({ type: 'hotel', title: 'X', confirmation: 'Y', address: '' });
  assert(hotel.length === 1 && /ที่อยู่|address/i.test(hotel[0].th + hotel[0].en), 'hotel address nudge');
}

export function testReservations() {
  testReservationTypes();
  testSortAndGroup();
  testUpcoming();
  testRouteAndMoney();
  testDuration();
  testToItinerary();
  testWarnings();
  console.log('All reservation tests passed');
}
