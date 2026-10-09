// Pure (no-XLSX) parts of the Excel import/export layer.
import {
  normalizeRow, parseDateCell, parseTimeCell, parseNumberCell, parseCoordinatesCell,
  parsePeopleCell, buildMemberLookup, resolveMemberId, normalizeCategory, categoryLabel,
  importItineraryRows, importExpenseRows, ITINERARY_COLUMNS, EXPENSE_COLUMNS,
  itineraryItemToRow, expenseToRow
} from '../../src/js/utils/excel.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

export function testExcel() {
  console.log('Testing Excel import/export helpers...');

  const members = [
    { id: 'uid-a', displayName: 'สมชาย', username: 'somchai', role: 'trip_admin' },
    { id: 'uid-b', displayName: 'Nun', username: 'nun', role: 'member' },
    { id: 'uid-c', displayName: 'Ken', username: 'ken', role: 'member' }
  ];
  const trip = { id: 'trip1', name: 'Fuji 2027', startDate: '2027-01-17', endDate: '2027-01-20', baseCurrency: 'THB', exchangeRateToTHB: 0.25 };

  assert(parseDateCell('2027-01-17') === '2027-01-17', 'ISO date');
  assert(parseDateCell('17/01/2027') === '2027-01-17', 'dd/mm/yyyy date');
  assert(parseDateCell('17 Jan 2027') === '2027-01-17', 'textual date');
  assert(parseDateCell(46038) === '2026-01-16', `Excel serial date, got ${parseDateCell(46038)}`);
  assert(parseDateCell('') === '', 'empty date');
  console.log('✓ parseDateCell');

  assert(parseTimeCell('9:30') === '09:30', 'HH:mm');
  assert(parseTimeCell('18.45') === '18:45', 'dot separator');
  assert(parseTimeCell(0.5) === '12:00', 'Excel time fraction');
  assert(parseTimeCell('', '09:00') === '09:00', 'time fallback');
  console.log('✓ parseTimeCell');

  assert(parseNumberCell('¥1,200.50') === 1200.5, 'currency formatted number');
  assert(parseNumberCell('') === 0, 'empty number');
  assert(parseCoordinatesCell('35.3606, 138.7274') === '35.3606,138.7274', 'lat,lng');
  assert(parseCoordinatesCell('not a coord') === '', 'invalid coord');
  assert(parseCoordinatesCell('999,999') === '', 'out of range coord');
  console.log('✓ parseNumberCell / parseCoordinatesCell');

  assert(parsePeopleCell('สมชาย, Nun;ken').length === 3, 'people split'); 
  const lookup = buildMemberLookup(members);
  assert(resolveMemberId('nun', lookup, members) === 'uid-b', 'resolve by username');
  assert(resolveMemberId('สมชาย', lookup, members) === 'uid-a', 'resolve by display name');
  assert(resolveMemberId('unknown', lookup, members) === null, 'unknown member → null');
  console.log('✓ member lookup');

  assert(normalizeCategory('ที่พัก/โรงแรม') === 'stay', 'Thai hotel category');
  assert(normalizeCategory('Entrance fee') === 'ticket', 'entrance category');
  assert(normalizeCategory('ของฝาก') === 'shopping', 'souvenir category');
  assert(normalizeCategory(undefined) === 'general', 'default category');
  assert(normalizeCategory('Entrance fee') === 'ticket', 'fuzzy: entrance fee');
  assert(normalizeCategory('Hotel booking (3 nights)') === 'stay', 'fuzzy: hotel booking');
  assert(normalizeCategory('ค่าอาหารกลางวัน') === 'food', 'fuzzy: thai lunch');
  assert(categoryLabel('stay', 'th') === 'ที่พัก/โรงแรม', 'category label th');
  assert(categoryLabel('stay', 'en') === 'Stay / Hotel', 'category label en');
  console.log('✓ categories');

  // Bilingual header row → canonical keys
  const row = normalizeRow({ 'วันที่': '2027-01-17', 'Place Name': 'Lake Kawaguchi', 'พิกัด (lat,lng)': '35.5,138.7' }, ITINERARY_COLUMNS);
  assert(row.date === '2027-01-17' && row.title === 'Lake Kawaguchi' && row.coordinates === '35.5,138.7', 'bilingual headers normalize');
  console.log('✓ normalizeRow');

  const imported = importItineraryRows([
    { 'Date': '2027-01-17', 'Start Time': '09:00', 'Place Name': 'Fujisan Station', 'Duration (min)': 60, 'Estimated Cost': 1500, 'Estimate Currency': 'JPY', 'Expense Category': 'ค่าเข้า/ตั๋ว', 'Paid By': 'Nun', 'Shared With': 'สมชาย, Ken', 'Auto Add to Expenses': 'yes' },
    { 'Date': '', 'Place Name': 'Broken row' }
  ], { trip, members, lang: 'th' });

  assert(imported.items.length === 1, `1 valid item expected, got ${imported.items.length}`);
  assert(imported.errors.length === 1, '1 error row expected');
  const item = imported.items[0];
  assert(item.estimateAmount === 1500 && item.estimateCurrency === 'JPY', 'estimate amount + currency');
  assert(item.estimateCategory === 'ticket', 'expense category mapped');
  assert(item.estimatePayerId === 'uid-b', 'payer resolved from name');
  assert(item.estimateShareWith.join(',') === 'uid-a,uid-c', 'participants resolved');
  assert(item.estimateAutoAdd === true, 'auto add flag');
  assert(item.category === 'general', 'default itinerary category');
  assert(item.startAt instanceof Date && !isNaN(item.startAt), 'startAt parsed');
  console.log('✓ importItineraryRows');

  const exp = importExpenseRows([
    { 'วันที่': '2027-01-18', 'รายการ': 'โรงแรม', 'หมวดหมู่': 'ที่พัก', 'ประเภท (จ่ายจริง/ประมาณการ)': 'ประมาณการ', 'สกุลเงิน': 'JPY', 'ยอดรวม': 32000, 'เรทเป็นบาท': 0.25, 'ผู้จ่าย': 'สมชาย', 'ผู้ร่วมหาร': 'สมชาย, Nun, Ken' },
    { 'วันที่': '2027-01-18', 'รายการ': 'ราเมง', 'หมวดหมู่': 'food', 'สกุลเงิน': 'JPY', 'ยอดรวม': 3000, 'ผู้จ่าย': 'Nun', 'จำนวนเงินต่อคน': 'Nun=1000, สมชาย=2000' }
  ], { trip, members, items: [], lang: 'th' });

  assert(exp.expenses.length === 2, `2 expenses expected, got ${exp.expenses.length}`);
  const hotel = exp.expenses[0];
  assert(hotel.isEstimated === true, 'estimated flag parsed');
  assert(hotel.netTotalMinor === 32000, 'net total in minor units (JPY has 0 decimals)');
  assert(hotel.thbMinor === 800000, `THB conversion, got ${hotel.thbMinor}`);
  assert(hotel.category === 'stay', 'expense category normalized from Thai');
  assert(hotel.allocations.length === 3, 'equal split across 3 members');
  const sum = hotel.allocations.reduce((s, a) => s + a.amountMinor, 0);
  assert(sum === hotel.netTotalMinor, `allocations must equal total (${sum})`);
  console.log('✓ importExpenseRows (equal split)');

  const ramen = exp.expenses[1];
  assert(ramen.allocations.map(a => a.amountMinor).sort((a, b) => a - b).join(',') === '1000,2000', 'explicit per-person amounts');
  assert(ramen.allocations.reduce((s, a) => s + a.amountMinor, 0) === 3000, 'explicit amounts sum to total');
  console.log('✓ importExpenseRows (explicit amounts)');

  // Round trip: exported rows must be re-importable
  const itemRow = itineraryItemToRow({ ...item, id: 'it1', startAt: item.startAt, date: '2027-01-17' }, members, 'th');
  const roundTripItinerary = importItineraryRows([{ 'Date': itemRow.date, 'Start Time': itemRow.startTime, 'Place Name': itemRow.title }], { trip, members, lang: 'th' });
  assert(roundTripItinerary.items.length === 1, 'exported itinerary row imports back');
  const expRow = expenseToRow({ ...hotel, date: '2027-01-18' }, members, [], 'th');
  const roundTripExpense = importExpenseRows([{
    Date: expRow.date, Title: expRow.title, Category: expRow.category, Currency: expRow.currency,
    Subtotal: expRow.subtotal, 'Paid By': expRow.payer, 'Shared With': expRow.sharedWith
  }], { trip, members, items: [], lang: 'th' });
  assert(roundTripExpense.expenses.length === 1, 'exported expense row imports back');
  console.log('✓ export → import round trip');

  assert(ITINERARY_COLUMNS.some(c => c.key === 'estimateAmount'), 'itinerary columns include estimate');
  assert(EXPENSE_COLUMNS.some(c => c.key === 'sharedWith'), 'expense columns include participants');

  console.log('All Excel helper tests passed');
}

