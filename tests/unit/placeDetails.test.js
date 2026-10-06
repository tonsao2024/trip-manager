// v18 — the optional, key-less place lookup (OpenStreetMap Overpass + Wikipedia).
// Only the pure half is tested here: no network, no DOM.
import {
  coordinatesOf, placeDetailsSupported, overpassQuery, pickOsmElement,
  haversineKm, prettyOpeningHours, placeDetailsHtml
} from '../../src/js/utils/placeDetails.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

export function testCoordinates() {
  assert(coordinatesOf({ lat: 35.5, lng: 138.75 }).lat === 35.5, '{lat,lng} works');
  assert(coordinatesOf({ latitude: '35.5', longitude: '138.75' }).lng === 138.75, 'long names and strings work');
  assert(coordinatesOf({ coordinates: '35.5,138.75' }).lat === 35.5, 'the stored string form works');
  assert(coordinatesOf('35.5,138.75').lng === 138.75, 'a bare string works');
  assert(coordinatesOf({ lat: 200, lng: 0 }) === null, 'an impossible latitude is rejected');
  assert(coordinatesOf({ lat: 'abc', lng: 1 }) === null, 'garbage is rejected');
  assert(coordinatesOf(null) === null && coordinatesOf({}) === null, 'nothing at all is null');
  assert(placeDetailsSupported({ coordinates: '35,138' }) === true, 'a pinned place can be looked up');
  assert(placeDetailsSupported({ title: 'no coords' }) === false, 'an unpinned place is skipped');
  console.log('✓ coordinatesOf / placeDetailsSupported');
}

export function testOverpassQuery() {
  const q = overpassQuery({ lat: 35.5171, lng: 138.7519 });
  assert(q.includes('[out:json]'), 'the response format is pinned');
  assert(q.includes('35.5171,138.7519'), 'the point is in the query');
  assert(q.includes('around:350'), 'the default radius is 350 m');
  assert(overpassQuery({ lat: 1, lng: 2 }, 5).includes('around:60'), 'the radius never goes below 60 m');
  assert(overpassQuery({ lat: 1, lng: 2 }, 999999).includes('around:2000'), 'nor above 2 km');
  assert(q.includes('"tourism"') && q.includes('"historic"'), 'landmarks are searched for');
  console.log('✓ overpassQuery');
}

export function testPickOsmElement() {
  const elements = [
    { type: 'node', id: 1, tags: { name: 'Fujiyoshida Station', amenity: 'fuel' } },
    { type: 'way', id: 2, tags: { name: 'Chureito Pagoda', tourism: 'attraction', opening_hours: '08:00-17:00' } },
    { type: 'node', id: 3, tags: { name: 'Lawson Fujiyoshida', shop: 'convenience' } }
  ];
  assert(pickOsmElement(elements, 'Chureito Pagoda').id === 2, 'the exact name wins');
  assert(pickOsmElement(elements, 'Lake Kawaguchi') !== null, 'a fuzzy query still answers something');
  const temple = pickOsmElement([
    { id: 9, tags: { name: 'Asakusa 7-11', shop: 'convenience' } },
    { id: 10, tags: { name: 'Asakusa', tourism: 'attraction' } }
  ], 'Asakusa');
  assert(temple.id === 10, 'a landmark outranks a corner shop of a similar name');
  assert(pickOsmElement([], 'anything') === null, 'no results is null');
  assert(pickOsmElement(elements, '').id === 1, 'an empty title takes whatever came back first');
  console.log('✓ pickOsmElement');
}

export function testDistanceAndHours() {
  const tokyoKyoto = haversineKm({ lat: 35.681, lng: 139.692 }, { lat: 35.011, lng: 135.768 });
  assert(tokyoKyoto > 340 && tokyoKyoto < 400, `Tokyo→Kyoto is ~370 km, got ${tokyoKyoto.toFixed(1)}`);
  assert(haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0 }) === 0, 'the same point is 0 km');
  assert(haversineKm(null, { lat: 1, lng: 1 }) === 0, 'missing coordinates are 0, never NaN');

  const th = prettyOpeningHours('Mo-Su 09:00-17:00, Ph 10:00-16:00', 'th');
  assert(th.includes('จ.-อา.'), 'weekday abbreviations are localised');
  assert(th.includes('10:00-16:00'), 'the second block survives');
  assert(prettyOpeningHours('24/7', 'th').includes('เปิดทั้งวันทั้งคืน'), '24/7 is explained in Thai');
  assert(prettyOpeningHours('Mo-We 09:00-17:00', 'en') === 'Mo-We 09:00-17:00', 'English is left alone');
  assert(prettyOpeningHours('', 'th') === '', 'nothing in, nothing out');
  console.log('✓ haversineKm / prettyOpeningHours');
}

export function testDetailsHtml() {
  const empty = placeDetailsHtml({ ok: false, mapsUrl: 'https://maps.google.com/x' }, { lang: 'en' });
  assert(/Could not load/.test(empty), 'the failure state explains itself');
  assert(/Google Maps/.test(empty) && empty.includes('href="https://maps.google.com/x"'), 'the maps link is still offered');

  const html = placeDetailsHtml({
    ok: true,
    mapsUrl: 'https://maps.google.com/y',
    osm: {
      kind: 'แหล่งท่องเที่ยว', subKind: 'pagoda', name: 'Chureito', openingHours: 'Mo-Su 08:00-17:00',
      phone: '+81 555-24-2498', website: 'https://example.test/"><script>alert(1)</script>',
      addr: '42 Miyoshi, Fujiyoshida', osmUrl: 'https://www.openstreetmap.org/way/2', distanceKm: 0.9
    },
    wiki: {
      lang: 'th', url: 'https://th.wikipedia.org/wiki/x',
      extract: 'หอคอยชูริโตะ ตั้งอยู่ในฟุจิโยชิดะ จังหวัดยามางาตะ สร้างเมื่อปีโชวะ '.repeat(24),
      thumbnail: 'https://upload.test/t.jpg'
    }
  }, { lang: 'th' });
  assert(!html.includes('<script>'), 'nothing the API returns is trusted as markup');
  assert(html.includes('&lt;script&gt;'), 'the payload is escaped rather than dropped');
  assert(html.includes('จ.-อา. 08:00-17:00'), 'opening hours are localised inside the card');
  assert(html.includes('tel:+81555242498'), 'a phone number becomes a call link');
  assert(html.includes('0.9 km'), 'the drift of the OSM pin is reported');
  assert(html.includes('OpenStreetMap') && html.includes('Wikipedia') && html.includes('Google Maps'), 'all three sources are linked');
  assert(html.includes('…'), 'a long encyclopaedia paragraph is truncated');
  assert(html.includes('place-details-rows'), 'the rows are a list the CSS can style');
  assert(placeDetailsHtml(null, { lang: 'th' }).includes('place-details'), 'null details still renders a card');
  assert(placeDetailsHtml({ ok: true, osm: { name: 'x' } }, { lang: 'en', compact: true }).includes('place-details'), 'a thin result renders');
  console.log('✓ placeDetailsHtml');
}
