// 気象庁 (Japan Meteorological Agency) — the official Japanese weather service.
//
// This is the same JSON the 気象庁 website itself loads in the browser. It is
// NOT an announced API contract, but it is public, stable since 2021, free to
// redistribute with attribution ("出典：気象庁") and needs no key or account.
// Every consumer MUST tolerate failure and fall back to Open-Meteo / Visual
// Crossing (weather is a nice-to-have, never a blocker).
//
// Pure helpers are exported for the unit tests; fetch* are browser-only.

/* ------------------------------------------------------------------ *
 * Forecast area (予報区) codes — one per prefecture-scale office.
 * Only our curated Japan destinations are mapped; anything else returns
 * null and the UI simply hides the JMA panel.
 * ------------------------------------------------------------------ */
export const JMA_OFFICES = Object.freeze({
  tokyo: '130000',           // 東京都 → 東京地方
  fujikawaguchiko: '190000', // 山梨県 (富士五湖 / 河口湖)
  nikko: '090000',           // 栃木県 (日光)
  yuzawa: '150000',          // 新潟県 (湯澤)
  hakuba: '200000'           // 長野県 (白馬)
});

const JMA_SPOTS = Object.freeze([
  Object.freeze({ id: 'tokyo', lat: 35.6762, lon: 139.6503, office: JMA_OFFICES.tokyo }),
  Object.freeze({ id: 'fujikawaguchiko', lat: 35.4970, lon: 138.7550, office: JMA_OFFICES.fujikawaguchiko }),
  Object.freeze({ id: 'nikko', lat: 36.7199, lon: 139.6982, office: JMA_OFFICES.nikko }),
  Object.freeze({ id: 'yuzawa', lat: 36.9360, lon: 138.8080, office: JMA_OFFICES.yuzawa }),
  Object.freeze({ id: 'hakuba', lat: 36.6983, lon: 137.8610, office: JMA_OFFICES.hakuba })
]);

function distanceKm(a, b) {
  const dLat = (Number(a.lat) - Number(b.lat)) * Math.PI / 180;
  const dLon = (Number(a.lon) - Number(b.lon)) * Math.PI / 180;
  const lat = ((Number(a.lat) + Number(b.lat)) / 2) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat) ** 2 * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** JMA office code for a spot, or null when we don't cover it (Japan only). */
