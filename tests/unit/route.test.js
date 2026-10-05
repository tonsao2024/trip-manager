// Unit tests — route optimiser (nearest neighbour, distances, deep links).
import {
  haversineKm, hasCoords, coordOf, pathKm, optimizeDayOrder, suggestTravelMinutes,
  dayDirectionsUrl, travelTimeLabel, round2
} from '../../src/js/utils/route.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

const BKK = { lat: 13.7563, lng: 100.5018 };
const NRT = { lat: 35.7720, lng: 140.3929 };
const item = (id, coordinates, over = {}) => ({ id, coordinates, title: id, ...over });

export function testHaversine() {
  const km = haversineKm(BKK, NRT);
  assert(km > 4400 && km < 4700, `BKK→NRT should be ~4600 km, got ${km}`);
  assert(haversineKm(BKK, BKK) === 0, 'same point = 0 km');
  assert(haversineKm({ latitude: 13.7563, longitude: 100.5018 }, BKK) === 0, 'lat/latitude aliases work');
  assert(haversineKm({}, BKK) === 0, 'missing coordinates are safe');
}

export function testHasCoordsAndPath() {
  assert(hasCoords(item('a', { lat: 1, lng: 2 })), 'lat/lng accepted');
  assert(hasCoords(item('a', { latitude: 1, longitude: 2 })), 'latitude/longitude accepted');
  assert(!hasCoords(item('a', null)) && !hasCoords(item('a', { lat: 'x', lng: 2 })), 'invalid coordinates rejected');
  // The app also stores coordinates as "lat,lng" strings (see the seeded/imported data).
  assert(hasCoords(item('a', '35.5171,138.7519')), 'string coordinates accepted');
  assert(coordOf('35.5171,138.7519').lat === 35.5171, 'string coordinates parsed');
  assert(coordOf({ latitude: 1, longitude: 2 }).lng === 2, 'latitude/longitude parsed');
  assert(coordOf('999,999') === null && coordOf('nope') === null, 'out-of-range / junk rejected');
  assert(haversineKm('0,0', { lat: 0, lng: 0.1 }).toFixed(1) === '11.1', 'string + object mix works');
  const km = pathKm([item('a', { lat: 0, lng: 0 }), item('b', { lat: 0, lng: 0.1 })]);
  assert(km > 10 && km < 12, `0.1° along the equator ≈ 11 km, got ${km}`);
  assert(round2(1.2345) === 1.23 && round2(1.006) === 1.01, 'round2 rounds to 2 decimals');
}

export function testOptimize() {
  // A→B→C→A (square) visiting in a zig-zag order should be improved.
  const a = item('a', { lat: 0, lng: 0 });
  const b = item('b', { lat: 0, lng: 0.10 });
  const c = item('c', { lat: 0.10, lng: 0.10 });
  const d = item('d', { lat: 0.10, lng: 0 });
  const zigzag = [a, c, b, d];
  const result = optimizeDayOrder(zigzag);
  assert(result.stops === 4, 'four located stops');
  assert(result.afterKm <= result.beforeKm, 'never worse than the original');
  assert(result.savedKm >= 0 && result.savedMinutes >= 0, 'savings are non-negative');
  assert(result.order.length === 4 && new Set(result.order).size === 4, 'order keeps every item once');
  assert(result.order[0] === 'a', 'first stop is kept as the anchor');

  // Items without coordinates travel along at the end, untouched.
  const withPinned = [...zigzag, { id: 'z', title: 'no coords' }];
  const r2 = optimizeDayOrder(withPinned);
  assert(r2.order[r2.order.length - 1] === 'z', 'coordinate-less items end up last');

  // Timed items stay in their chronological order.
  const timed = [a, item('t1', { lat: 0.05, lng: 0.05 }, { startAt: '09:00' }), b, item('t2', { lat: 0.06, lng: 0.06 }, { startAt: '14:00' })];
  const r3 = optimizeDayOrder(timed);
  const i1 = r3.order.indexOf('t1');
  const i2 = r3.order.indexOf('t2');
  assert(i1 !== -1 && i2 !== -1 && i1 < i2, 'timed stops keep their order');

  const small = optimizeDayOrder([a, b]);
  assert(small.savedKm === 0 && small.stops === 2, 'fewer than 3 located stops → no changes');

  // An already optimal (straight) day must be left exactly as it is.
  const straight = [a, item('p2', { lat: 0, lng: 0.1 }), item('p3', { lat: 0, lng: 0.2 }), item('p4', { lat: 0, lng: 0.3 })];
  const rStraight = optimizeDayOrder(straight);
  assert(rStraight.savedKm === 0, 'a straight day saves nothing');
  assert(rStraight.order.join(',') === 'a,p2,p3,p4', 'a straight day keeps its order');
}

export function testDaySegments() {
  const a = item('a', { lat: 0, lng: 0 });
  const morning = item('morning', { lat: 0.02, lng: 0.02 });
  const noon = item('noon', { lat: 0.30, lng: 0.30 }, { startAt: '12:00' });
  const evening = item('evening', { lat: 0.31, lng: 0.31 });
  const afterEvening = item('afterEvening', { lat: 0.05, lng: 0.05 });

  const r = optimizeDayOrder([a, morning, noon, evening, afterEvening]);
  const idx = id => r.order.indexOf(id);
  assert(idx('a') === 0, 'the day still starts with its first stop');
  assert(idx('morning') < idx('noon'), 'a morning stop never jumps after the timed noon stop');
  assert(idx('noon') < idx('evening') && idx('noon') < idx('afterEvening'),
    'stops planned after a timed anchor stay after it (even if they are closer to home)');
  assert(new Set(r.order).size === 5, 'every stop appears exactly once');
}

export function testSuggestTravel() {
  const items = [item('a', { lat: 0, lng: 0 }), item('b', { lat: 0, lng: 0.1 }), { id: 'c' }];
  const suggestion = suggestTravelMinutes(items, { speedKmh: 30, bufferMinutes: 10, minMinutes: 5 });
  assert(suggestion.a >= 20, `≈11 km at 30 km/h + buffer ≈ 30 min, got ${suggestion.a}`);
  assert(!('b' in suggestion) && !('c' in suggestion), 'no suggestion without coordinates');
  assert(suggestTravelMinutes([item('x', { lat: 0, lng: 0 }), item('y', { lat: 0, lng: 0.0001 })], { bufferMinutes: 0 }).x === 5, 'min minutes respected');
}

export function testDirectionsUrl() {
  const url = dayDirectionsUrl([item('a', BKK), item('b', NRT), item('c', { lat: 34.69, lng: 135.5 })]);
  assert(url.startsWith('https://www.google.com/maps/dir/?'), 'google maps deep link');
  assert(url.includes('origin=13.7563%2C100.5018'), 'origin is the first stop');
  assert(url.includes('travelmode=driving'), 'travel mode included');
  assert(dayDirectionsUrl([item('a', BKK)]) === '', 'one stop → no link');
  assert(dayDirectionsUrl([item('a', BKK), { id: 'b' }]) === '', 'only one located stop → no link');
  assert(travelTimeLabel(35, 'th').includes('35'), 'minute label');
  assert(travelTimeLabel(125, 'en').startsWith('2h'), 'hour label');
}

export function testRoute() {
  testHaversine();
  testHasCoordsAndPath();
  testOptimize();
  testDaySegments();
  testSuggestTravel();
  testDirectionsUrl();
  console.log('All route optimiser tests passed');
}
