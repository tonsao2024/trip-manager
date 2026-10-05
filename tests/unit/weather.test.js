// Unit tests — weather helpers (WMO mapping, parsing, trip-window logic).
import {
  WMO_CODES, weatherCodeInfo, parseForecast, forecastForDates, forecastLabel,
  weatherTip, datesBetween, isForecastRelevant, weatherTone
} from '../../src/js/utils/weather.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

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
