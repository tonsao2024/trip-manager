// Weather forecast for the trip days — Open-Meteo (no API key, CORS friendly).
//
// The dashboard shows a compact strip for the trip window and each itinerary day
// header can show its own chip. Everything degrades silently: if the network or
// the geocoder is unavailable the widgets simply stay hidden.
//
// Pure helpers (WMO code mapping, summary, cache keys) are exported for tests.

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours
const CACHE_PREFIX = 'fuji_weather_';

/* ------------------------------------------------------------------ *
 * WMO weather codes → bilingual label + lucide icon + tone
 * ------------------------------------------------------------------ */
export const WMO_CODES = {
  0:  { th: 'ฟ้าใส', en: 'Clear', icon: 'sun', tone: 'sun' },
  1:  { th: 'แดดจัดเป็นส่วนใหญ่', en: 'Mostly clear', icon: 'sun', tone: 'sun' },
  2:  { th: 'มีเมฆบางส่วน', en: 'Partly cloudy', icon: 'cloud-sun', tone: 'cloud' },
  3:  { th: 'เมฆมาก', en: 'Overcast', icon: 'cloud', tone: 'cloud' },
  45: { th: 'หมอก', en: 'Fog', icon: 'cloud-fog', tone: 'cloud' },
  48: { th: 'หมอกน้ำแข็ง', en: 'Freezing fog', icon: 'cloud-fog', tone: 'cloud' },
  51: { th: 'ฝนปรอย', en: 'Light drizzle', icon: 'cloud-drizzle', tone: 'rain' },
  53: { th: 'ฝนปรอย', en: 'Drizzle', icon: 'cloud-drizzle', tone: 'rain' },
  55: { th: 'ฝนปรอยหนัก', en: 'Heavy drizzle', icon: 'cloud-drizzle', tone: 'rain' },
  56: { th: 'ฝนเยือกแข็ง', en: 'Freezing drizzle', icon: 'cloud-hail', tone: 'rain' },
  57: { th: 'ฝนเยือกแข็งหนัก', en: 'Freezing drizzle', icon: 'cloud-hail', tone: 'rain' },
  61: { th: 'ฝนเล็กน้อย', en: 'Light rain', icon: 'cloud-rain', tone: 'rain' },
  63: { th: 'ฝนปานกลาง', en: 'Rain', icon: 'cloud-rain', tone: 'rain' },
  65: { th: 'ฝนหนัก', en: 'Heavy rain', icon: 'cloud-rain-wind', tone: 'rain' },
  66: { th: 'ฝนเยือกแข็ง', en: 'Freezing rain', icon: 'cloud-hail', tone: 'rain' },
  67: { th: 'ฝนเยือกแข็งหนัก', en: 'Freezing rain', icon: 'cloud-hail', tone: 'rain' },
  71: { th: 'หิมะเล็กน้อย', en: 'Light snow', icon: 'cloud-snow', tone: 'snow' },
  73: { th: 'หิมะ', en: 'Snow', icon: 'cloud-snow', tone: 'snow' },
  75: { th: 'หิมะหนัก', en: 'Heavy snow', icon: 'snowflake', tone: 'snow' },
  77: { th: 'เม็ดหิมะ', en: 'Snow grains', icon: 'snowflake', tone: 'snow' },
  80: { th: 'ฝนซู่', en: 'Rain showers', icon: 'cloud-rain', tone: 'rain' },
  81: { th: 'ฝนซู่ปานกลาง', en: 'Rain showers', icon: 'cloud-rain', tone: 'rain' },
  82: { th: 'ฝนซู่หนัก', en: 'Violent showers', icon: 'cloud-rain-wind', tone: 'rain' },
  85: { th: 'หิมะซู่', en: 'Snow showers', icon: 'cloud-snow', tone: 'snow' },
  86: { th: 'หิมะซู่หนัก', en: 'Snow showers', icon: 'cloud-snow', tone: 'snow' },
  95: { th: 'พายุฝนฟ้าคะนอง', en: 'Thunderstorm', icon: 'cloud-lightning', tone: 'storm' },
  96: { th: 'พายุฝนกับลูกเห็บ', en: 'Thunderstorm + hail', icon: 'cloud-lightning', tone: 'storm' },
  99: { th: 'พายุฝนกับลูกเห็บหนัก', en: 'Severe storm', icon: 'cloud-lightning', tone: 'storm' }
};

export function weatherCodeInfo(code) {
  return WMO_CODES[code] || { th: 'ไม่ทราบสภาพอากาศ', en: 'Unknown', icon: 'cloud', tone: 'cloud' };
}

/** Tone → the colour tokens used by the weather chips. */
export const WEATHER_TONES = {
  sun:   { bg: 'var(--brand-yellow-tint)', fg: 'var(--brand-yellow-ink)', line: 'var(--brand-yellow-line)' },
  cloud: { bg: 'var(--bg-secondary)', fg: 'var(--text-secondary)', line: 'var(--border)' },
  rain:  { bg: 'var(--info-bg, var(--primary-lighter))', fg: 'var(--info)', line: 'color-mix(in srgb, var(--info) 30%, transparent)' },
  snow:  { bg: 'var(--primary-lighter)', fg: 'var(--primary-strong)', line: 'color-mix(in srgb, var(--primary) 30%, transparent)' },
  storm: { bg: 'var(--warning-bg)', fg: 'var(--warning)', line: 'color-mix(in srgb, var(--warning) 35%, transparent)' }
};

export function weatherTone(tone = 'cloud') {
  return WEATHER_TONES[tone] || WEATHER_TONES.cloud;
}

/* ------------------------------------------------------------------ *
 * Parsing + summarising
 * ------------------------------------------------------------------ */
