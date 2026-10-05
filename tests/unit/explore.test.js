// Unit tests — Explore place guides (matching, search, suggestions, payloads).
import {
  DESTINATIONS, EXPLORE_CATEGORIES, destinationById, destinationPlaces, searchPlaces,
  matchDestinations, exploreCategoryCounts, suggestForTrip, distanceKm, parseCoord,
  bestTimeLabel, bestTimeIcon, suggestedTime, costInBase, placeToIdeaPayload,
  placeToPlanDraft, libraryStats
} from '../../src/js/utils/explore.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

export function testLibraryShape() {
  const stats = libraryStats();
  assert(stats.destinations >= 10, `expected ≥10 destinations, got ${stats.destinations}`);
  assert(stats.places >= 60, `expected ≥60 places, got ${stats.places}`);
  for (const dest of DESTINATIONS) {
    assert(dest.id && dest.country && dest.city, 'destination has id/country/city');
    assert(dest.tagline?.th && dest.tagline?.en, `${dest.id}: bilingual tagline`);
    assert(dest.places.length >= 5, `${dest.id}: at least 5 places`);
    for (const p of dest.places) {
      assert(p.id && p.name?.th && p.name?.en, `${dest.id}/${p.id}: bilingual name`);
      assert(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(p.coordinates), `${dest.id}/${p.id}: coordinates "lat,lng"`);
      assert(EXPLORE_CATEGORIES.some(c => c.id === p.category), `${dest.id}/${p.id}: known category`);
      assert(p.note?.th && p.note?.en, `${dest.id}/${p.id}: bilingual note`);
      assert(Number.isFinite(Number(p.cost)), `${dest.id}/${p.id}: numeric cost`);
    }
  }
}

export function testMatchDestinations() {
  assert(matchDestinations({ city: 'Tokyo', country: 'Japan' })[0].destination.id === 'tokyo', 'city match wins');
  assert(matchDestinations({ city: 'ฟุจิคาวากุจิโกะ', country: 'ญี่ปุ่น' })[0].destination.id === 'fuji', 'Thai city/country match');
  const thai = matchDestinations({ name: 'ทริปเชียงใหม่ 4 วัน', city: '', country: '' });
  assert(thai.some(m => m.destination.id === 'chiangmai'), 'keyword found in the trip name');
  assert(matchDestinations({ city: 'Nowhereville', country: 'Atlantis' }).length === 0, 'no false positives');
  assert(matchDestinations({}).length === 0, 'empty trip → no match');
  // country-only match still resolves to the country's destinations
  const jp = matchDestinations({ city: '', country: 'Japan' });
  assert(jp.length > 0 && jp.every(m => m.destination.country === 'Japan'), 'country match lists that country');
}

export function testSearchPlaces() {
  const all = searchPlaces('', { limit: 500 });
  assert(all.length === libraryStats().places, 'empty query returns the whole library');
  const bamboo = searchPlaces('ไผ่');
  assert(bamboo.some(r => r.place.id === 'arashiyama'), 'Thai keyword search');
  const fish = searchPlaces('market', { destinationId: 'tokyo' });
  assert(fish.length > 0 && fish.every(r => r.destination.id === 'tokyo'), 'search stays inside the chosen city');
  assert(searchPlaces('zzzzzz').length === 0, 'unknown query returns nothing');
  const tokyoPlaces = destinationPlaces('tokyo');
  const food = destinationPlaces('tokyo', { category: 'food' });
  assert(food.length > 0 && food.every(p => p.category === 'food'), 'category filter');
  assert(food.length < tokyoPlaces.length, 'category filter narrows the list');
  assert(destinationPlaces('nope').length === 0, 'unknown destination → empty');
}

export function testCategoryCounts() {
  const places = destinationPlaces('kyoto');
  const counts = exploreCategoryCounts(places);
  assert(counts[0].id === 'all' && counts[0].count === places.length, 'first chip counts everything');
  const sum = counts.slice(1).reduce((n, c) => n + c.count, 0);
  assert(sum === places.length, 'per-category counts add up');
}

