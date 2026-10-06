/**
 * Optional, key-less “more about this place” lookup (v18).
 *
 * The trip plan already stores coordinates, a name and an address. What it cannot
 * know offline is whether the temple is open on Tuesdays, how famous the museum is
 * or that the station is actually 1.2 km from where you thought. Those three things
 * are fetched here from two free, key-less endpoints:
 *
 *   • Overpass API (OpenStreetMap)  → opening_hours, website, phone, wikipedia tag,
 *                                     OSM place type, the real OSM/Google Maps URL.
 *   • Wikipedia REST summary        → a one-paragraph description + thumbnail.
 *
 * Deliberately simple:
 *   - no API key, no billing, nothing for the user to configure;
 *   - 6.5 s timeout, and any failure is swallowed — the caller then shows a
 *     “could not load” note with the links instead;
 *   - results are kept in `sessionStorage`, one lookup per place per tab session,
 *     so re-opening a card never hits the network again;
 *   - nothing is ever written to Firestore: this is reference data, not trip data.
 */

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter'
];
const WIKI_TIMEOUT_MS = 6500;
const CACHE_PREFIX = 'fuji_place_details:';
/** Places closer than this are “the same place” for the cache key. */
const CACHE_PRECISION = 4;

/** Is the lookup even possible (public internet + fetch + a real coordinate)? */
export function placeDetailsSupported(item = {}) {
  return typeof fetch === 'function' && coordinatesOf(item) !== null;
}

/** {lat,lng} from the many shapes the app stores coordinates in. */
export function coordinatesOf(item = {}) {
  const raw = item && typeof item === 'object' && 'coordinates' in item ? item.coordinates : item;
  const lat = Number(raw?.lat ?? raw?.latitude ?? raw?.lat_ ?? raw?.y);
  const lng = Number(raw?.lng ?? raw?.lon ?? raw?.longitude ?? raw?.lng_ ?? raw?.x);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function cacheKey({ lat, lng }) {
  return `${CACHE_PREFIX}${lat.toFixed(CACHE_PRECISION)},${lng.toFixed(CACHE_PRECISION)}`;
}

function readCache(key) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function writeCache(key, value) {
  try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* quota / private mode */ }
}

