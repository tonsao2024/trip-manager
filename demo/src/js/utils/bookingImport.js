// ─────────────────────────────────────────────────────────────────────────────
// Booking import — paste a confirmation e-mail and get a reservation draft.
//
// Wanderlog lets you *forward* a confirmation e-mail; the app then fills the
// booking in for you. A static app cannot read an inbox, so this module does the
// next best thing: it understands pasted confirmation text (as copied from
// Gmail, Agoda, Booking.com, an airline PDF, LINE, …) and extracts the fields
// the Bookings page needs — type, provider, confirmation code, dates, times,
// route, seat/room and the cost.
//
// Pure + offline: `parseConfirmationText()` never throws, always returns a draft
// with a `fields` object, a `confidence` score and a human list of what was
// recognised, so the UI can show a preview before saving.
// ─────────────────────────────────────────────────────────────────────────────

import { toMinor } from './currency.js';

/** Airline / OTA names we can recognise (lowercase). */
export const KNOWN_PROVIDERS = [
  'air asia', 'airasia', 'thai airways', 'thai smile', 'thai lion', 'thaiairways',
  'bangkok airways', 'nok air', 'nokair', 'vietjet', 'viet jet', 'scoot', 'jetstar',
  'cathay', 'china airlines', 'eva air', 'jal', 'japan airlines', 'ana', 'korean air',
  'asiana', 'singapore airlines', 'emirates', 'qatar airways', 'turkish airlines',
  'klm', 'air france', 'lufthansa', 'british airways', 'delta', 'united', 'american airlines',
  'tigerair', 'cebu pacific', 'philippine airlines', 'malaysia airlines', 'garuda',
  'agoda', 'booking.com', 'booking com', 'airbnb', 'hotels.com', 'expedia', 'trip.com',
  'trip com', 'klook', 'kkday', 'marriott', 'hilton', 'accor', 'ihg', 'hyatt', 'hostelworld',
  'jr', 'japan rail', 'renfe', 'sncf', 'trainline', 'thailand rail', 'ktx', 'shinkansen',
  'hertz', 'avis', 'budget', 'europcar', 'sixt', 'turo'
];

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
  may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9,
  september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
};

const TYPE_HINTS = [
  { type: 'flight', re: /(flight|airline|boarding|departure|arrival|airport|เที่ยวบิน|บิน|ที่นั่ง|gate|terminal|baggage)/i },
  { type: 'hotel', re: /(hotel|resort|check-?in|check-?out|room|guest|villa|hostel|ที่พัก|โรงแรม|ห้องพัก|เข้าพัก)/i },
  { type: 'train', re: /(train|rail|railway|shinkansen|รถไฟ|สถานี|platform|ขบวน)/i },
  { type: 'bus', re: /(bus|coach|van|รถบัส|รถตู้|ท่ารถ)/i },
  { type: 'ferry', re: /(ferry|boat|cruise|เรือ|เฟอร์รี่)/i },
  { type: 'car', re: /(car rental|rental car|pick-?up|drop-?off|รถเช่า|motorcycle|scooter)/i },
  { type: 'restaurant', re: /(restaurant|table for|reservation at|ร้านอาหาร|จองโต๊ะ)/i },
  { type: 'ticket', re: /(ticket|admission|entry|e-?ticket|ตั๋ว|บัตรเข้าชม)/i }
];

const CODE_LABELS = [
  'confirmation', 'confirmation number', 'booking', 'booking number', 'booking reference',
  'booking id', 'booking code', 'reference', 'reference number', 'reservation',
  'reservation number', 'reservation code', 'pnr', 'record locator', 'order',
  'order number', 'order id', 'e-ticket', 'eticket', 'ticket number', 'voucher',
  'itinerary', 'เลขที่การจอง', 'รหัสการจอง', 'หมายเลขการจอง', 'รหัสยืนยัน', 'รหัส'
];

const STOPWORDS = /^(and|the|for|with|from|to|of|at|in|on|a|an|is|are|be|your|you|we|our|this|that|it|as|by|tel|phone|email|www|com|http|https|no|number|total|price|amount|date|time|status)$/i;

/* ------------------------------------------------------------------ *
 * small utilities
 * ------------------------------------------------------------------ */

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

