// Unit tests — booking-import parser (paste a confirmation e-mail).
import {
  parseConfirmationText, draftToReservation, extractDates, extractTimes,
  extractConfirmation, extractFlightNumber, extractAirports, extractCost,
  extractRoute, confidenceLabel, KNOWN_PROVIDERS
} from '../../src/js/utils/bookingImport.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

const FLIGHT_MAIL = `การยืนยันการจอง — Thai Airways
เที่ยวบิน TG 615
จาก: Bangkok (BKK) ถึง: Tokyo (NRT)
วันที่ 12 เม.ย. 2569 เวลา 07:45 - 15:20
ที่นั่ง 32A | Confirmation: XT4K9P
ผู้โดยสาร: SOMCHAI P.
ราคารวม 24,500 THB`;

const HOTEL_MAIL = `Booking.com — Confirmation
Hotel: Shibuya Excel Hotel Tokyu
Check-in: 2026-04-12 15:00
Check-out: 2026-04-15 11:00
Room: Deluxe Twin
Booking reference: 4471 882 993
Total amount: ¥ 92,400`;

const RANDOM_TEXT = 'สวัสดีครับ วันนี้กินข้าวกับเพื่อน แล้วไปเดินห้าง';

export function testDateParsing() {
  assert(extractDates('2026-04-12')[0] === '2026-04-12', 'ISO date');
  assert(extractDates('12/04/2026')[0] === '2026-04-12', 'day-first slash date');
  assert(extractDates('12 Apr 2026')[0] === '2026-04-12', '12 Apr 2026');
  assert(extractDates('Apr 12, 2026')[0] === '2026-04-12', 'Apr 12, 2026');
  assert(extractDates('12 เม.ย. 2569')[0] === '2026-04-12', 'Thai month + Buddhist year');
  const many = extractDates('12/04/2026 to 15/04/2026');
  assert(many.length === 2, 'two dates in a range');
  assert(extractDates('ไม่มีวันที่').length === 0, 'no dates → empty');
  assert(extractDates('32/13/2026').length === 0, 'impossible date rejected');
}

export function testTimeParsing() {
  assert(extractTimes('07:45 - 15:20').join(',') === '07:45,15:20', '24h range');
  assert(extractTimes('7:45 pm').join(',') === '19:45', 'pm conversion');
  assert(extractTimes('7.45 am').join(',') === '07:45', 'dots + am');
  assert(extractTimes('15.00น.').join(',') === '15:00', 'Thai น.');
  assert(extractTimes('no time here').length === 0, 'no times → empty');
}

export function testConfirmationCodes() {
  assert(extractConfirmation('Confirmation: XT4K9P') === 'XT4K9P', 'labelled code');
  assert(extractConfirmation('Booking reference: 4471882993') === '4471882993', 'numeric reference');
  assert(extractConfirmation('PNR ABC123') === 'ABC123', 'PNR');
  assert(extractConfirmation('รหัสการจอง: TH99KK') === 'TH99KK', 'Thai label');
  assert(extractConfirmation('nothing here') === '', 'no code → empty');
}

export function testFlightBits() {
  assert(extractFlightNumber('เที่ยวบิน TG 615') === 'TG615', 'TG 615');
  assert(extractFlightNumber('flight SQ321') === 'SQ321', 'SQ321');
  const air = extractAirports('จาก: Bangkok (BKK) ถึง: Tokyo (NRT)');
  assert(air[0] === 'BKK' && air[1] === 'NRT', 'BKK → NRT');
  const arrows = extractAirports('KIX → HND');
  assert(arrows.join(',') === 'KIX,HND', 'arrow form');
  const route = extractRoute('Bangkok → Tokyo');
  assert(route.from === 'Bangkok' && route.to === 'Tokyo', 'city route');
}

export function testCost() {
  const thb = extractCost('ราคารวม 24,500 THB');
  assert(thb.amountMinor === 2450000 && thb.currency === 'THB', `24,500 THB (got ${JSON.stringify(thb)})`);
  const jpy = extractCost('Total amount: ¥ 92,400');
  assert(jpy.amountMinor === 9240000 && jpy.currency === 'JPY', '¥92,400');
  assert(extractCost('no price at all').amountMinor === 0, 'no cost → 0');
  // the largest total on the page wins (sub-totals ignored)
  const multi = extractCost('Subtotal 1,000 THB\nGrand total 5,000 THB');
  assert(multi.amountMinor === 500000, 'grand total wins');
}

export function testFlightDraft() {
  const draft = parseConfirmationText(FLIGHT_MAIL, { baseCurrency: 'THB' });
  assert(draft.type === 'flight', `type flight (got ${draft.type})`);
  assert(draft.confirmation === 'XT4K9P', 'confirmation code');
  assert(draft.flightNumber === 'TG615', 'flight number');
  assert(draft.date === '2026-04-12', `date from the Thai line (got ${draft.date})`);
  assert(draft.startTime === '07:45' && draft.endTime === '15:20', 'times');
  assert(draft.from === 'BKK' && draft.to === 'NRT', `airports (got ${draft.from}→${draft.to})`);
  assert(draft.seat === '32A', 'seat');
  assert(draft.costMinor === 2450000 && draft.currency === 'THB', 'cost');
  assert(/Thai Airways/i.test(draft.provider), 'provider matched from the known list');
  assert(draft.confidence >= 50, `confidence ≥ 50 (got ${draft.confidence})`);
  assert(draft.recognised.length >= 8, 'several recognised fields');

  const reservation = draftToReservation(draft, { baseCurrency: 'THB' });
  assert(reservation.type === 'flight' && reservation.confirmation === 'XT4K9P', 'draft → reservation payload');
  assert(reservation.costMinor === 2450000 && reservation.currency === 'THB', 'cost carried into the payload');
  assert(KNOWN_PROVIDERS.length > 20, 'provider list is populated');
}

export function testHotelDraft() {
  const draft = parseConfirmationText(HOTEL_MAIL, { baseCurrency: 'THB' });
  assert(draft.type === 'hotel', `type hotel (got ${draft.type})`);
  assert(draft.date === '2026-04-12' && draft.endDate === '2026-04-15', 'check-in / check-out');
  assert(draft.startTime === '15:00' && draft.endTime === '11:00', 'check-in/out times');
  assert(/4471/.test(draft.confirmation.replace(/\s/g, '')), `booking reference (got ${draft.confirmation})`);
  assert(draft.currency === 'JPY' && draft.costMinor === 9240000, 'JPY total');
  assert(/night/i.test(draft.notes), 'nights mentioned in the notes');
  assert(draft.room, 'room captured');
}

export function testRobustness() {
  const empty = parseConfirmationText('');
  assert(empty.confidence === 0, 'empty text → zero confidence');
  assert(Array.isArray(empty.recognised) && empty.recognised.length === 0, 'no recognised fields');
  const junk = parseConfirmationText(RANDOM_TEXT);
  assert(junk.type === 'other', 'unrelated text → other');
  assert(junk.confidence < 40, 'low confidence for junk');
  const fallback = parseConfirmationText('some text', { fallbackDate: '2026-01-01' });
  assert(fallback.date === '2026-01-01', 'falls back to the trip start date');
  assert(confidenceLabel(90).tone === 'success' && confidenceLabel(50).tone === 'warning' && confidenceLabel(10).tone === 'danger', 'confidence tones');
  // never throws on odd input
  for (const input of [null, undefined, 42, {}, '🏝️🏝️🏝️']) {
    const d = parseConfirmationText(input);
    assert(typeof d.title === 'string' && typeof d.type === 'string', `survives ${String(input)}`);
  }
}