// v25: a bill paid by several people keeps every payer and amount through Excel.
export function testMultiPayerExpenseRoundTrip() {
  const members = [{ id: 'u1', displayName: 'สมชาย' }, { id: 'u2', displayName: 'นุ่น' }, { id: 'u3', displayName: 'คุณแม่' }];
  const expense = {
    id: 'e1', title: 'ข้าวกลางวัน', date: '2027-01-02', currency: 'THB', netTotalMinor: 1000,
    subtotalMinor: 1000, payerId: 'u1',
    payments: [{ memberId: 'u1', amountMinor: 600 }, { memberId: 'u2', amountMinor: 400 }],
    allocations: [{ memberId: 'u1', amountMinor: 300 }, { memberId: 'u2', amountMinor: 300 }, { memberId: 'u3', amountMinor: 400 }]
  };
  const row = expenseToRow(expense, members, [], 'th');
  if (row.payer !== 'สมชาย=6, นุ่น=4') throw new Error(`payer cell: ${row.payer}`);
  const { expenses, errors } = importExpenseRows([row], { trip: { baseCurrency: 'THB' }, members, lang: 'th' });
  if (errors.length) throw new Error(`import errors: ${JSON.stringify(errors)}`);
  const back = expenses[0];
  if (JSON.stringify(back.payments) !== JSON.stringify([{ memberId: 'u1', amountMinor: 600 }, { memberId: 'u2', amountMinor: 400 }])) {
    throw new Error(`payments lost: ${JSON.stringify(back.payments)}`);
  }
  if (back.payerId !== 'u1' || back.netTotalMinor !== 1000) throw new Error('payer / total changed');

  // one payer stays a plain name (the old format keeps working)
  const solo = expenseToRow({ ...expense, payments: [{ memberId: 'u2', amountMinor: 1000 }] }, members, [], 'th');
  if (solo.payer !== 'นุ่น') throw new Error(`single payer cell: ${solo.payer}`);
  const soloBack = importExpenseRows([solo], { trip: { baseCurrency: 'THB' }, members, lang: 'th' }).expenses[0];
  if (soloBack.payerId !== 'u2' || soloBack.payments) throw new Error('single payer should not add payments');

  // amounts that do not add up are reported, not silently changed
  const bad = importExpenseRows([{ ...row, payer: 'สมชาย=6, นุ่น=3' }], { trip: { baseCurrency: 'THB' }, members, lang: 'th' });
  if (!bad.errors.length) throw new Error('mismatched payer amounts should be an error');
}