async function withTimeout(promiseFactory, ms = WIKI_TIMEOUT_MS) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), ms) : null;
  try {
    return await promiseFactory(ctrl?.signal);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Overpass QL for the nearest few named things around a point. */
export function overpassQuery({ lat, lng }, radiusMeters = 350) {
  const r = Math.max(60, Math.min(2000, Math.round(radiusMeters)));
  return `[out:json][timeout:12];(\n`
    + `  node(around:${r},${lat},${lng})["name"]["tourism"];<;>;\n`
    + `  way(around:${r},${lat},${lng})["tourism"]["name"];out center tags 1;\n`
    + `  node(around:${r},${lat},${lng})["amenity"~"^(restaurant|cafe|bar|fast_food|bank|fuel|pharmacy|hospital)$"]["name"];out tags 3;\n`
    + `  node(around:${r},${lat},${lng})["historic"]["name"];out tags 2;\n`
    + `  node(around:${r},${lat},${lng})["natural"~"peak|beach|volcano"]["name"];out tags 1;\n`
    + `);out tags center 6;`;
}

/**
 * Pick the OSM element that best matches a place title.
 * Exported (and unit-tested) because the ranking is the only clever part here:
 * a temple next to a 7-Eleven must not return the shop.
 */
export function pickOsmElement(elements = [], title = '') {
  const want = normText(title);
  if (!want) return elements[0] || null;
  const scored = elements
    .map(el => {
      const tags = el?.tags || {};
      const name = normText(tags.name || tags['name:en'] || tags['name:th'] || '');
      let score = 0;
      if (!name) score -= 40;
      else if (name === want) score += 60;
      else if (name.includes(want) || want.includes(name)) score += 34;
      else score += commonTokenScore(want, name);
      // Landmarks and shops are better answers than a random node of the same name.
      if (tags.tourism) score += 12;
      if (tags.historic) score += 10;
      if (tags.amenity === 'cafe' || tags.amenity === 'restaurant') score += 6;
      if (tags.amenity === 'bank' || tags.amenity === 'fuel') score -= 14;
      if (tags.shop === 'convenience') score -= 20;
      // A named feature with more tags is the “richer” one — prefer it on ties.
      score += Math.min(6, Object.keys(tags).length / 8);
      return { el, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.el || null;
}

function normText(v) {
  return String(v || '').toLowerCase().replace(/\s+/g, ' ').replace(/[.,·•’'""()\-]/g, '').trim();
}

/** How many meaningful words the two strings share (0-30). */
function commonTokenScore(a, b) {
  const ba = new Set(a.split(' ').filter(w => w.length > 2));
  const bb = b.split(' ').filter(w => w.length > 2);
  let hits = 0;
  for (const w of bb) if (ba.has(w)) hits++;
  return Math.min(30, hits * 12);
}

/** Wikipedia summary for a title (language-aware), or null. */
export async function wikiSummary(title, lang = 'th') {
  const clean = String(title || '').trim();
  if (clean.length < 3) return null;
  const codes = [lang === 'th' ? 'th' : 'en', 'en'];
  for (const code of [...new Set(codes)]) {
    try {
      const url = `https://${code}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(clean)}`;
      const res = await withTimeout(signal => fetch(url, { signal, headers: { Accept: 'application/json' } }));
      if (!res.ok) continue;
      const data = await res.json();
      if (!data?.extract) continue;
      return {
        lang: code,
        title: data.title || clean,
        description: String(data.description || '').trim(),
        extract: String(data.extract).trim(),
        url: data.content_urls?.desktop?.page || `https://${code}.wikipedia.org/wiki/${encodeURIComponent(clean)}`,
        thumbnail: data.thumbnail?.source || data.originalimage?.source || ''
      };
    } catch { /* try the next language */ }
  }
  return null;
}

/**
 * Everything we can learn about a place. Never throws.
 * @returns {Promise<{ok:boolean, osm?:object, wiki?:object, mapsUrl:string, error?:string}>}
 */
export async function fetchPlaceDetails(item = {}, { lang = 'th', useCache = true, radiusMeters = 350 } = {}) {
  const pos = coordinatesOf(item);
  const title = String(item?.title || item?.name || '').trim();
  const mapsUrl = googleMapsUrlFor(pos, title, item?.googleMapsUrl);
  if (!pos) return { ok: false, mapsUrl, error: 'no-coordinates' };

  const key = cacheKey(pos);
  if (useCache) {
    const hit = readCache(key);
    if (hit) return hit;
  }

  const out = { ok: false, mapsUrl };
  try {
    const elements = await withTimeout(async (signal) => {
      let lastError = null;
      for (const endpoint of OVERPASS_ENDPOINTS) {
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            signal,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
            body: `data=${encodeURIComponent(overpassQuery(pos, radiusMeters))}`
          });
          if (!res.ok) { lastError = new Error(`HTTP ${res.status}`); continue; }
          const json = await res.json();
          return Array.isArray(json?.elements) ? json.elements : [];
        } catch (e) { lastError = e; }
      }
      throw lastError || new Error('overpass failed');
    });
    const el = pickOsmElement(elements, title);
    if (el) out.osm = osmDetails(el, pos);
  } catch (e) {
    out.error = `overpass:${e?.message || e}`;
  }

  // A Wikipedia paragraph is worth one more request — but only when we have a name.
  if (title) {
    const wiki = await wikiSummary(wikiSearchTitle(title, out.osm), lang);
    if (wiki) out.wiki = wiki;
  }

  out.ok = Boolean(out.osm || out.wiki);
  if (out.ok && useCache) writeCache(key, out);
  return out;
}

/** Prefer the OSM wikipedia tag ("Name@ja") when it exists. */
function wikiSearchTitle(title, osm) {
  const tag = String(osm?.wikipedia || '').trim();
  if (tag) {
    const at = tag.lastIndexOf('@');
    if (at > 0) return tag.slice(0, at);
    if (!tag.includes('/')) return tag;
  }
  return title;
}

function osmDetails(el, pos) {
  const tags = el?.tags || {};
  const lat = el?.lat ?? el?.center?.lat ?? pos?.lat;
  const lng = el?.lon ?? el?.center?.lon ?? pos?.lng;
  const distance = pos ? haversineKm(pos, { lat, lng }) : 0;
  return {
    id: el?.id ?? null,
    type: el?.type || 'node',
    name: tags.name || '',
    nameEn: tags['name:en'] || '',
    kind: osmKindLabel(tags),
    subKind: tags.cuisine ? tags.cuisine.replace(/_/g, ' ') : (tags.historic || tags.natural || ''),
    openingHours: tags.opening_hours || '',
    phone: tags.phone || tags['contact:phone'] || '',
    website: tags.website || tags['contact:website'] || '',
    email: tags.email || '',
    wikipedia: tags.wikipedia || tags['wikipedia:en'] || '',
    wikidata: tags.wikidata || '',
    image: tags.image || tags['wikimedia_commons'] || '',
    addr: [tags['addr:street'], tags['addr:housenumber'], tags['addr:city'], tags['addr:postcode'], tags['addr:state'], tags['addr:country']]
      .filter(Boolean).join(', '),
    entrance: tags.entrance || '',
    level: tags.level || '',
    floors: tags.buildings || '',
    fee: tags.fee || '',
    duration: tags.duration || '',
    stars: tags.stars || '',
    coordinates: { lat, lng },
    distanceKm: Math.round(distance * 100) / 100,
    osmUrl: el?.id ? `https://www.openstreetmap.org/${el.type || 'node'}/${el.id}` : 'https://www.openstreetmap.org/export/help'
  };
}

function osmKindLabel(tags = {}) {
  const map = {
    attraction: 'แหล่งท่องเที่ยว', attraction_viewpoint: 'จุดชมวิว', museum: 'พิพิธภัณฑ์', gallery: 'หอศิลป์',
    zoo: 'สวนสัตว์', aquarium: 'พิพิธภัณฑ์สัตว์น้ำ', theme_park: 'สวนสนุก', amusement_arcade: 'เกมเซ็นเตอร์',
    artwork: 'งานศิลปะ', viewpoint: 'จุดชมวิว', castle: 'ปราสาท', ruins: 'ซากโบราณ', monument: 'อนุสาวรีย์',
    information: 'ศูนย์ข้อมูลนักท่องเที่ยว', hotel: 'โรงแรม', guest_house: 'เกสต์เฮาส์', hostel: 'โฮสเทล',
    apartment: 'อพาร์ตเมนต์', chalet: 'ชาเลต์', camp_site: 'ลานแคมป์', picnic_site: 'ลานปิกนิก',
    beach: 'ชายหาด', peak: 'ยอดเขา', volcano: 'ภูเขาไฟ', cave_entrance: 'ถ้ำ', water: 'แหล่งน้ำ',
    spring: 'บ่อน้ำพุร้อน', nature_reserve: 'เขตอนุรักษ์', forest: 'ป่า', park: 'สวนสาธารณะ', garden: 'สวน',
    stadium: 'สนามกีฬา', sports_centre: 'สนามกีฬา', swimming_pool: 'สระว่ายน้ำ',
    restaurant: 'ร้านอาหาร', cafe: 'คาเฟ่', fast_food: 'ฟาสต์ฟู้ด', bar: 'บาร์', pub: 'ผับ', bakery: 'เบเกอรี่',
    ice_cream: 'ไอศกรีม', food_court: 'ฟู้ดคอร์ต', deli: 'ร้านของกิน',
    bank: 'ธนาคาร', atm: 'ตู้เอทีเอ็ม', exchange: 'แลกเงิน', fuel: 'ปั๊มน้ำมัน', parking: 'ที่จอดรถ',
    pharmacy: 'ร้านขายยา', hospital: 'โรงพยาบาล', clinic: 'คลินิก', police: 'ตำรวจ',
    post_office: 'ไปรษณีย์', marketplace: 'ตลาด', shop: 'ร้านค้า', mall: 'ห้าง',
    station: 'สถานีรถไฟ', bus_station: 'เทอร์มินัลรถ', tram_stop: 'รถราง', airport: 'สนามบิน',
    ferry_terminal: 'ท่าเรือ', taxi: 'คิวแท็กซี่', bus_stop: 'ป้ายรถเมล์',
    viewpoint_historic: 'แหล่งประวัติศาสตร์', historic: 'สถานที่ประวัติศาสตร์'
  };
  const key = tags.tourism || tags.amenity || tags.shop || tags.leisure || tags.natural || tags.historic || tags.highway || tags.public_transport || '';
  return map[key] || (key ? String(key).replace(/_/g, ' ') : '');
}

/** Distance in km between two {lat,lng} (equirectangular is plenty here). */
export function haversineKm(a, b) {
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad((b?.lat || 0) - (a?.lat || 0));
  const dLon = toRad((b?.lng || 0) - (a?.lng || 0));
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a?.lat || 0)) * Math.cos(toRad(b?.lat || 0)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function googleMapsUrlFor(pos, title, saved) {
  if (/^https?:\/\//i.test(String(saved || ''))) return saved;
  if (pos) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${pos.lat},${pos.lng}`)}`;
  return title ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(title)}` : '';
}

/**
 * Compact HTML for the place card / map popup. Escapes everything it prints.
 * `lang` only chooses the labels — the text itself comes from OSM/Wikipedia.
 */
export function placeDetailsHtml(details = {}, { lang = 'th', compact = false } = {}) {
  const th = (a, b) => (lang === 'th' ? a : b);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  if (!details || details.ok === false) {
    return `<div class="place-details place-details--empty">
      <span class="place-details-note">${iconSvg('wifi-off')} ${esc(th('ดึงข้อมูลเพิ่มเติมไม่ได้ (อาจออฟไลน์)', 'Could not load extra details (offline?)'))}</span>
      ${details?.mapsUrl ? `<a class="place-details-link" href="${esc(details.mapsUrl)}" target="_blank" rel="noopener">${iconSvg('external-link')} Google Maps</a>` : ''}
    </div>`;
  }
  const osm = details.osm || {};
  const wiki = details.wiki || null;
  const rows = [];
  if (osm.kind) rows.push(['tag', `${esc(osm.kind)}${osm.subKind ? ` • ${esc(osm.subKind)}` : ''}`]);
  if (osm.openingHours) rows.push(['clock', esc(prettyOpeningHours(osm.openingHours, lang))]);
  if (osm.phone) rows.push(['phone', `<a href="tel:${esc(osm.phone.replace(/[^\d+]/g, ''))}">${esc(osm.phone)}</a>`]);
  if (osm.website) rows.push(['globe', `<a href="${esc(osm.website)}" target="_blank" rel="noopener nofollow">${esc(shortUrl(osm.website))}</a>`]);
  if (osm.addr) rows.push(['map-pin', esc(osm.addr)]);
  if (osm.fee && /^(yes|true)$/i.test(String(osm.fee))) rows.push(['ticket', esc(th('มีค่าเข้า', 'charges an entrance fee'))]);
  if (osm.duration) rows.push(['timer', `${esc(th('ใช้เวลา', 'takes about'))} ${esc(osm.duration)}`]);
  if (Number.isFinite(osm.distanceKm) && osm.distanceKm > 0.15) {
    rows.push(['navigation', `${esc(th('หมุด OSM ห่าง', 'OSM pin is'))} ${osm.distanceKm.toFixed(1)} km`]);
  }

  const chips = [];
  if (osm.osmUrl) chips.push(`<a class="place-details-link" href="${esc(osm.osmUrl)}" target="_blank" rel="noopener nofollow">${iconSvg('database')} OpenStreetMap</a>`);
  if (wiki?.url) chips.push(`<a class="place-details-link" href="${esc(wiki.url)}" target="_blank" rel="noopener nofollow">${iconSvg('book-open')} Wikipedia${wiki.lang === 'th' ? '' : ' (en)'}</a>`);
  if (details.mapsUrl) chips.push(`<a class="place-details-link" href="${esc(details.mapsUrl)}" target="_blank" rel="noopener">${iconSvg('external-link')} Google Maps</a>`);

  const body = rows.length
    ? `<ul class="place-details-rows">${rows.map(([ic, text]) => `<li>${iconSvg(ic)}<span>${text}</span></li>`).join('')}</ul>`
    : '';
  const blurb = wiki?.extract
    ? `<p class="place-details-blurb${compact ? ' is-compact' : ''}">${wiki.thumbnail && !compact ? `<img src="${esc(wiki.thumbnail)}" alt="" loading="lazy">` : ''}${esc(compact ? truncate(wiki.extract, 150) : truncate(wiki.extract, 420))}</p>`
    : '';
  return `<div class="place-details">
    ${body}${blurb}
    ${chips.length ? `<div class="place-details-links">${chips.join('')}</div>` : ''}
  </div>`;
}

/** `Mo-Su 09:00-17:00` → `อ.-อา. 09:00-17:00` (best effort, never throws). */
export function prettyOpeningHours(raw, lang = 'th') {
  const text = String(raw || '').trim();
  if (!text) return '';
  if (lang !== 'th') return text.replace(/,/g, ' • ');
  const days = { Mo: 'จ.', Tu: 'อ.', We: 'พ.', Th: 'พฤ.', Fr: 'ศ.', Sa: 'ส.', Su: 'อา.' };
  return text
    .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su)\b(-\b(Mo|Tu|We|Th|Fr|Sa|Su)\b)?/g, (m) => m.split('-').map(d => days[d] || d).join('-'))
    .replace(/,\s*/g, ' • ')
    .replace(/24\/7/i, 'เปิดทั้งวันทั้งคืน');
}

function shortUrl(url) {
  return String(url || '').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').slice(0, 46);
}

function truncate(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : `${t.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

/** Tiny inline icons so the module never depends on the Lucide pass in app.js. */
function iconSvg(name) {
  const paths = {
    tag: '<path d="M20.6 13.4 12 22l-9-9V3h10z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    phone: '<path d="M4 4h4l2 5-2 1a12 12 0 0 0 6 6l1-2 5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 2 6a2 2 0 0 1 2-2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18"/>',
    'map-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    ticket: '<path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-4Z"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4M9 3h6"/>',
    navigation: '<path d="m3 11 18-8-8 18-2-8z"/>',
    'external-link': '<path d="M14 4h6v6M20 4l-9 9M18 13v6H5V6h6"/>',
    'book-open': '<path d="M12 6c-2-1.5-5-1.5-8-1v13c3-.5 6-.5 8 1 2-1.5 5-1.5 8-1V5c-3-.5-6-.5-8 1Z"/><path d="M12 6v13"/>',
    database: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6"/>',
    'wifi-off': '<path d="M2 4l20 16M8.5 12.5a6 6 0 0 1 6 0M5 9a11 11 0 0 1 4-2.2M15 6.8A11 11 0 0 1 19 9M12 18h.01"/>'
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="place-details-ic">${paths[name] || paths.tag}</svg>`;
}
