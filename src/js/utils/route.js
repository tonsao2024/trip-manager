// Route optimiser — “จัดลำดับเส้นทาง” for one day's places.
//
// Wanderlog reorders a day by distance; this is the same idea, computed locally
// with a nearest-neighbour pass from the first stop (or the hotel):
//   const { order, savedKm, beforeKm, afterKm } = optimizeDayOrder(items)
//
// Pure functions only — tests/unit/route.test.js runs them in Node.

export function toRad(deg) { return (deg * Math.PI) / 180; }

/**
 * Normalise every coordinate shape the app stores into { lat, lng }:
 *   { lat, lng } | { latitude, longitude } | '35.5171,138.7519' | item-with-coordinates
 * Returns null when there is nothing usable. (mirrors maps/index.js parseCoord)
 */
export function coordOf(value) {
  const raw = value && typeof value === 'object' && 'coordinates' in value ? value.coordinates : value;
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') {
    const lat = num(raw.lat ?? raw.latitude);
    const lng = num(raw.lng ?? raw.lon ?? raw.longitude);
    return (lat === null || lng === null) ? null : { lat, lng };
  }
  const parts = String(raw).split(',').map(part => num(part.trim()));
  if (parts.length !== 2 || parts[0] === null || parts[1] === null) return null;
  if (parts[0] < -90 || parts[0] > 90 || parts[1] < -180 || parts[1] > 180) return null;
  return { lat: parts[0], lng: parts[1] };
}

/** Great-circle distance in km between two coordinate values / items. */
export function haversineKm(a, b) {
  const p1 = coordOf(a), p2 = coordOf(b);
  if (!p1 || !p2) return 0;
  const la1 = p1.lat, lo1 = p1.lng, la2 = p2.lat, lo2 = p2.lng;
  const R = 6371;
  const dLat = toRad(la2 - la1);
  const dLon = toRad(lo2 - lo1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Does this itinerary item carry usable coordinates? */
export function hasCoords(item) {
  return coordOf(item) !== null;
}

/** Total path length in km for an ordered list (skips items without coords). */
export function pathKm(items = []) {
  let total = 0;
  for (let i = 1; i < items.length; i++) {
    if (!hasCoords(items[i - 1]) || !hasCoords(items[i])) continue;
    total += haversineKm(items[i - 1].coordinates, items[i].coordinates);
  }
  return round2(total);
}

/**
 * Nearest-neighbour reorder.
 * @param {Array} items  itinerary items (one day, any order)
 * @param {Object} [opts]
 * @param {boolean} [opts.keepFirst=true]  keep the current first stop as the start
 * @param {number}  [opts.roundTripSpeedKmh=30] used for the time estimate
 * @returns {{ order: string[], ordered: Array, beforeKm: number, afterKm: number, savedKm: number, savedMinutes: number, stops: number }}
 */
export function optimizeDayOrder(items = [], { keepFirst = true, roundTripSpeedKmh = 30 } = {}) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  const located = list.filter(hasCoords);
  const pinned = list.filter(i => !hasCoords(i));
  const beforeKm = pathKm(list);
  const unchanged = {
    order: list.map(i => i.id), ordered: list,
    beforeKm, afterKm: beforeKm, savedKm: 0, savedMinutes: 0, stops: located.length
  };

  if (located.length < 3) return unchanged;

  // Timed stops (startAt) are fixed anchors: they never move relative to each
  // other. Untimed stops are re-ordered only inside the part of the day they
  // already belong to (before the first anchor, between two anchors, after the
  // last one) — so a morning plan can never be pushed into the evening.
  const timed = located.filter(i => i.startAt)
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const timedSet = new Set(timed);

  const segments = [[]];
  const anchors = [];
  located.forEach(item => {
    if (timedSet.has(item)) { anchors.push(item); segments.push([]); }
    else segments[segments.length - 1].push(item);
  });

  const placed = [];
  let cursor = null;
  const place = (item) => { placed.push(item); cursor = item; };

  const orderSegment = (segment) => {
    const pool = segment.slice();
    // The very first untimed stop of the day keeps its place (usually the hotel
    // or station the day starts from) unless the caller opts out.
    if (!placed.length && keepFirst && pool.length) place(pool.shift());
    while (pool.length) {
      let bestIndex = 0;
      let bestDist = Infinity;
      pool.forEach((it, idx) => {
        const d = cursor ? haversineKm(cursor, it) : 0;
        if (d < bestDist) { bestDist = d; bestIndex = idx; }
      });
      place(pool.splice(bestIndex, 1)[0]);
    }
  };

  for (let i = 0; i < segments.length; i++) {
    orderSegment(segments[i]);
    if (anchors[i]) place(anchors[i]);
  }

  const finalOrder = [...placed, ...pinned];
  const afterKm = pathKm(finalOrder);
  // Never propose a route that is longer than the one already stored.
  if (!(afterKm < beforeKm)) return { ...unchanged, afterKm };

  const savedKm = round2(beforeKm - afterKm);
  const savedMinutes = Math.round((savedKm / Math.max(5, roundTripSpeedKmh)) * 60);

  return {
    order: finalOrder.map(i => i.id),
    ordered: finalOrder,
    beforeKm,
    afterKm,
    savedKm,
    savedMinutes,
    stops: located.length
  };
}

/**
 * Suggest `travelToNextMinutes` values for an ordered list
 * (≈30 km/h city average + 10 min buffer, min 5 min).
 */
export function suggestTravelMinutes(items = [], { speedKmh = 30, bufferMinutes = 10, minMinutes = 5 } = {}) {
  const out = {};
  for (let i = 0; i < items.length - 1; i++) {
    const a = items[i];
    const b = items[i + 1];
    if (!hasCoords(a) || !hasCoords(b)) continue;
    const km = haversineKm(a.coordinates, b.coordinates);
    out[a.id] = Math.max(minMinutes, Math.round((km / speedKmh) * 60) + bufferMinutes);
  }
  return out;
}

/** Google Maps deep-link for the whole day (max 10 waypoints is plenty). */
export function dayDirectionsUrl(items = [], { travelMode = 'driving' } = {}) {
  const points = (items || [])
    .filter(hasCoords)
    .map(i => `${num(i.coordinates.lat ?? i.coordinates.latitude)},${num(i.coordinates.lng ?? i.coordinates.lon ?? i.coordinates.longitude)}`)
    .slice(0, 11);
  if (points.length < 2) return '';
  const [origin, ...rest] = points;
  const destination = rest.pop();
  const waypoints = rest.join('|');
  const params = new URLSearchParams({ api: '1', origin, destination, travelmode: travelMode });
  if (waypoints) params.set('waypoints', waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Rough walk/drive time shown before the user commits to the new order. */
export function travelTimeLabel(minutes, lang = 'th') {
  const m = Math.max(0, Math.round(Number(minutes) || 0));
  if (m < 60) return lang === 'th' ? `${m} นาที` : `${m} min`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return lang === 'th' ? `${h} ชม.${rest ? ` ${rest} นาที` : ''}` : `${h}h${rest ? ` ${rest}m` : ''}`;
}

export function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