function pad(n) { return String(n).padStart(2, '0'); }

function iso(y, m, d) {
  const yy = Number(y) < 100 ? 2000 + Number(y) : Number(y);
  const mm = Number(m); const dd = Number(d);
  if (!(yy >= 1990 && yy <= 2100) || !(mm >= 1 && mm <= 12) || !(dd >= 1 && dd <= 31)) return '';
  return `${yy}-${pad(mm)}-${pad(dd)}`;
}

/** Find every date in a text and return them as ISO strings. */
export function extractDates(text = '') {
  const s = String(text || '');
  const out = [];
  const push = (v) => { if (v && !out.includes(v)) out.push(v); };
  // 2026-04-12 / 2026/04/12
  for (const m of s.matchAll(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/g)) push(iso(m[1], m[2], m[3]));
  // 12/04/2026, 12-04-26 (day first — the Thai/European convention)
  for (const m of s.matchAll(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/g)) {
    const a = Number(m[1]); const b = Number(m[2]);
    if (a <= 31 && b <= 12) push(iso(m[3], b, a));
  }
  // 12 Apr 2026 / 12 April 2026 / Apr 12, 2026
  for (const m of s.matchAll(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(20\d{2}|\d{2})\b/g)) {
    const mm = MONTHS[String(m[2]).toLowerCase()];
    if (mm) push(iso(m[3], mm, m[1]));
  }
  for (const m of s.matchAll(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(20\d{2}|\d{2})\b/g)) {
    const mm = MONTHS[String(m[1]).toLowerCase()];
    if (mm) push(iso(m[3], mm, m[2]));
  }
  // Thai buddhist year: 12 เม.ย. 2569
  for (const m of s.matchAll(/\b(\d{1,2})\s*([ก-๙.]+)\s*\.?\s*(\d{2,4})\b/g)) {
    const thMonths = { 'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4, 'พ.ค.': 5, 'มิ.ย.': 6, 'ก.ค.': 7, 'ส.ค.': 8, 'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12 };
    const mm = thMonths[String(m[2]).replace(/\s/g, '')];
    if (mm) {
      const y = Number(m[3]);
      push(iso(y > 2400 ? y - 543 : y, mm, m[1]));
    }
  }
  return out;
}

/** Every `HH:MM` / `H.MM` time found in the text (24-h first, then am/pm). */
export function extractTimes(text = '') {
  const s = String(text || '');
  const out = [];
  const covered = [];               // ranges already claimed by an am/pm match
  const push = (h, m) => {
    const hh = Number(h); const mm = Number(m || 0);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return;
    const v = `${pad(hh)}:${pad(mm)}`;
    if (!out.includes(v)) out.push(v);
  };
  // 12-hour clock first: “7:45 pm” must become 19:45, never 07:45.
  for (const m of s.matchAll(/\b(1[0-2]|0?[1-9])(?:[:.]([0-5]\d))?\s*(am|pm|a\.m\.|p\.m\.)\b/gi)) {
    let h = Number(m[1]) % 12;
    if (/p/i.test(m[3])) h += 12;
    covered.push([m.index, m.index + m[0].length]);
    push(h, m[2] || 0);
  }
  for (const m of s.matchAll(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g)) {
    if (covered.some(([a, b]) => m.index >= a && m.index < b)) continue;
    covered.push([m.index, m.index + m[0].length]);
    push(m[1], m[2]);
  }
  for (const m of s.matchAll(/\b([01]?\d|2[0-3])\s*น\./g)) {
    if (covered.some(([a, b]) => m.index >= a && m.index < b)) continue;
    push(m[1], 0);
  }
  return out;
}

/** Words that appear *inside* a label — never a confirmation code. */
const LABEL_WORDS = new Set([
  'confirmation', 'booking', 'reference', 'number', 'reservation', 'order', 'code',
  'id', 'pnr', 'record', 'locator', 'voucher', 'itinerary', 'ticket', 'eticket',
  'hotel', 'flight', 'status', 'guest', 'total', 'amount', 'date', 'time', 'name'
]);

function isLabelWord(token = '') {
  return LABEL_WORDS.has(String(token).toLowerCase().replace(/[\s.\-_]/g, ''));
}