/**
 * Open-Meteo daily payload → [{ date, code, icon, tone, labelTh, labelEn, min, max, rainMm, rainChance }]
 */
export function parseForecast(json = {}) {
  const daily = json?.daily;
  if (!daily || !Array.isArray(daily.time)) return [];
  return daily.time.map((date, i) => {
    const code = Number(daily.weather_code?.[i] ?? daily.weathercode?.[i] ?? 0);
    const info = weatherCodeInfo(code);
    const rainChance = daily.precipitation_probability_max?.[i];
    return {
      date,
      code,
      icon: info.icon,
      tone: info.tone,
      labelTh: info.th,
      labelEn: info.en,
      min: daily.temperature_2m_min?.[i] ?? null,
      max: daily.temperature_2m_max?.[i] ?? null,
      rainMm: daily.precipitation_sum?.[i] ?? null,
      rainChance: Number.isFinite(rainChance) ? rainChance : null
    };
  });
}

/** Keep only the days inside the trip window and fill missing days with null. */
export function forecastForDates(forecast = [], dates = []) {
  const byDate = new Map(forecast.map(f => [f.date, f]));
  return dates.map(date => byDate.get(date) || { date, missing: true });
}

export function forecastLabel(day, lang = 'th') {
  if (!day || day.missing) return lang === 'th' ? 'ยังไม่มีข้อมูล' : 'No data yet';
  return lang === 'th' ? day.labelTh : day.labelEn;
}

/** Should we suggest an umbrella / a jacket? Used for the small hint line. */
export function weatherTip(days = [], lang = 'th') {
  const real = days.filter(d => d && !d.missing);
  if (!real.length) return '';
  const rainy = real.filter(d => d.code >= 51 && d.code <= 99 || d.tone === 'rain' || d.tone === 'storm');
  const cold = real.filter(d => typeof d.min === 'number' && d.min <= 10);
  const hot = real.filter(d => typeof d.max === 'number' && d.max >= 33);
  const tips = [];
  if (rainy.length) tips.push(lang === 'th' ? `มีฝน ${rainy.length} วัน — พกร่ม/เสื้อกันฝน` : `Rain on ${rainy.length} day(s) — pack an umbrella`);
  if (cold.length) tips.push(lang === 'th' ? `หนาวสุด ${Math.min(...cold.map(d => d.min))}°C — เตรียมเสื้อกันหนาว` : `As low as ${Math.min(...cold.map(d => d.min))}°C — bring a jacket`);
  if (hot.length && !cold.length) tips.push(lang === 'th' ? `ร้อนถึง ${Math.max(...hot.map(d => d.max))}°C — เตรียมน้ำ/ครีมกันแดด` : `Up to ${Math.max(...hot.map(d => d.max))}°C — water & sunscreen`);
  return tips.join(' • ');
}

/** Trip days as YYYY-MM-DD, capped (forecast is only useful ~16 days out). */
export function datesBetween(startDate, endDate, max = 16) {
  if (!startDate || !endDate) return [];
  const out = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  for (let d = start, i = 0; d <= end && i < max; d = new Date(d.getTime() + 86400000), i++) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Only fetch when some part of the trip is inside the forecast horizon. */
export function isForecastRelevant(startDate, todayStr, horizonDays = 14) {
  if (!startDate) return false;
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const today = new Date(`${todayStr}T00:00:00Z`).getTime();
  if (Number.isNaN(start) || Number.isNaN(today)) return false;
  const diffDays = (start - today) / 86400000;
  return diffDays <= horizonDays;
}

/* ------------------------------------------------------------------ *
 * Fetching (browser only — used by the views, not by the unit tests)
 * ------------------------------------------------------------------ */
function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.at || Date.now() - parsed.at > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch { return null; }
}

function cacheSet(key, data) {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ at: Date.now(), data })); } catch { /* quota */ }
}

async function fetchJson(url, timeoutMs = 8000) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const res = await fetch(url, controller ? { signal: controller.signal } : undefined);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** City name → { lat, lon, name, country } (cached per query). */
export async function geocodeCity(query) {
  const q = String(query || '').trim();
  if (!q) return null;
  const key = `geo_${q.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const json = await fetchJson(`${GEOCODE_URL}?name=${encodeURIComponent(q)}&count=1&language=th&format=json`);
  const hit = json?.results?.[0];
  if (!hit) return null;
  const out = { lat: hit.latitude, lon: hit.longitude, name: hit.name, country: hit.country || '', admin: hit.admin1 || '' };
  cacheSet(key, out);
  return out;
}

/**
 * Daily forecast for a place. `place` = { lat, lon } or a city name string.
 * Returns [] instead of throwing — weather is a nice-to-have, never a blocker.
 */
export async function fetchDailyForecast(place, { startDate, endDate } = {}) {
  try {
    let coords = place;
    if (typeof place === 'string' || !place?.lat) coords = await geocodeCity(typeof place === 'string' ? place : place?.city);
    if (!coords?.lat) return [];
    const key = `${Number(coords.lat).toFixed(2)}_${Number(coords.lon).toFixed(2)}_${startDate}_${endDate}`;
    const cached = cacheGet(key);
    if (cached) return cached;
    const url = `${FORECAST_URL}?latitude=${coords.lat}&longitude=${coords.lon}`
      + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max'
      + `&timezone=auto&start_date=${startDate}&end_date=${endDate}`;
    const json = await fetchJson(url);
    const parsed = parseForecast(json);
    if (parsed.length) cacheSet(key, parsed);
    return parsed;
  } catch (e) {
    console.warn('weather fetch failed', e?.message || e);
    return [];
  }
}

export function clearWeatherCache() {
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(CACHE_PREFIX))
      .forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}