export function testDistanceAndCoords() {
  const d = distanceKm('35.6586,139.7454', '35.7148,139.7967');
  assert(d > 7 && d < 9, `Tokyo Tower → Senso-ji ≈ 8 km (got ${d?.toFixed(2)})`);
  assert(distanceKm('a', 'b') === null, 'unparsable coordinates → null');
  assert(distanceKm('35.0,139.0', null) === null, 'missing side → null');
  assert(parseCoord({ lat: 1, lng: 2 }).lat === 1, 'object coordinates work');
  assert(parseCoord('13.75, 100.49').lng === 100.49, 'whitespace handled');
}

export function testSuggestions() {
  const itinerary = [
    { title: 'วัดเซ็นโซจิ (อาซากุสะ)', category: 'sightseeing', coordinates: '35.7148,139.7967' }
  ];
  const ideas = [{ title: 'โตเกียวสกายทรี' }];
  const reco = suggestForTrip({ destinationId: 'tokyo', itinerary, ideas, limit: 5 });
  assert(reco.length === 5, 'respects the limit');
  assert(!reco.some(r => /เซ็นโซจิ/.test(r.place.name.th)), 'planned places are excluded');
  assert(!reco.some(r => /สกายทรี/.test(r.place.name.th)), 'ideas already on the board are excluded');
  assert(reco.every(r => Number.isFinite(r.score)), 'every suggestion carries a score');
  const sorted = [...reco].sort((a, b) => b.score - a.score);
  assert(sorted[0].place.id === reco[0].place.id, 'sorted by score');
  const near = reco.find(r => r.nearKm != null);
  assert(near, 'suggestions near an existing stop report a distance');
  const empty = suggestForTrip({ places: [], itinerary });
  assert(empty.length === 0, 'empty pool → no suggestions');
}

export function testPayloads() {
  const place = destinationById('tokyo').places.find(p => p.id === 'tsukiji');
  const idea = placeToIdeaPayload(place, { baseCurrency: 'THB', rate: 0.23 });
  assert(idea.title === place.name.th, 'idea title uses the Thai name');
  assert(idea.category === 'food', 'category carried over');
  assert(idea.coordinates === place.coordinates, 'coordinates carried over');
  assert(idea.estimatedCostMinor === Math.round(place.cost * 0.23 * 100), 'cost converted to the trip currency');
  assert(idea.currency === 'THB', 'idea stores the base currency');

  const noRate = placeToIdeaPayload(place, { baseCurrency: 'JPY' });
  assert(noRate.estimatedCostMinor === Math.round(place.cost * 100), 'same currency needs no rate');

  const draft = placeToPlanDraft(place, { date: '2026-04-12', startAt: '08:30', baseCurrency: 'JPY' });
  assert(draft.date === '2026-04-12' && draft.startAt === '08:30', 'date/time pass through');
  assert(draft.durationMinutes === 90, 'duration from the guide');
  assert(draft.estimateAmount === place.cost && draft.estimateCurrency === 'JPY', 'estimate amount/currency');

  assert(costInBase({ cost: 100, currency: 'JPY' }, { baseCurrency: 'THB', rate: 0.25 }) === 2500, 'costInBase converts');
  assert(costInBase({ cost: 0 }, { baseCurrency: 'THB' }) === 0, 'free place → zero');
}

export function testTimeHints() {
  assert(suggestedTime({ best: 'morning' }) === '08:30', 'morning start');
  assert(suggestedTime({ best: 'evening' }) === '18:00', 'evening start');
  assert(suggestedTime({}) === '10:00', 'default start');
  assert(bestTimeLabel('morning', 'th') === 'เช้า' && bestTimeLabel('morning', 'en') === 'Morning', 'bilingual label');
  assert(bestTimeIcon('evening') === 'moon-star', 'evening icon');
  assert(bestTimeIcon('whatever') === 'clock', 'unknown best time → clock');
}