/** Pull a code out of the text that follows a label on the same line. */
function codeFromSegment(segment = '') {
  const cleaned = String(segment).replace(/^[\s:：#*\-–—=]+/, '');
  if (!cleaned) return '';
  const token = cleaned.match(/\b[A-Z0-9][A-Z0-9-]{4,13}\b/i);
  if (token) {
    const raw = token[0];
    const bare = raw.replace(/-/g, '');
    const looksLikeYear = /^20\d{2}$/.test(bare);
    if (!looksLikeYear && !isLabelWord(bare) && /[A-Z0-9]/.test(bare)) {
      // a lowercase-only word is prose (“confirmation”), an upper/mixed token is a code
      if (!(raw === raw.toLowerCase() && !/d/.test(raw))) return bare.toUpperCase();
    }
  }
  // “4471 882 993” — a reference split into digit groups
  const digits = cleaned.match(/\d[\d ]{4,}/);
  if (digits) {
    const bare = digits[0].replace(/\s+/g, '');
    if (bare.length >= 5 && bare.length <= 14 && !isLabelWord(bare)) return bare;
  }
  return '';
}

/** Confirmation / PNR code — by label first, then a “looks like a code” pass. */
export function extractConfirmation(text = '') {
  const s = String(text || '');
  // longest label first, so “booking reference” beats “booking”
  const labels = [...CODE_LABELS].sort((a, b) => b.length - a.length);
  for (const line of s.split(/\r?\n/)) {
    const lower = line.toLowerCase();
    const label = labels.find(l => lower.includes(l));
    if (!label) continue;
    const code = codeFromSegment(line.slice(lower.indexOf(label) + label.length));
    if (code) return code;
  }
  // inline on a single line: “Confirmation: ABC123”
  const inline = s.match(/\b(?:confirmation|booking(?:\s*(?:number|reference|id|code))?|reference|pnr|record locator|e-?ticket|voucher|รหัส(?:การจอง|ยืนยัน)?)\b[ \t]*[:#=][ \t]*([A-Z0-9][A-Z0-9-]{4,13})\b/i);
  if (inline && !isLabelWord(inline[1])) return inline[1].replace(/-/g, '').toUpperCase();
  // last resort: a standalone 6-8 char token that mixes letters & digits
  const tokens = s.match(/\b[A-Z0-9]{6,8}\b/g) || [];
  const hit = tokens.find(t => /[A-Z]/.test(t) && /\d/.test(t) && !/^20\d{2}/.test(t) && !isLabelWord(t));
  return hit ? hit.toUpperCase() : '';
}

/** Flight number, e.g. TG 615 / SQ321 / FD 1201. */
export function extractFlightNumber(text = '') {
  const m = String(text || '').match(/\b([A-Z]{2}|[A-Z]\d|\d[A-Z])\s?-?\s?(\d{2,4})\b/);
  if (!m) return '';
  const skip = /^(no|tel|room|seat|gate|pm|am|us|uk|id|th|baht|thb)$/i;
  if (skip.test(m[1])) return '';
  return `${m[1].toUpperCase()}${m[2]}`;
}

/** IATA-ish airport codes (3 letters) from “BKK → NRT”, “From: BKK To: NRT”. */
export function extractAirports(text = '') {
  const s = String(text || '');
  const found = [];
  // Codes are ALWAYS upper-case in real confirmations: reject mixed-case
  // fragments such as the “kyo” inside ถึง: Tokyo.
  const add = (v) => {
    const raw = String(v ?? '');
    if (raw !== raw.toUpperCase()) return;
    if (!/^[A-Z]{3}$/.test(raw) || found.includes(raw)) return;
    found.push(raw);
  };
  for (const m of s.matchAll(/\b([A-Z]{3})\s*(?:→|->|–|—|-|to|TO|ถึง|ไปยัง)\s*([A-Z]{3})\b/g)) { add(m[1]); add(m[2]); }
  for (const m of s.matchAll(/(?:\bfrom\b|\bdepart(?:ure|ing)?(?:\s*airport)?\b|ต้นทาง|ออกจาก|จาก)\s*[:\-]?\s*([A-Za-z]{3})\b/gi)) add(m[1]);
  for (const m of s.matchAll(/(?:\bto\b|\barriv(?:al|ing)?(?:\s*airport)?\b|ปลายทาง|ถึง)\s*[:\-]?\s*([A-Za-z]{3})\b/gi)) add(m[1]);
  for (const m of s.matchAll(/\(([A-Z]{3})\)/g)) add(m[1]);
  return found;
}

/** Provider / airline / hotel brand. */
export function extractProvider(text = '') {
  const lower = String(text || '').toLowerCase();
  const hit = KNOWN_PROVIDERS.find(p => lower.includes(p));
  if (hit) {
    return hit.replace(/\b\w/g, c => c.toUpperCase()).replace(/Airasia/, 'AirAsia');
  }
  // “Thank you for choosing XXX” / “XXX booking confirmation”
  const m = String(text || '').match(/(?:thank you for (?:choosing|flying with|staying with)|your)\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,2})/);
  return m ? clean(m[1]) : '';
}

/** Money → { amountMinor, currency }. */
export function extractCost(text = '') {
  const s = String(text || '');
  // NB: currency symbols (¥ € £ ฿ …) are not word characters, so \b must not
  // wrap the whole alternation — otherwise “¥ 92,400” never matches.
  const currencyMap = [
    [/\bTHB\b|฿|\bbaht\b|บาท/i, 'THB'],
    [/\bJPY\b|¥|\byen\b|เยน/i, 'JPY'],
    [/\bUSD\b|\$|\busd\b/i, 'USD'],
    [/\bEUR\b|€/i, 'EUR'],
    [/\bGBP\b|£/i, 'GBP'],
    [/\bSGD\b|S\$/i, 'SGD'],
    [/\bKRW\b|₩/i, 'KRW'],
    [/\bHKD\b|HK\$/i, 'HKD'],
    [/\bTWD\b|NT\$/i, 'TWD'],
    [/\bVND\b|₫/i, 'VND'],
    [/\bCNY\b|\bRMB\b/i, 'CNY'],
    [/\bMYR\b|\bRM\b/i, 'MYR']
  ];
  const amountRe = /(?:(?:THB|JPY|USD|EUR|GBP|SGD|KRW|HKD|TWD|VND|CNY|MYR|฿|¥|\$|€|£|₩|₫)\s*)?([0-9][0-9,.]{0,12})(?:\s*(?:THB|JPY|USD|EUR|GBP|SGD|KRW|HKD|TWD|VND|CNY|MYR|บาท|เยน|yen|usd))?/i;
  const candidates = [];
  for (const line of s.split('\n')) {
    const lower = line.toLowerCase();
    if (!/(total|amount|price|charged|paid|grand total|ยอดรวม|ราคา|รวมทั้งสิ้น|สุทธิ)/.test(lower)) continue;
    const m = amountRe.exec(line);
    if (!m) continue;
    let currency = '';
    for (const [re, code] of currencyMap) { if (re.test(line)) { currency = code; break; } }
    const raw = String(m[1]).replace(/[,\s]/g, '');
    const value = Number(raw);
    if (Number.isFinite(value) && value > 0) candidates.push({ value, currency });
  }
  if (!candidates.length) return { amountMinor: 0, currency: '' };
  const best = candidates.sort((a, b) => b.value - a.value)[0];
  let currency = best.currency;
  if (!currency) {
    for (const [re, code] of currencyMap) { if (re.test(s)) { currency = code; break; } }
  }
  return { amountMinor: toMinor(best.value, 2), currency };
}

/** Departure/arrival city names (“Bangkok (BKK) → Tokyo (NRT)”). */
export function extractRoute(text = '') {
  const s = String(text || '');
  const NAME = "[A-Z][A-Za-z\\u0E00-\\u0E7F.'-]+(?:\\s+[A-Z][A-Za-z\\u0E00-\\u0E7F.'-]+){0,3}";
  const arrow = s.match(new RegExp(`(${NAME})\\s*(?:→|->|–|—)\\s*(${NAME})`));
  if (arrow) return { from: clean(arrow[1]), to: clean(arrow[2]) };
  const fromM = s.match(/(?:\bfrom\b|\bdepart(?:ure|ing)?(?:\s*from)?\b|ต้นทาง|ออกจาก|จาก)\s*[:\-]?\s*([A-Za-z\u0E00-\u0E7F][A-Za-z\u0E00-\u0E7F .'-]{2,28})/i);
  const toM = s.match(/(?:\bto\b|\barriv(?:al|ing)?(?:\s*at)?\b|ปลายทาง|ถึง)\s*[:\-]?\s*([A-Za-z\u0E00-\u0E7F][A-Za-z\u0E00-\u0E7F .'-]{2,28})/i);
  return { from: fromM ? clean(fromM[1]) : '', to: toM ? clean(toM[1]) : '' };
}

function guessTitle(text = '', { type = 'other', route = {}, provider = '' } = {}) {
  const firstMeaningful = String(text || '').split('\n')
    .map(l => clean(l))
    .find(l => l.length >= 4 && l.length <= 90 && !/^(hi|hello|dear|thank|สวัสดี|เรียน)/i.test(l) && !/^(from|to|date|time|tel|email)\b/i.test(l));
  if (provider && route.from && route.to) return `${provider}: ${route.from} → ${route.to}`;
  if (type === 'hotel' && provider) return `${provider} stay`;
  if (firstMeaningful) return firstMeaningful.slice(0, 80);
  const label = { flight: 'Flight', hotel: 'Hotel stay', train: 'Train ride', bus: 'Bus ride', ferry: 'Ferry ride', car: 'Car rental', restaurant: 'Restaurant booking', ticket: 'Ticket', other: 'Booking' }[type] || 'Booking';
  return label;
}

function guessType(text = '') {
  for (const hint of TYPE_HINTS) if (hint.re.test(text)) return hint.type;
  return 'other';
}

function guessHotelName(text = '') {
  const m = String(text || '').match(/(?:hotel|resort|villa|hostel|โรงแรม|ที่พัก)\s*[:\-]?\s*([A-Z][\w&.'’ -]{3,40})/);
  return m ? clean(m[1]) : '';
}

/**
 * Parse pasted confirmation text into a reservation draft.
 *
 * @param {string} text
 * @param {{baseCurrency?:string, fallbackDate?:string}} [opts]
 * @returns {{type:string, title:string, provider:string, confirmation:string,
 *   date:string, endDate:string, startTime:string, endTime:string, from:string,
 *   to:string, seat:string, room:string, flightNumber:string, costMinor:number,
 *   currency:string, notes:string, confidence:number, recognised:Array<{key:string,label:string,value:string}>}}
 */
export function parseConfirmationText(text = '', { baseCurrency = 'THB', fallbackDate = '' } = {}) {
  const raw = String(text || '').replace(/\r/g, '');
  const trimmed = raw.trim();
  const type = guessType(trimmed);
  const dates = extractDates(trimmed);
  const times = extractTimes(trimmed);
  const confirmation = extractConfirmation(trimmed);
  const flightNumber = type === 'flight' ? extractFlightNumber(trimmed) : '';
  const airports = type === 'flight' ? extractAirports(trimmed) : [];
  const route = extractRoute(trimmed);
  const provider = extractProvider(trimmed) || (type === 'hotel' ? guessHotelName(trimmed) : '');
  const cost = extractCost(trimmed);
  const seat = (trimmed.match(/(?:seat|ที่นั่ง)\s*[:\-]?\s*([0-9]{1,3}[A-Z]?)/i) || [, ''])[1];
  const room = (trimmed.match(/(?:room|ห้อง(?:พัก)?)\s*(?:type|no\.?|number)?\s*[:\-]?\s*([A-Za-z0-9 -]{1,24})/i) || [, ''])[1];

  const isStay = type === 'hotel' || /check-?\s?in|check-?\s?out|เข้าพัก|เช็คอิน/i.test(trimmed);
  const isFlight = type === 'flight';

  let notesCityLine = '';
  let from = route.from;
  let to = route.to;
  if (isFlight && airports.length >= 2) {
    // airport codes are unambiguous — the city names stay in the notes
    if (route.from && route.from.toUpperCase() !== airports[0]) notesCityLine = `${route.from} → ${route.to}`;
    from = airports[0];
    to = airports[1];
  } else if (isFlight && airports.length === 1) {
    from = route.from || airports[0];
  }

  const startTime = times[0] || '';
  const endTime = times[1] || '';
  const date = dates[0] || fallbackDate || '';
  const endDate = isStay ? (dates[1] || '') : (dates[1] || '');
  const currency = cost.currency || baseCurrency;

  const notes = [];
  if (flightNumber) notes.push(`✈ ${flightNumber}`);
  if (notesCityLine) notes.push(notesCityLine);
  if (airports.length) notes.push(airports.join(' · '));
  if (provider && !route.from) notes.push(provider);
  if (isStay && dates.length >= 2) {
    const nights = Math.max(0, Math.round((new Date(`${dates[1]}T00:00:00`) - new Date(`${dates[0]}T00:00:00`)) / 86400000));
    if (nights) notes.push(`${nights} ${nights === 1 ? 'night' : 'nights'}`);
  }
  notes.push('นำเข้าจากข้อความยืนยันการจอง (v17)');

  const recognised = [];
  const addRec = (key, label, value) => { if (value) recognised.push({ key, label, value: String(value) }); };
  if (trimmed) {
    addRec('type', 'ประเภท', type);
    addRec('title', 'ชื่อรายการ', guessTitle(trimmed, { type, route: { from, to }, provider }));
  }
  addRec('provider', 'ผู้ให้บริการ', provider);
  addRec('confirmation', 'รหัสยืนยัน', confirmation);
  addRec('flightNumber', 'เที่ยวบิน', flightNumber);
  addRec('date', 'วันที่', date);
  addRec('endDate', 'วันที่สิ้นสุด', endDate);
  addRec('startTime', 'เวลาเริ่ม', startTime);
  addRec('endTime', 'เวลาสิ้นสุด', endTime);
  addRec('from', 'จาก', from);
  addRec('to', 'ไป', to);
  addRec('seat', 'ที่นั่ง', seat);
  addRec('room', 'ห้อง', room);
  if (cost.amountMinor) addRec('cost', 'ค่าใช้จ่าย', `${cost.amountMinor / 100} ${currency}`);

  const weight = { type: 6, title: 8, provider: 10, confirmation: 22, date: 16, endDate: 6, startTime: 10, endTime: 4, from: 8, to: 8, seat: 4, room: 4, cost: 8, flightNumber: 6 };
  const total = Object.values(weight).reduce((a, b) => a + b, 0);
  const got = recognised.reduce((sum, r) => sum + (weight[r.key] || 0), 0);
  const confidence = trimmed ? Math.round((got / total) * 100) : 0;

  return {
    type,
    title: guessTitle(trimmed, { type, route: { from, to }, provider }),
    provider,
    confirmation,
    flightNumber,
    date,
    endDate,
    startTime,
    endTime,
    from,
    to,
    seat: clean(seat),
    room: clean(room),
    costMinor: cost.amountMinor,
    currency,
    notes: notes.join(' · '),
    confidence,
    recognised
  };
}

/** Turn the draft into a `createReservation()` payload. */
export function draftToReservation(draft = {}, { baseCurrency = 'THB' } = {}) {
  const date = draft.endDate && !draft.date ? draft.endDate : draft.date;
  return {
    type: draft.type || 'other',
    title: draft.title || 'Booking',
    provider: draft.provider || '',
    confirmation: draft.confirmation || '',
    date: date || '',
    startTime: draft.startTime || '',
    endTime: draft.endTime || '',
    from: draft.from || '',
    to: draft.to || '',
    seat: draft.seat || '',
    room: draft.room || '',
    address: '',
    phone: '',
    costMinor: Number(draft.costMinor) || 0,
    currency: draft.currency || baseCurrency,
    notes: draft.notes || ''
  };
}

/** Quality hint for the preview header. */
export function confidenceLabel(confidence = 0) {
  if (confidence >= 70) return { tone: 'success', th: 'อ่านข้อมูลได้ครบ', en: 'Looks complete' };
  if (confidence >= 40) return { tone: 'warning', th: 'อ่านได้บางส่วน — ตรวจก่อนบันทึก', en: 'Partial — check the fields' };
  return { tone: 'danger', th: 'อ่านได้น้อย — กรอกเองเพิ่ม', en: 'Few fields found — fill in the rest' };
}
