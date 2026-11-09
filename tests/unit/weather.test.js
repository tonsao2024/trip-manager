// Unit tests — weather helpers (WMO mapping, parsing, trip-window logic).
import {
  WMO_CODES, WEATHER_DESTINATIONS, weatherCodeInfo, parseForecast, fetchForecastWindow, forecastForDates, forecastLabel,
  weatherTip, datesBetween, isForecastRelevant, weatherTone, createLatestRequestGuard
} from '../../src/js/utils/weather.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

export function testWeatherDestinations() {
  assert(WEATHER_DESTINATIONS.map(place => place.label).join(',') === 'TOKYO,FUJIKAWAGUCHIKO,NIKKO,YUZAWA,HAKUBA', 'the default Japan destination list has the requested five cities in order');
  assert(WEATHER_DESTINATIONS.every(place => Number.isFinite(place.lat) && Number.isFinite(place.lon)), 'every curated destination has coordinates');
}

export async function testExtendedForecastWindow() {
  const originalFetch = globalThis.fetch;
  const today = new Date();
  const day0 = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const key = day0.toISOString().slice(0, 10);
  const day30Date = new Date(day0); day30Date.setUTCDate(day30Date.getUTCDate() + 30);
  const day30 = day30Date.toISOString().slice(0, 10);
  const urls = [];
  const payload = (time, weather_code, max, min, precipitation_sum) => ({ daily: { time, weather_code, temperature_2m_max: max, temperature_2m_min: min, precipitation_sum } });
  globalThis.fetch = async (url) => {
    const requestUrl = String(url);
    urls.push(requestUrl);
    const data = requestUrl.includes('seasonal-api.open-meteo.com')
      ? payload([key, day30], [61, 3], [16, 10], [8, 2], [4, 0])
      : payload([key], [0], [18], [9], [0]);
    return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const days = await fetchForecastWindow({ lat: 35.6762, lon: 139.6503 });
    const near = days.find(day => day.date === key);
    const extended = days.find(day => day.date === day30);
    assert(near?.forecastBand === 'short' && near.code === 0, 'near-term forecast overrides the seasonal estimate');
    assert(extended?.forecastBand === 'seasonal' && extended.code === 3, 'ECMWF seasonal daily forecast fills dates beyond the 16-day forecast');
    assert(urls.some(url => url.includes('seasonal-api.open-meteo.com') && url.includes('ecmwf_seasonal_ensemble_mean_seamless')), 'long range uses the ECMWF seasonal ensemble endpoint');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

export function testCodeMapping() {
  assert(weatherCodeInfo(0).icon === 'sun', 'clear sky → sun');
  assert(weatherCodeInfo(63).tone === 'rain', 'rain code → rain tone');
  assert(weatherCodeInfo(75).tone === 'snow', 'snow code → snow tone');
  assert(weatherCodeInfo(95).tone === 'storm', 'thunder → storm tone');
  const unknown = weatherCodeInfo(4242);
  assert(unknown.icon === 'cloud', 'unknown codes fall back to cloud');
  assert(Object.keys(WMO_CODES).length > 20, 'a full WMO table is shipped');
  for (const info of Object.values(WMO_CODES)) {
    assert(info.th && info.en && info.icon, 'every code carries th/en/icon');
  }
}

export function testParseForecast() {
  const parsed = parseForecast({
    daily: {
      time: ['2026-03-28', '2026-03-29'],
      weather_code: [0, 61],
      temperature_2m_max: [18, 14],
      temperature_2m_min: [6, 9],
      precipitation_sum: [0, 4.2],
      precipitation_probability_max: [5, 80]
    }
  });
  assert(parsed.length === 2, 'two days parsed');
  assert(parsed[0].max === 18 && parsed[0].min === 6, 'temperatures read');
  assert(parsed[1].code === 61 && parsed[1].tone === 'rain', 'rain day detected');
  assert(parsed[1].rainChance === 80, 'rain probability kept');
  assert(parseForecast({}).length === 0, 'missing payload → empty list');
}

export function testTripWindow() {
  const dates = datesBetween('2026-03-28', '2026-03-31');
  assert(dates.join(',') === '2026-03-28,2026-03-29,2026-03-30,2026-03-31', 'inclusive day list');
  assert(datesBetween('2026-03-31', '2026-03-28').length === 0, 'reversed range → empty');
  assert(datesBetween('', '').length === 0, 'empty input → empty');
  assert(isForecastRelevant('2026-03-29', '2026-03-28') === true, 'tomorrow is inside the horizon');
  assert(isForecastRelevant('2026-06-01', '2026-03-28') === false, 'far future is out of range');
}

export function testForecastForDates() {
  const forecast = [{ date: '2026-03-29', code: 61 }];
  const out = forecastForDates(forecast, ['2026-03-28', '2026-03-29']);
  assert(out.length === 2, 'one row per requested date');
  assert(out[0].missing === true, 'days without data are marked missing');
  assert(out[1].code === 61, 'matching day kept');
}

export function testTipsAndTones() {
  const rainy = [{ code: 61, tone: 'rain', min: 12, max: 18 }, { code: 3, tone: 'cloud', min: 10, max: 17 }];
  assert(/ฝน|rain/i.test(weatherTip(rainy, 'th')), 'rain tip shown');
  const cold = [{ code: 3, tone: 'cloud', min: 2, max: 8 }];
  assert(/หนาว|jacket|°C/i.test(weatherTip(cold, 'en')), 'cold tip shown');
  assert(weatherTip([{ missing: true }], 'th') === '', 'no data → no tip');
  assert(forecastLabel({ missing: true }, 'th').length > 0, 'missing label exists');
  assert(weatherTone('unknown').bg === weatherTone('cloud').bg, 'unknown tone falls back to cloud');
}

export function testWeather() {
  testCodeMapping();
  testParseForecast();
  testTripWindow();
  testForecastForDates();
  testTipsAndTones();
  console.log('All weather tests passed');
}

export function testWeatherLatestRequestWins() {
  const guard = createLatestRequestGuard();
  const oldCity = guard.begin();
  const currentCity = guard.begin();
  assert(!oldCity() && currentCity(), 'only the most recent city request can paint');
  guard.invalidate();
  assert(!currentCity(), 'invalidated requests cannot paint');
}