export function jmaOfficeForSpot(spot = {}) {
  const id = String(spot?.id || '').toLowerCase();
  if (JMA_OFFICES[id]) return JMA_OFFICES[id];
  const lat = Number(spot?.lat), lon = Number(spot?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  let best = null, bestKm = Infinity;
  for (const s of JMA_SPOTS) {
    const km = distanceKm({ lat, lon }, s);
    if (km < bestKm) { bestKm = km; best = s; }
  }
  return bestKm <= 60 ? best.office : null;   // same prefecture-ish, else give up
}

/* ------------------------------------------------------------------ *
 * weatherCodes → bilingual label + icon + tone (+ closest WMO code)
 * JMA codes: 1xx clear, 2xx cloudy, 3xx rain, 4xx snow.
 * ------------------------------------------------------------------ */
const JMA_BASE = Object.freeze({
  1: { th: 'ฟ้าใส', en: 'Sunny', icon: 'sun', tone: 'sun', wmo: 0 },
  2: { th: 'ครึ้มฟ้า', en: 'Cloudy', icon: 'cloud', tone: 'cloud', wmo: 3 },
  3: { th: 'มีฝน', en: 'Rain', icon: 'cloud-rain', tone: 'rain', wmo: 61 },
  4: { th: 'มีหิมะ', en: 'Snow', icon: 'cloud-snow', tone: 'snow', wmo: 71 }
});
const JMA_COMMON = Object.freeze({
  100: { th: 'ฟ้าใส', en: 'Sunny' },
  101: { th: 'ฟ้าใส สลับครึ้มฟ้าเป็นบางช่วง', en: 'Sunny, at times cloudy' },
  102: { th: 'ฟ้าใส มีฝนบางช่วงสั้น ๆ', en: 'Sunny, brief rain' },
  103: { th: 'ฟ้าใส มีหิมะบางช่วงสั้น ๆ', en: 'Sunny, brief snow' },
  110: { th: 'ฟ้าใส แล้วครึ้มฟ้า', en: 'Sunny then cloudy' },
  112: { th: 'ฟ้าใส แล้วมีฝน', en: 'Sunny then rain' },
  113: { th: 'ฟ้าใส แล้วมีหิมะ', en: 'Sunny then snow' },
  200: { th: 'ครึ้มฟ้า', en: 'Overcast' },
  201: { th: 'ครึ้มฟ้า สลับฟ้าใสเป็นบางช่วง', en: 'Cloudy, at times sunny' },
  202: { th: 'ครึ้มฟ้า มีฝนเป็นบางช่วง', en: 'Cloudy, at times rain' },
  203: { th: 'ครึ้มฟ้า มีหิมะเป็นบางช่วง', en: 'Cloudy, at times snow' },
  210: { th: 'ครึ้มฟ้า แล้วฟ้าใส', en: 'Cloudy then sunny' },
  212: { th: 'ครึ้มฟ้า แล้วมีฝน', en: 'Cloudy then rain' },
  213: { th: 'ครึ้มฟ้า แล้วมีหิมะ', en: 'Cloudy then snow' },
  214: { th: 'ครึ้มฟ้า มีฝนฟ้าคะนองบางแห่ง', en: 'Cloudy, at times thundery rain' },
  300: { th: 'ฝนตก', en: 'Rain' },
  301: { th: 'ฝนตก สลับครึ้มฟ้าเป็นบางช่วง', en: 'Rain, at times cloudy' },
  303: { th: 'ฝนตก สลับหิมะเป็นบางช่วง', en: 'Rain, at times snow' },
  310: { th: 'ฝนตก แล้วฟ้าใส', en: 'Rain then sunny' },
  311: { th: 'ฝนตก แล้วครึ้มฟ้า', en: 'Rain then cloudy' },
  313: { th: 'ฝนตก แล้วครึ้มฟ้าช่วงบ่าย', en: 'Rain, cloudy from the afternoon' },
  400: { th: 'หิมะตก', en: 'Snow' },
  401: { th: 'หิมะตก สลับครึ้มฟ้าเป็นบางช่วง', en: 'Snow, at times cloudy' },
  402: { th: 'หิมะตก สลับฝนเป็นบางช่วง', en: 'Snow, at times rain' },
  410: { th: 'หิมะตก แล้วฟ้าใส', en: 'Snow then sunny' }
});
const STORM_CODES = new Set([214, 216, 224, 227, 232, 304, 306, 309, 314, 316, 317, 324, 326, 329, 406, 408, 409, 416, 418, 426, 429]);

export function jmaWeatherInfo(code) {
  const n = Number(code);
  const first = Number.isFinite(n) ? Math.floor(n / 100) : 0;
  const base = JMA_BASE[first] || { th: 'ไม่ทราบสภาพอากาศ', en: 'Unknown', icon: 'cloud', tone: 'cloud', wmo: 3 };
  const common = JMA_COMMON[n];
  const storm = STORM_CODES.has(n);
  return {
    th: common?.th || base.th,
    en: common?.en || base.en,
    icon: storm ? 'cloud-lightning' : base.icon,
    tone: storm ? 'storm' : base.tone,
    wmo: storm ? 95 : base.wmo,
    code: n
  };
}

/* ------------------------------------------------------------------ *
 * Parse the two-JSON payload into a flat, UI-friendly shape.
 * ------------------------------------------------------------------ */
const numOrNull = (v) => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function parseJmaForecast(json) {
  if (!Array.isArray(json) || json.length < 2) return null;
  const near = json[0], week = json[1];
  if (!week?.timeSeries) return null;
  // The 7-day block: weather codes/pops/reliabilities + min/max temps.
  const weekTime = week.timeSeries.find(s => Array.isArray(s?.timeDefines) && s.areas?.[0]?.weatherCodes);
  const weekTemp = week.timeSeries.find(s => Array.isArray(s?.timeDefines) && s.areas?.[0] && Array.isArray(s.areas[0].tempsMin));
  if (!weekTime) return null;
  const codeArea = weekTime.areas[0];
  const tempArea = weekTemp?.areas?.[0];
  const days = (weekTime.timeDefines || []).slice(0, 7).map((iso, i) => {
    const code = Number(codeArea.weatherCodes?.[i]);
    const info = jmaWeatherInfo(code);
    const pop = numOrNull(codeArea.pops?.[i]);
    const reli = String(codeArea.reliabilities?.[i] || '').toUpperCase();
    return {
      date: String(iso).slice(0, 10),
      code: Number.isFinite(code) ? code : null,
      icon: info.icon,
      tone: info.tone,
      labelTh: info.th,
      labelEn: info.en,
      min: numOrNull(tempArea?.tempsMin?.[i]),
      max: numOrNull(tempArea?.tempsMax?.[i]),
      minUpper: numOrNull(tempArea?.tempsMinUpper?.[i]),
      minLower: numOrNull(tempArea?.tempsMinLower?.[i]),
      maxUpper: numOrNull(tempArea?.tempsMaxUpper?.[i]),
      maxLower: numOrNull(tempArea?.tempsMaxLower?.[i]),
      pop,
      reliability: reli === 'A' || reli === 'B' || reli === 'C' ? reli : null
    };
  });
  // The 3-day block: JMA's own Japanese text (used as a fallback/overflow line).
  const nearCodes = Array.isArray(near?.timeSeries) ? near.timeSeries[0] : null;
  const nearText = (nearCodes?.areas?.[0]?.weathers || []).map(w => String(w).trim()).filter(Boolean);
  return {
    office: near?.publishingOffice || '気象庁',
    reportDatetime: week?.reportDatetime || near?.reportDatetime || '',
    areaName: String(codeArea.area?.name || ''),
    days,
    nearText
  };
}

/* ------------------------------------------------------------------ *
 * Fetching (browser only). 1-hour memory + localStorage cache:
 * JMA publishes 05:00 / 11:00 / 17:00 JST, so sub-hour refetching is waste.
 * ------------------------------------------------------------------ */
const JMA_URL = (office) => `https://www.jma.go.jp/bosai/forecast/data/forecast/${office}.json`;
export const JMA_CACHE_PREFIX = 'fuji_jma_';
const JMA_TTL_MS = 60 * 60 * 1000;
const memoryCache = new Map();

function storageGet(key) {
  try {
    const raw = localStorage.getItem(JMA_CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.at || Date.now() - parsed.at > JMA_TTL_MS) return null;
    return parsed.data;
  } catch { return null; }
}
function storageSet(key, data) {
  try { localStorage.setItem(JMA_CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), data })); } catch { /* quota */ }
}

/** 7-day official forecast for one forecast office, or null on any failure. */
export async function fetchJmaForecast(office, { timeoutMs = 8000 } = {}) {
  if (!office) return null;
  const cachedMem = memoryCache.get(office);
  if (cachedMem && Date.now() - cachedMem.at < JMA_TTL_MS) return cachedMem.data;
  const cachedStore = storageGet(office);
  if (cachedStore) { memoryCache.set(office, { at: Date.now(), data: cachedStore }); return cachedStore; }
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  let json = null;
  try {
    const res = await fetch(JMA_URL(office), controller ? { signal: controller.signal } : undefined);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    json = await res.json();
  } catch (error) {
    console.warn('jma forecast unavailable', error?.message || error);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
  const parsed = parseJmaForecast(json);
  if (parsed?.days?.length) {
    memoryCache.set(office, { at: Date.now(), data: parsed });
    storageSet(office, parsed);
  }
  return parsed;
}