// v26: every payer in the cell counts — not just the first name.
export function testExcelPayerCellKeepsEveryPayer() {
  const members = [{ id: 'u1', displayName: 'สมชาย' }, { id: 'u2', displayName: 'นุ่น' }, { id: 'u3', displayName: 'คุณแม่' }];
  const base = { title: 'ข้าว', date: '2027-01-02', currency: 'THB', netTotal: 1000, subtotal: 1000, sharedWith: 'สมชาย, นุ่น, คุณแม่' };
  const run = (payer) => importExpenseRows([{ ...base, payer }], { trip: { baseCurrency: 'THB' }, members, lang: 'th' });
  const sum = (list) => list.reduce((n, p) => n + p.amountMinor, 0);
  const asMap = (list) => Object.fromEntries(list.map(p => [p.memberId, p.amountMinor]));

  // names only, no amounts → the bill is split equally between the named payers
  let r = run('นุ่น, คุณแม่');
  if (r.errors.length) throw new Error(`names-only errors: ${JSON.stringify(r.errors)}`);
  let e = r.expenses[0];
  if (!e.payments || e.payments.length !== 2) throw new Error(`names-only payers dropped: ${JSON.stringify(e.payments)}`);
  if (JSON.stringify(asMap(e.payments)) !== JSON.stringify({ u2: 50000, u3: 50000 })) throw new Error(`names-only split: ${JSON.stringify(e.payments)}`);

  // first payer typed, the rest blank → the blank payer gets the remainder (not dropped)
  r = run('นุ่น=400, คุณแม่');
  if (r.errors.length) throw new Error(`partial errors: ${JSON.stringify(r.errors)}`);
  e = r.expenses[0];
  if (JSON.stringify(asMap(e.payments)) !== JSON.stringify({ u2: 40000, u3: 60000 })) throw new Error(`partial remainder: ${JSON.stringify(e.payments)}`);
  if (sum(e.payments) !== 100000) throw new Error('payments must total the bill');

  // one priced payer that is NOT first, others blank → remainder to the blanks
  r = run('สมชาย, นุ่น=300, คุณแม่');
  e = r.expenses[0];
  if (JSON.stringify(asMap(e.payments)) !== JSON.stringify({ u1: 35000, u2: 30000, u3: 35000 })) throw new Error(`mixed blanks: ${JSON.stringify(e.payments)}`);

  // priced amounts already above the total → reported
  r = run('นุ่น=1200, คุณแม่');
  if (!r.errors.length) throw new Error('over-total payer amounts should be an error');
}
