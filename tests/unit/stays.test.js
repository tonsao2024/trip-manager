// Unit tests — hotel stays expand into “leave / return” cards at trip-local times.
import { expandStayItems, stayNights } from '../../src/js/utils/stays.js';
import { dayjs } from '../../src/js/utils/date.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }
const hhmm = (d, tz = 'Asia/Tokyo') => dayjs(d).tz(tz).format('HH:mm');

export function testDepartureDefaultsTo0700InTripZone() {
  const stay = {
    id: 'h1',
    title: 'The OneFive Tokyo Kameido',
    date: '2026-01-22',
    stayCheckIn: '2026-01-22',
    stayCheckOut: '2026-01-24',
    durationMinutes: 60,
    estimateAmount: 0
  };
  assert(stayNights(stay) === 2, 'two nights');
  const cards = expandStayItems([stay], { timezone: 'Asia/Tokyo' });
  const departures = cards.filter(c => c.virtualDeparture);
  assert(departures.length === 2, 'one departure card per morning after a night');
  for (const d of departures) {
    assert(hhmm(d.startAt) === '07:00', `leaving the hotel prints 07:00 (got ${hhmm(d.startAt)})`);
  }
  assert(cards.filter(c => c.virtualStay).every(c => hhmm(c.startAt) === '21:00'), 'returning to the hotel prints 21:00');
}

export function testDepartureUsesTheSameZoneOnEveryDevice() {
  const stay = {
    id: 'h2',
    title: 'Hotel',
    date: '2026-01-22',
    stayCheckIn: '2026-01-22',
    stayCheckOut: '2026-01-23',
    durationMinutes: 60
  };
  const cards = expandStayItems([stay], { timezone: 'Asia/Tokyo' });
  const leave = cards.find(c => c.virtualDeparture);
  // 07:00 Tokyo is 22:00 UTC the day before — not the device's local 07:00.
  assert(+leave.startAt === Date.parse('2026-01-22T22:00:00Z'), 'the card is built from the trip timezone');
}
