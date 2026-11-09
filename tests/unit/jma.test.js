// Unit tests — 気象庁 (JMA) official forecast helpers.
import {
  JMA_OFFICES, jmaOfficeForSpot, jmaWeatherInfo, parseJmaForecast, fetchJmaForecast
} from '../../src/js/utils/jma.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

const weekDays = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'];
const timeDefines = weekDays.map(d => `${d}T00:00:00+09:00`);
const fixture = [
  {
    publishingOffice: '気象庁',
    reportDatetime: '2026-11-09T17:00:00+09:00',
    timeSeries: [
      {
        timeDefines: weekDays.slice(0, 3).map(d => `${d}T00:00:00+09:00`),
        areas: [{ area: { name: '東京地方' }, weatherCodes: ['101', '202', '300'], weathers: ['はれ　時々　くもり', 'くもり', 'あめ'], pops: ['10', '30', '60'] }]
      }
    ]
  },
  {
    reportDatetime: '2026-11-09T17:00:00+09:00',
    tempAverage: { areas: [{ area: { name: '東京地方' }, temps: ['21.8'] }] },
    precipAverage: { areas: [{ area: { name: '東京地方' }, pops: ['40'] }] },
    timeSeries: [
      {
        timeDefines,
        areas: [{ area: { name: '東京地方' }, weatherCodes: ['100', '201', '300', '400', '101', '110', '202'], pops: ['10', '30', '70', '40', '', '20', '50'], reliabilities: ['A', 'A', 'B', 'C', 'C', 'B', 'B'] }]
      },
      {
        timeDefines,
        areas: [{
          area: { name: '東京地方' },
          tempsMin: ['12', '11', '', '8', '', '10', '13'],
          tempsMax: ['19', '17', '15', '12', '', '16', '18'],
          tempsMinUpper: ['', '', '', '', '', '9', '11'],
          tempsMinLower: ['', '', '', '', '', '12', '14'],
          tempsMaxUpper: ['', '', '', '', '', '18', '20'],
          tempsMaxLower: ['', '', '', '', '', '15', '17']
        }]
      }
    ]
  }
];

export function testJmaOfficeMapping() {
  assert(JMA_OFFICES.tokyo === '130000', 'Tokyo office code');
  assert(jmaOfficeForSpot({ id: 'tokyo' }) === '130000', 'curated id → office code');
  assert(jmaOfficeForSpot({ id: 'hakuba' }) === '200000', 'hakuba → Nagano office');
  assert(jmaOfficeForSpot({ id: '', lat: 36.72, lon: 139.70 }) === '090000', 'nearby Nikko coordinates → Tochigi office');
  assert(jmaOfficeForSpot({ id: '', lat: 13.7563, lon: 100.5018 }) === null, 'Bangkok → not covered (panel hidden)');
  assert(jmaOfficeForSpot({}) === null, 'missing coordinates → not covered');
}

export function testJmaWeatherInfo() {
  const sunny = jmaWeatherInfo(100);
  assert(sunny.icon === 'sun' && sunny.tone === 'sun' && sunny.wmo === 0, '100 → sunny');
  assert(sunny.th && sunny.en, 'labels present');
  const cloudy = jmaWeatherInfo(202);
  assert(cloudy.icon === 'cloud' && cloudy.tone === 'cloud' && cloudy.wmo === 3, '2xx → cloudy');
  const storm = jmaWeatherInfo(214);
  assert(storm.icon === 'cloud-lightning' && storm.tone === 'storm' && storm.wmo === 95, 'thunderstorm codes escalate to storm');
  const snow = jmaWeatherInfo(414);
  assert(snow.icon === 'cloud-snow' && snow.tone === 'snow', '4xx → snow even when the exact code is unknown');
  const unknown = jmaWeatherInfo(999);
  assert(unknown.tone === 'cloud' && unknown.en === 'Unknown', '9xx fallback → unknown/cloud');
}

export function testJmaParse() {
  const parsed = parseJmaForecast(fixture);
  assert(parsed, 'payload parses');
  assert(parsed.days.length === 7, 'seven days parsed');
  assert(parsed.days[0].date === '2026-11-09' && parsed.days[0].code === 100, 'first day = sunny 100');
  assert(parsed.days[0].min === 12 && parsed.days[0].max === 19, 'temps read as numbers');
  assert(parsed.days[1].pop === 30, 'precipitation probability read');
  assert(parsed.days[4].pop === null, 'empty pop → null');
  assert(parsed.days[2].min === null && parsed.days[2].max === 15, 'missing min stays null, max kept');
  assert(parsed.days[4].min === null && parsed.days[4].max === null, 'empty min/max → null');
  assert(parsed.days[2].reliability === 'B' && parsed.days[3].reliability === 'C', 'reliability grades read');
  assert(parsed.areaName === '東京地方', 'forecast area name kept');
  assert(parsed.office === '気象庁', 'publishing office kept');
  assert(parsed.reportDatetime === '2026-11-09T17:00:00+09:00', 'report timestamp kept');
  assert(parsed.days[0].icon === 'sun' && parsed.days[3].icon === 'cloud-snow', 'icons mapped from codes');
}

export function testJmaParseRejectsGarbage() {
  assert(parseJmaForecast({}) === null, 'non-array → null');
  assert(parseJmaForecast([{}]) === null, 'missing 7-day block → null');
  assert(parseJmaForecast([{}, { timeSeries: [] }]) === null, 'no weather time series → null');
}

export async function testFetchJmaForecastDegradesSilently() {
  const originalFetch = globalThis.fetch;
  const office = '190000';
  try { localStorage.removeItem(`fuji_jma_${office}`); } catch { /* shim */ }
  globalThis.fetch = async () => new Response('Service unavailable', { status: 503 });
  try {
    const out = await fetchJmaForecast(office);
    assert(out === null, 'HTTP failure → null so the UI hides the card');
  } finally { globalThis.fetch = originalFetch; }
  globalThis.fetch = async () => new Response(JSON.stringify(fixture), { status: 200, headers: { 'Content-Type': 'application/json' } });
  try {
    localStorage.removeItem(`fuji_jma_${office}`);
    const out = await fetchJmaForecast(office);
    assert(out?.days?.length === 7, 'HTTP success → parsed payload');
    assert(out.days[0].date === '2026-11-09', 'parsed days carry dates');
  } finally {
    globalThis.fetch = originalFetch;
    try { localStorage.removeItem(`fuji_jma_${office}`); } catch { /* shim */ }
  }
}
