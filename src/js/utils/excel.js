import { expensePayments } from './payments.js';
// Excel (SheetJS) import/export — itinerary template + expenses, bilingual headers.
// Everything here is pure-ish (no Firestore writes) so it can be unit tested.
import { toThbMinor, expensesInThb, getCurrencyDecimals, toMinor, fromMinor } from './currency.js';
import { splitEqual } from './split.js';
import { EXPENSE_CATEGORIES as EXPENSE_CATEGORY_DEFS, ITINERARY_CATEGORIES as ITINERARY_CATEGORY_DEFS, normalizeCategory, categoryLabel } from './categories.js';

export { EXPENSE_CATEGORY_DEFS, ITINERARY_CATEGORY_DEFS, normalizeCategory, categoryLabel };


let sheetPromise = null;
export async function loadSheetJS() {
  if (!sheetPromise) {
    sheetPromise = import('https://esm.sh/xlsx@0.18.5').then(mod => mod.default || mod);
  }
  return sheetPromise;
}

/* ------------------------------------------------------------------ *
 * Shared helpers
 * ------------------------------------------------------------------ */

function normalizeKey(str) {
  return String(str ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\s_\-\/\.\(\)\[\]:]+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Build a lookup of every column alias → canonical field id. */
function buildAliasMap(columns) {
  const map = new Map();
  for (const col of columns) {
    [col.key, col.th, col.en, ...(col.aliases || [])].filter(Boolean).forEach(alias => {
      map.set(normalizeKey(alias), col.key);
    });
  }
  return map;
}

/** Normalize a raw row (from sheet_to_json) into canonical keys. */
export function normalizeRow(row, columns) {
  const alias = buildAliasMap(columns);
  const out = {};
  for (const [rawKey, value] of Object.entries(row || {})) {
    const key = alias.get(normalizeKey(rawKey));
    if (!key) continue;
    if (value === undefined || value === null) continue;
    out[key] = value;
  }
  return out;
}

export function parseDateCell(value, fallback = '') {
  if (value === undefined || value === null || value === '') return fallback;
  if (value instanceof Date && !isNaN(value)) return toISODate(value);
  if (typeof value === 'number' && isFinite(value)) {
    // Excel serial date (days since 1899-12-30)
    if (value > 20000 && value < 80000) {
      const ms = Math.round((value - 25569) * 86400000);
      const d = new Date(ms);
      if (!isNaN(d)) return toISODate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())));
    }
    return fallback;
  }
  const str = String(value).trim();
  if (!str) return fallback;
  let m = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
  m = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) {
    // Thai style d/m/yyyy when first group > 12 is dd/mm; otherwise assume dd/mm too (common in TH)
    const day = Number(m[1]); const month = Number(m[2]);
    if (day <= 31 && month <= 12) return `${m[3]}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  m = str.match(/^(\d{1,2})\s+([A-Za-zก-๙]+)\s+(\d{4})/);
  if (m) {
    const monthIdx = MONTH_NAMES.findIndex(names => names.includes(m[2].toLowerCase()));
    if (monthIdx >= 0) return `${m[3]}-${String(monthIdx + 1).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
  }
  const d = new Date(str);
  if (!isNaN(d)) return toISODate(d);
  return fallback;
}

const MONTH_NAMES = [
  ['jan', 'january', 'ม.ค.', 'มกราคม'], ['feb', 'february', 'ก.พ.', 'กุมภาพันธ์'],
  ['mar', 'march', 'มี.ค.', 'มีนาคม'], ['apr', 'april', 'เม.ย.', 'เมษายน'],
  ['may', 'พ.ค.', 'พฤษภาคม'], ['jun', 'june', 'มิ.ย.', 'มิถุนายน'],
  ['jul', 'july', 'ก.ค.', 'กรกฎาคม'], ['aug', 'august', 'ส.ค.', 'สิงหาคม'],
  ['sep', 'september', 'ก.ย.', 'กันยายน'], ['oct', 'october', 'ต.ค.', 'ตุลาคม'],
  ['nov', 'november', 'พ.ย.', 'พฤศจิกายน'], ['dec', 'december', 'ธ.ค.', 'ธันวาคม']
];

export function toISODate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseTimeCell(value, fallback = '09:00') {
  if (value === undefined || value === null || value === '') return fallback;
  if (value instanceof Date && !isNaN(value)) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }
  if (typeof value === 'number' && isFinite(value) && value >= 0 && value < 1) {
    const totalMinutes = Math.round(value * 24 * 60);
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
  }
  const str = String(value).trim();
  const m = str.match(/(\d{1,2})[:.](\d{2})/);
  if (m) return `${String(Math.min(23, Number(m[1]))).padStart(2, '0')}:${m[2]}`;
  const h = str.match(/^(\d{1,2})$/);
  if (h) return `${String(Math.min(23, Number(h[1]))).padStart(2, '0')}:00`;
  return fallback;
}

export function parseNumberCell(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'number') return isFinite(value) ? value : fallback;
  const cleaned = String(value).replace(/[^0-9.\-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? fallback : n;
}

export function parseCoordinatesCell(value) {
  if (!value) return '';
  if (typeof value === 'object') {
    const lat = parseFloat(value.lat ?? value.latitude);
    const lng = parseFloat(value.lng ?? value.lon ?? value.longitude);
    if (!isNaN(lat) && !isNaN(lng)) return `${lat},${lng}`;
  }
  const str = String(value).trim();
  const m = str.match(/(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return '';
  const lat = parseFloat(m[1]); const lng = parseFloat(m[2]);
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return '';
  return `${lat},${lng}`;
}

export function parseBooleanCell(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const s = normalizeKey(value);
  if (['yes', 'y', 'true', '1', 'ใช่', 'ใช้', 'เพิ่ม', 'auto', 'อัตโนมัติ'].includes(s)) return true;
  if (['no', 'n', 'false', '0', 'ไม่', 'ไม่ใช่', 'manual'].includes(s)) return false;
  return fallback;
}

/** "สมชาย, นุ่น; fuji_user" → ['สมชาย','นุ่น','fuji_user'] */
export function parsePeopleCell(value) {
  if (!value) return [];
  return String(value)
    .split(/[,;|\n]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

/** Build lookups so names / usernames / ids all resolve to member ids. */
export function buildMemberLookup(members = []) {
  const map = new Map();
  members.forEach(m => {
    const keys = [m.id, m.uid, m.memberId, m.username, m.displayName, m.email]
      .filter(Boolean)
      .map(k => normalizeKey(k));
    keys.forEach(k => { if (!map.has(k)) map.set(k, m.id); });
  });
  return map;
}

export function resolveMemberId(value, lookup, members = []) {
  if (!value) return null;
  const key = normalizeKey(value);
  if (lookup.has(key)) return lookup.get(key);
  // partial match on display name
  const partial = members.find(m => normalizeKey(m.displayName || '').includes(key) || key.includes(normalizeKey(m.displayName || '')));
  return partial ? partial.id : null;
}

/* ------------------------------------------------------------------ *
 * Column definitions
 * ------------------------------------------------------------------ */

export const ITINERARY_COLUMNS = [
  { key: 'date', th: 'วันที่', en: 'Date', required: true, width: 12, aliases: ['วัน', 'day'] },
  { key: 'startTime', th: 'เวลาเริ่ม', en: 'Start Time', width: 10, aliases: ['เวลา', 'time', 'start'] },
  { key: 'title', th: 'ชื่อสถานที่', en: 'Place Name', required: true, width: 28, aliases: ['สถานที่', 'place', 'title', 'name'] },
  { key: 'durationMinutes', th: 'ระยะเวลา (นาที)', en: 'Duration (min)', width: 14, aliases: ['ระยะเวลา', 'duration', 'durationminutes'] },
  { key: 'travelToNextMinutes', th: 'เดินทางต่อ (นาที)', en: 'Travel Time (min)', width: 16, aliases: ['เวลาเดินทาง', 'travel', 'traveltime'] },
  { key: 'category', th: 'หมวดหมู่', en: 'Category', width: 14 },
  { key: 'status', th: 'สถานะ', en: 'Status', width: 12 },
  { key: 'address', th: 'ที่อยู่', en: 'Address', width: 30 },
  { key: 'coordinates', th: 'พิกัด (lat,lng)', en: 'Coordinates', width: 20, aliases: ['พิกัด', 'latlng', 'location'] },
  { key: 'googleMapsUrl', th: 'ลิงก์ Google Maps', en: 'Google Maps URL', width: 26 },
  { key: 'imageUrl', th: 'รูปภาพ (URL)', en: 'Image URL', width: 26, aliases: ['รูป', 'ภาพ', 'image', 'photo'] },
  { key: 'description', th: 'รายละเอียด', en: 'Description', width: 30, aliases: ['detail', 'desc'] },
  { key: 'notes', th: 'โน้ต', en: 'Notes', width: 24, aliases: ['note', 'หมายเหตุ'] },
  { key: 'estimateAmount', th: 'ประมาณการค่าใช้จ่าย', en: 'Estimated Cost', width: 18, aliases: ['ประมาณการ', 'estimate', 'estimatedcost', 'cost', 'ราคา'] },
  { key: 'estimateCurrency', th: 'สกุลเงินประมาณการ', en: 'Estimate Currency', width: 16, aliases: ['สกุลเงิน', 'currency'] },
  { key: 'expenseCategory', th: 'หมวดค่าใช้จ่าย', en: 'Expense Category', width: 16, aliases: ['หมวดค่าใช้จ่าย', 'budgetcategory'] },
  { key: 'paidBy', th: 'ผู้จ่าย', en: 'Paid By', width: 16, aliases: ['คนจ่าย', 'payer'] },
  { key: 'sharedWith', th: 'ผู้ร่วมหาร', en: 'Shared With', width: 24, aliases: ['คนหาร', 'participants', 'splitwith'] },
  { key: 'autoAddExpense', th: 'เพิ่มเข้าค่าใช้จ่ายอัตโนมัติ', en: 'Auto Add to Expenses', width: 22, aliases: ['auto', 'autoaddexpense'] }
];

export const EXPENSE_COLUMNS = [
  { key: 'date', th: 'วันที่', en: 'Date', required: true, width: 12, aliases: ['วัน', 'day'] },
  { key: 'title', th: 'รายการ', en: 'Title', required: true, width: 28, aliases: ['ชื่อรายการ', 'name', 'item', 'description title'] },
  { key: 'category', th: 'หมวดหมู่', en: 'Category', width: 16, aliases: ['หมวด', 'type of expense'] },
  { key: 'kind', th: 'ประเภท (จ่ายจริง/ประมาณการ)', en: 'Type (actual/estimated)', width: 22, aliases: ['type', 'isestimated', 'actual'] },
  { key: 'currency', th: 'สกุลเงิน', en: 'Currency', width: 10 },
  { key: 'subtotal', th: 'ยอดรวม', en: 'Subtotal', width: 12, aliases: ['amount', 'ราคา', 'ยอด'] },
  { key: 'discount', th: 'ส่วนลด', en: 'Discount', width: 10 },
  { key: 'service', th: 'เซอร์วิสชาร์จ', en: 'Service', width: 12, aliases: ['servicecharge', 'servicecharge'] },
  { key: 'tax', th: 'ภาษี', en: 'Tax', width: 10, aliases: ['vat'] },
  { key: 'netTotal', th: 'ยอดสุทธิ', en: 'Net Total', width: 12, aliases: ['total', 'nettotal'] },
  { key: 'rate', th: 'เรทเป็นบาท', en: 'Rate to THB', width: 12, aliases: ['rate', 'thbrate', 'exchange', 'exchangerate'] },
  { key: 'payer', th: 'ผู้จ่าย', en: 'Paid By', width: 16, aliases: ['คนจ่าย', 'payerid'] },
  { key: 'sharedWith', th: 'ผู้ร่วมหาร', en: 'Shared With', width: 24, aliases: ['คนหาร', 'participants', 'splitwith'] },
  { key: 'amounts', th: 'จำนวนเงินต่อคน', en: 'Amount per Person', width: 26, aliases: ['amounts', 'splitamounts'] },
  { key: 'description', th: 'รายละเอียด', en: 'Description', width: 28, aliases: ['detail', 'note', 'notes'] },
  { key: 'paymentMethod', th: 'วิธีจ่าย', en: 'Payment Method', width: 14, aliases: ['payment'] },
  { key: 'itineraryTitle', th: 'ผูกกับแผน (ชื่อสถานที่)', en: 'Linked Place', width: 24, aliases: ['place', 'itinerary', 'linkedplace'] }
];

/* ------------------------------------------------------------------ *
 * Export
 * ------------------------------------------------------------------ */

function fmtISODate(value) {
  if (!value) return '';
  if (value instanceof Date) return toISODate(value);
  if (typeof value === 'object' && value.seconds) return toISODate(new Date(value.seconds * 1000));
  const s = String(value);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : s;
}

function timeFromDate(value) {
  if (!value) return '09:00';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d)) return '09:00';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function itineraryItemToRow(item, members = [], lang = 'th') {
  const lookup = buildMemberLookup(members);
  const memberName = (id) => members.find(m => m.id === id)?.displayName || id || '';
  const sharedIds = item.estimateShareWith?.length ? item.estimateShareWith : members.map(m => m.id);
  return {
    date: fmtISODate(item.date),
    startTime: timeFromDate(item.startAt),
    title: item.title || '',
    durationMinutes: item.durationMinutes ?? 60,
    travelToNextMinutes: item.travelToNextMinutes ?? 0,
    category: item.category || 'general',
    status: item.status || 'planned',
    address: item.address || '',
    coordinates: item.coordinates || '',
    googleMapsUrl: item.googleMapsUrl || '',
    imageUrl: item.imageUrl || '',
    description: item.description || '',
    notes: item.notes || '',
    estimateAmount: item.estimateAmount ?? (item.estimateMinor ? fromMinor(item.estimateMinor, getCurrencyDecimals(item.estimateCurrency || 'THB')) : ''),
    estimateCurrency: item.estimateCurrency || '',
    expenseCategory: item.estimateCategory ? categoryLabel(item.estimateCategory, lang) : '',
    paidBy: item.estimatePayerId ? memberName(item.estimatePayerId) : '',
    sharedWith: sharedIds.map(memberName).filter(Boolean).join(', '),
    autoAddExpense: item.estimateAutoAdd === false ? 'no' : (item.estimateAmount ? 'yes' : '')
  };
}

export function expenseToRow(expense, members = [], items = [], lang = 'th') {
  const memberName = (id) => members.find(m => m.id === id)?.displayName || id || '';
  const participantIds = (expense.allocations || []).filter(a => a.amountMinor > 0).map(a => a.memberId);
  const linked = items.find(i => i.id === expense.itineraryItemId);
  return {
    date: fmtISODate(expense.date),
    title: expense.title || '',
    category: categoryLabel(expense.category || 'general', lang),
    kind: expense.isEstimated ? (lang === 'th' ? 'ประมาณการ' : 'estimated') : (lang === 'th' ? 'จ่ายจริง' : 'actual'),
    currency: expense.currency || 'THB',
    subtotal: fromMinor(expense.subtotalMinor || 0, getCurrencyDecimals(expense.currency || 'THB')),
    discount: fromMinor(expense.discountMinor || 0, getCurrencyDecimals(expense.currency || 'THB')),
    service: fromMinor(expense.serviceMinor || 0, getCurrencyDecimals(expense.currency || 'THB')),
    tax: fromMinor(expense.taxMinor || 0, getCurrencyDecimals(expense.currency || 'THB')),
    netTotal: fromMinor(expense.netTotalMinor || 0, getCurrencyDecimals(expense.currency || 'THB')),
    rate: expense.thbRate ?? 1,
    payer: expensePayments(expense).map(p => memberName(p.memberId)).join(', '),
    sharedWith: participantIds.map(memberName).filter(Boolean).join(', '),
    amounts: (expense.allocations || []).filter(a => a.amountMinor > 0)
      .map(a => `${memberName(a.memberId)}=${fromMinor(a.amountMinor, getCurrencyDecimals(expense.currency || 'THB'))}`).join(', '),
    description: expense.description || '',
    paymentMethod: expense.paymentMethod || 'cash',
    itineraryTitle: linked?.title || ''
  };
}

function categorySummaryRows(expenses, lang = 'th') {
  const totals = new Map();
  expenses.forEach(e => {
    const key = e.category || 'general';
    const prev = totals.get(key) || { actual: 0, estimate: 0, count: 0 };
    if (e.isEstimated) prev.estimate += e.thbMinor || e.netTotalMinor || 0;
    else prev.actual += e.thbMinor || e.netTotalMinor || 0;
    prev.count += 1;
    totals.set(key, prev);
  });
  const rows = [[
    lang === 'th' ? 'หมวดหมู่' : 'Category',
    lang === 'th' ? 'จ่ายจริง (THB)' : 'Actual (THB)',
    lang === 'th' ? 'ประมาณการ (THB)' : 'Estimated (THB)',
    lang === 'th' ? 'รวม (THB)' : 'Total (THB)',
    lang === 'th' ? 'จำนวนรายการ' : 'Items'
  ]];
  [...totals.entries()].sort((a, b) => (b[1].actual + b[1].estimate) - (a[1].actual + a[1].estimate)).forEach(([cat, v]) => {
    rows.push([categoryLabel(cat, lang), v.actual / 100, v.estimate / 100, (v.actual + v.estimate) / 100, v.count]);
  });
  const totalsAll = [...totals.values()].reduce((acc, v) => ({ actual: acc.actual + v.actual, estimate: acc.estimate + v.estimate, count: acc.count + v.count }), { actual: 0, estimate: 0, count: 0 });
  rows.push([lang === 'th' ? 'รวมทั้งหมด' : 'Grand total', totalsAll.actual / 100, totalsAll.estimate / 100, (totalsAll.actual + totalsAll.estimate) / 100, totalsAll.count]);
  return rows;
}

function memberSummaryRows(expenses, members, lang = 'th') {
  const rows = [[
    lang === 'th' ? 'สมาชิก' : 'Member',
    lang === 'th' ? 'จ่ายไป (THB)' : 'Paid (THB)',
    lang === 'th' ? 'ต้องรับผิดชอบ (THB)' : 'Share (THB)',
    lang === 'th' ? 'สุทธิ (THB)' : 'Net (THB)'
  ]];
  const stats = new Map(members.map(m => [m.id, { paid: 0, share: 0 }]));
  expenses.forEach(e => {
    for (const payment of expensePayments(e)) {
      if (!stats.has(payment.memberId)) stats.set(payment.memberId, { paid: 0, share: 0 });
      stats.get(payment.memberId).paid += payment.amountMinor;
    }
    (e.allocations || []).forEach(a => {
      if (!stats.has(a.memberId)) stats.set(a.memberId, { paid: 0, share: 0 });
      stats.get(a.memberId).share += a.amountMinor || 0;
    });
  });
  stats.forEach((v, id) => {
    const name = members.find(m => m.id === id)?.displayName || id;
    rows.push([name, v.paid / 100, v.share / 100, (v.paid - v.share) / 100]);
  });
  return rows;
}

function infoRows({ trip, lang = 'th', kind = 'itinerary' }) {
  const label = lang === 'th' ? 'หัวข้อ' : 'Field';
  return [
    [label, lang === 'th' ? 'ค่า' : 'Value'],
    [lang === 'th' ? 'ทริป' : 'Trip', trip?.name || ''],
    [lang === 'th' ? 'รหัสทริป (Trip ID)' : 'Trip ID', trip?.id || ''],
    [lang === 'th' ? 'ช่วงวันที่' : 'Dates', `${trip?.startDate || ''} → ${trip?.endDate || ''}`],
    [lang === 'th' ? 'สกุลเงินหลัก' : 'Base currency', trip?.baseCurrency || 'THB'],
    [lang === 'th' ? 'เขตเวลา' : 'Timezone', trip?.timezone || 'Asia/Bangkok'],
    [lang === 'th' ? 'ไฟล์นี้คือ' : 'This file', kind === 'itinerary' ? (lang === 'th' ? 'เทมเพลตแผนการเดินทาง' : 'Itinerary template') : kind === 'expenses' ? (lang === 'th' ? 'เทมเพลตค่าใช้จ่าย' : 'Expenses template') : (lang === 'th' ? 'ข้อมูลสำรองทั้งทริป' : 'Full trip backup')],
    [lang === 'th' ? 'วันที่สร้างไฟล์' : 'Generated at', new Date().toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB')]
  ];
}

function memberRows(members, lang = 'th') {
  return [[
    lang === 'th' ? 'ชื่อที่แสดง' : 'Display name',
    lang === 'th' ? 'ชื่อผู้ใช้' : 'Username',
    lang === 'th' ? 'บทบาท' : 'Role',
    'Member ID'
  ], ...members.map(m => [m.displayName || '', m.username || '', m.role || 'member', m.id])];
}

function aoaToSheet(XLSX, rows, columns) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  for (const cell of Object.values(ws)) if (cell?.t === 'n') cell.z = '#,##0.##';
  if (columns?.length) ws['!cols'] = columns.map(c => ({ wch: c.width || 16 }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  return ws;
}

function rowsFromObjects(XLSX, objects, columns) {
  const header = columns.map(c => c.en);
  const headerTh = columns.map(c => c.th);
  const body = objects.map(obj => columns.map(c => obj[c.key] ?? ''));
  return [header, headerTh, ...body];
}

export async function buildWorkbook({ trip, items = [], expenses = [], members = [], lang = 'th', include = 'all' }) {
  const XLSX = await loadSheetJS();
  const wb = XLSX.utils.book_new();
  const add = (name, rows, cols) => {
    try { XLSX.utils.book_append_sheet(wb, aoaToSheet(XLSX, rows, cols), name.slice(0, 31)); } catch (e) { console.warn('sheet failed', name, e); }
  };

  if (include === 'all' || include === 'itinerary') {
    const objs = items.map(it => itineraryItemToRow(it, members, lang));
    add(lang === 'th' ? 'แผนการเดินทาง' : 'Itinerary', rowsFromObjects(XLSX, objs, ITINERARY_COLUMNS), ITINERARY_COLUMNS);
  }
  if (include === 'all' || include === 'expenses') {
    const objs = expenses.map(e => expenseToRow(e, members, items, lang));
    add(lang === 'th' ? 'ค่าใช้จ่าย' : 'Expenses', rowsFromObjects(XLSX, objs, EXPENSE_COLUMNS), EXPENSE_COLUMNS);
    const normalized = expensesInThb(expenses, trip);
    add(lang === 'th' ? 'สรุปหมวดหมู่' : 'Category summary', categorySummaryRows(normalized, lang), []);
    add(lang === 'th' ? 'สรุปต่อคน' : 'Per-person summary', memberSummaryRows(normalized, members, lang), []);
  }
  add(lang === 'th' ? 'ข้อมูลทริป' : 'Trip info', infoRows({ trip, lang, kind: include }), []);
  add(lang === 'th' ? 'สมาชิก' : 'Members', memberRows(members, lang), [{ width: 22 }, { width: 18 }, { width: 14 }, { width: 30 }]);
  return wb;
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export async function exportWorkbookFile(opts) {
  const XLSX = await loadSheetJS();
  const wb = await buildWorkbook(opts);
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const stamp = new Date().toISOString().slice(0, 10);
  const safeName = (opts.trip?.name || 'trip').replace(/[^\p{L}\p{N}\-_. ]+/gu, '').trim().replace(/\s+/g, '-') || 'trip';
  const label = opts.include === 'expenses' ? 'expenses' : opts.include === 'itinerary' ? 'itinerary' : 'trip-data';
  const filename = opts.filename || `${safeName}-${label}-${stamp}.xlsx`;
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
  return filename;
}

export async function exportCsvFile(rows, columns, filename) {
  const XLSX = await loadSheetJS();
  const ws = aoaToSheet(XLSX, rows, columns);
  const csv = '\ufeff' + XLSX.utils.sheet_to_csv(ws);
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename);
}

/** Read any supported spreadsheet/JSON file → { rows, sheetName } */
export async function readSpreadsheet(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (ext === 'json') {
    const parsed = JSON.parse(await file.text());
    const arr = Array.isArray(parsed) ? parsed : (parsed.items || parsed.expenses || []);
    return { rows: arr.map(r => (r && typeof r === 'object' ? r : {})), sheetName: 'JSON', source: 'json' };
  }
  const XLSX = await loadSheetJS();
  const isText = ext === 'csv' || ext === 'txt';
  let data;
  if (isText) {
    data = await file.text();
  } else {
    const buf = await file.arrayBuffer();
    // Always hand SheetJS a Uint8Array: some browsers/File polyfills return an
    // ArrayBuffer from another realm, which its `type: 'array'` sniffing rejects
    // (it then falls back to parsing the zip as CSV and finds no data).
    data = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  }
  const wb = XLSX.read(data, { type: isText ? 'string' : 'array', cellDates: true });
  // Prefer the sheet that looks like data (skip summary/info sheets when possible)
  const preferred = wb.SheetNames.find(n => /itinerary|expense|แผน|ค่าใช้จ่าย|sheet1|template|data/i.test(n)) || wb.SheetNames[0];
  const ws = wb.Sheets[preferred];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
  // Bilingual header rows: the 2nd row is Thai labels → merge them into the first header row
  const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false, blankrows: false });
  const merged = mergeBilingualHeaders(raw, XLSX, ws);
  return { rows: merged.length ? merged : rows, sheetName: preferred, sheetNames: wb.SheetNames, source: 'sheet' };
}

function mergeBilingualHeaders(raw, XLSX, ws) {
  if (!raw.length) return [];
  const header = raw[0].map(h => String(h ?? '').trim());
  const second = (raw[1] || []).map(h => String(h ?? '').trim());
  const secondLooksLikeHeader = second.some(h => /วันที่|เวลา|สถานที่|รายการ|หมวด|ผู้จ่าย|สถานะ|Date|Title|Category|Paid|Status/i.test(h));
  const keys = header.map((h, i) => h || (secondLooksLikeHeader ? second[i] : `col${i}`));
  const dataStart = secondLooksLikeHeader ? 2 : 1;
  return raw.slice(dataStart)
    .filter(row => row.some(cell => String(cell ?? '').trim() !== ''))
    .map(row => {
      const obj = {};
      keys.forEach((k, i) => {
        if (!k) return;
        const v = row[i];
        if (v === undefined || v === null || v === '') return;
        obj[k] = v;
      });
      return obj;
    });
}

/* ------------------------------------------------------------------ *
 * Import → objects
 * ------------------------------------------------------------------ */

export function importItineraryRows(rows, { trip, members = [], lang = 'th' } = {}) {
  const lookup = buildMemberLookup(members);
  const items = [];
  const errors = [];
  rows.forEach((rawRow, idx) => {
    const row = normalizeRow(rawRow, ITINERARY_COLUMNS);
    const rowNo = idx + 2;
    const errs = [];
    const title = String(row.title ?? '').trim();
    const date = parseDateCell(row.date, '');
    if (!title) errs.push(lang === 'th' ? 'ต้องมีชื่อสถานที่' : 'Place name required');
    if (!date) errs.push(lang === 'th' ? 'ต้องมีวันที่ (YYYY-MM-DD)' : 'Date required (YYYY-MM-DD)');
    const startTime = parseTimeCell(row.startTime, '09:00');
    const duration = Math.max(0, Math.round(parseNumberCell(row.durationMinutes, 60)));
    const estimateAmount = parseNumberCell(row.estimateAmount, 0);
    const currency = (String(row.estimateCurrency || trip?.baseCurrency || 'THB').trim().toUpperCase()).slice(0, 3);
    const category = normalizeItineraryCategory(row.category);
    const status = normalizeStatus(row.status);
    const coordinates = parseCoordinatesCell(row.coordinates);
    const sharedIds = parsePeopleCell(row.sharedWith).map(p => resolveMemberId(p, lookup, members)).filter(Boolean);
    const payerId = row.paidBy ? resolveMemberId(row.paidBy, lookup, members) : null;

    if (errs.length) { errors.push({ row: rowNo, errors: errs, data: rawRow }); return; }

    items.push({
      title,
      date,
      startAt: new Date(`${date}T${startTime}:00`),
      durationMinutes: duration || 60,
      travelToNextMinutes: Math.max(0, Math.round(parseNumberCell(row.travelToNextMinutes, 0))),
      category,
      status,
      address: String(row.address ?? '').trim(),
      coordinates,
      googleMapsUrl: String(row.googleMapsUrl ?? '').trim(),
      imageUrl: String(row.imageUrl ?? '').trim(),
      description: String(row.description ?? '').trim(),
      notes: String(row.notes ?? '').trim(),
      estimateAmount: estimateAmount > 0 ? estimateAmount : 0,
      estimateCurrency: currency,
      estimateCategory: normalizeCategory(row.expenseCategory),
      estimatePayerId: payerId || (members[0]?.id || null),
      estimateShareWith: sharedIds.length ? sharedIds : members.map(m => m.id),
      estimateAutoAdd: estimateAmount > 0 ? parseBooleanCell(row.autoAddExpense, true) : false,
      _row: rowNo
    });
  });
  return { items, errors };
}

function normalizeItineraryCategory(value) {
  const v = normalizeKey(value);
  if (!v) return 'general';
  const found = ITINERARY_CATEGORY_DEFS.find(c => normalizeKey(c.id) === v || normalizeKey(c.th) === v || normalizeKey(c.en) === v);
  return found ? found.id : 'general';
}

function normalizeStatus(value) {
  const v = normalizeKey(value);
  const map = { planned: 'planned', current: 'current', completed: 'completed', done: 'completed', skipped: 'skipped', cancelled: 'cancelled', canceled: 'cancelled' };
  if (!v) return 'planned';
  if (map[v]) return map[v];
  if (/กำลัง|current|now/.test(v)) return 'current';
  if (/เสร็จ|done|complete/.test(v)) return 'completed';
  if (/ข้าม|skip/.test(v)) return 'skipped';
  return 'planned';
}

export function importExpenseRows(rows, { trip, members = [], items = [], lang = 'th' } = {}) {
  const lookup = buildMemberLookup(members);
  const expenses = [];
  const errors = [];

  rows.forEach((rawRow, idx) => {
    const row = normalizeRow(rawRow, EXPENSE_COLUMNS);
    const rowNo = idx + 2;
    const errs = [];
    const title = String(row.title ?? '').trim();
    const date = parseDateCell(row.date, '');
    const currency = (String(row.currency || trip?.baseCurrency || 'THB').trim().toUpperCase()).slice(0, 3);
    const decimals = getCurrencyDecimals(currency);
    let subtotalMinor = toMinor(parseNumberCell(row.subtotal, 0), decimals);
    const discountMinor = toMinor(parseNumberCell(row.discount, 0), decimals);
    const serviceMinor = toMinor(parseNumberCell(row.service, 0), decimals);
    const taxMinor = toMinor(parseNumberCell(row.tax, 0), decimals);
    let netMinor = toMinor(parseNumberCell(row.netTotal, 0), decimals);
    if (!subtotalMinor && netMinor) subtotalMinor = netMinor + discountMinor - serviceMinor - taxMinor;
    if (!netMinor) netMinor = Math.max(0, subtotalMinor - discountMinor + serviceMinor + taxMinor);

    if (!title) errs.push(lang === 'th' ? 'ต้องมีชื่อรายการ' : 'Title required');
    if (!date) errs.push(lang === 'th' ? 'ต้องมีวันที่ (YYYY-MM-DD)' : 'Date required (YYYY-MM-DD)');
    if (!subtotalMinor && !netMinor) errs.push(lang === 'th' ? 'ต้องมียอดเงิน' : 'Amount required');

    const kindRaw = normalizeKey(row.kind);
    const isEstimated = /est|ประมาณ|plan/.test(kindRaw);

    const parsedAmounts = parseAmountPairs(row.amounts, lookup, members, decimals);
    let participantIds = parsePeopleCell(row.sharedWith).map(p => resolveMemberId(p, lookup, members)).filter(Boolean);
    if (!participantIds.length && parsedAmounts.length) participantIds = parsedAmounts.map(a => a.memberId);
    if (!participantIds.length) participantIds = members.map(m => m.id);

    let payerId = row.payer ? resolveMemberId(row.payer, lookup, members) : null;
    if (!payerId) payerId = participantIds[0] || members[0]?.id || null;
    if (!payerId) errs.push(lang === 'th' ? 'ต้องระบุผู้จ่าย (ยังไม่มีสมาชิกในทริป)' : 'Payer required (no members yet)');

    let allocations;
    if (parsedAmounts.length) {
      allocations = parsedAmounts;
      const sum = allocations.reduce((s, a) => s + a.amountMinor, 0);
      if (sum !== netMinor) {
        // Scale/gap-fill onto the payer so the sum always matches
        const diff = netMinor - sum;
        const target = allocations.find(a => a.memberId === payerId) || allocations[0];
        if (target) target.amountMinor += diff;
      }
    } else {
      allocations = splitEqual(netMinor, participantIds);
    }

    if (errs.length) { errors.push({ row: rowNo, errors: errs, data: rawRow }); return; }

    const rate = parseNumberCell(row.rate, trip?.exchangeRateToTHB || (currency === trip?.baseCurrency ? 1 : 1)) || 1;
    const linkedItem = row.itineraryTitle
      ? items.find(i => normalizeKey(i.title) === normalizeKey(row.itineraryTitle))
      : null;

    expenses.push({
      title,
      date,
      category: normalizeCategory(row.category),
      isEstimated,
      currency,
      subtotalMinor,
      discountMinor,
      serviceMinor,
      taxMinor,
      netTotalMinor: netMinor,
      thbRate: rate,
      thbMinor: toThbMinor(netMinor, currency, rate),
      payerId,
      allocations,
      description: String(row.description ?? '').trim(),
      paymentMethod: (String(row.paymentMethod || 'cash').trim().toLowerCase().includes('card') ? 'card' : 'cash'),
      itineraryItemId: linkedItem?.id || null,
      status: 'active',
      _row: rowNo
    });
  });

  return { expenses, errors };
}

function parseAmountPairs(value, lookup, members, decimals) {
  if (!value) return [];
  return String(value)
    .split(/[,;\n]+/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const m = part.match(/^(.*?)[=:]\s*(-?[\d.,]+)$/) || part.match(/^(-?[\d.,]+)\s*[=:]\s*(.*)$/);
      if (!m) {
        // "สมชาย 500" style
        const m2 = part.match(/^(.*?)\s+(-?[\d.,]+)$/);
        if (!m2) return null;
        const id = resolveMemberId(m2[1], lookup, members);
        if (!id) return null;
        return { memberId: id, amountMinor: toMinor(parseNumberCell(m2[2], 0), decimals) };
      }
      const maybeNumberFirst = /^-?[\d.,]+$/.test(m[1]);
      const name = maybeNumberFirst ? m[2] : m[1];
      const amount = maybeNumberFirst ? m[1] : m[2];
      const id = resolveMemberId(name, lookup, members);
      if (!id) return null;
      return { memberId: id, amountMinor: toMinor(parseNumberCell(amount, 0), decimals) };
    })
    .filter(Boolean);
}

/** Header rows for a blank template (EN + TH) */
export async function downloadItineraryTemplate(trip, { lang = 'th', withSample = true } = {}) {
  const XLSX = await loadSheetJS();
  const wb = XLSX.utils.book_new();
  const sample = withSample ? sampleItineraryRows(trip) : [];
  const head = rowsFromObjects(XLSX, sample, ITINERARY_COLUMNS);
  XLSX.utils.book_append_sheet(wb, aoaToSheet(XLSX, head, ITINERARY_COLUMNS), lang === 'th' ? 'แผนการเดินทาง' : 'Itinerary');
  XLSX.utils.book_append_sheet(wb, aoaToSheet(XLSX, infoRows({ trip, lang, kind: 'itinerary' }), []), lang === 'th' ? 'ข้อมูลทริป' : 'Trip info');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `itinerary-template-${trip?.id || 'trip'}.xlsx`);
}

export async function downloadExpensesTemplate(trip, { lang = 'th', withSample = true, members = [] } = {}) {
  const XLSX = await loadSheetJS();
  const wb = XLSX.utils.book_new();
  const sample = withSample ? sampleExpenseRows(trip, members) : [];
  const head = rowsFromObjects(XLSX, sample, EXPENSE_COLUMNS);
  XLSX.utils.book_append_sheet(wb, aoaToSheet(XLSX, head, EXPENSE_COLUMNS), lang === 'th' ? 'ค่าใช้จ่าย' : 'Expenses');
  XLSX.utils.book_append_sheet(wb, aoaToSheet(XLSX, memberRows(members, lang), [{ width: 22 }, { width: 18 }, { width: 14 }, { width: 30 }]), lang === 'th' ? 'สมาชิก' : 'Members');
  XLSX.utils.book_append_sheet(wb, aoaToSheet(XLSX, infoRows({ trip, lang, kind: 'expenses' }), []), lang === 'th' ? 'ข้อมูลทริป' : 'Trip info');
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `expenses-template-${trip?.id || 'trip'}.xlsx`);
}

function sampleItineraryRows(trip) {
  const base = trip?.startDate || new Date().toISOString().slice(0, 10);
  const day2 = (() => {
    const d = new Date(`${base}T00:00:00`);
    d.setDate(d.getDate() + 1);
    return toISODate(d);
  })();
  return [
    {
      date: base, startTime: '09:00', title: 'Fujisan Station', durationMinutes: 60, travelToNextMinutes: 20,
      category: 'transport', status: 'planned', address: 'Fujiyoshida, Yamanashi', coordinates: '35.4833,138.8000',
      googleMapsUrl: 'https://maps.google.com/?q=35.4833,138.8000', imageUrl: '',
      description: 'จุดเริ่มต้นของวันแรก', notes: 'ซื้อตั๋วรถบัส', estimateAmount: 1500, estimateCurrency: 'JPY',
      expenseCategory: 'transport', paidBy: '', sharedWith: '', autoAddExpense: 'yes'
    },
    {
      date: day2, startTime: '10:30', title: 'Lake Kawaguchi', durationMinutes: 120, travelToNextMinutes: 15,
      category: 'sightseeing', status: 'planned', address: 'Kawaguchiko, Yamanashi', coordinates: '35.5171,138.7518',
      googleMapsUrl: '', imageUrl: '', description: 'จุดชมวิวฟูจิ + เรือ', notes: '',
      estimateAmount: 2000, estimateCurrency: 'JPY', expenseCategory: 'ticket', paidBy: '', sharedWith: '', autoAddExpense: 'yes'
    }
  ];
}

function sampleExpenseRows(trip, members) {
  const base = trip?.startDate || new Date().toISOString().slice(0, 10);
  const person = members[0]?.displayName || 'A';
  return [
    {
      date: base, title: 'โรงแรมคาวากุจิโกะ (จองล่วงหน้า)', category: 'ที่พัก/โรงแรม', kind: 'ประมาณการ',
      currency: 'JPY', subtotal: 32000, discount: 0, service: 0, tax: 0, netTotal: 32000, rate: 0.23,
      payer: person, sharedWith: members.map(m => m.displayName).join(', '), amounts: '',
      description: 'จอง 2 คืน', paymentMethod: 'card', itineraryTitle: ''
    },
    {
      date: base, title: 'ค่าเข้าราชวงศ์ชมฟูจิ', category: 'ค่าเข้า/ตั๋ว', kind: 'จ่ายจริง',
      currency: 'JPY', subtotal: 1200, discount: 0, service: 0, tax: 0, netTotal: 1200, rate: 0.23,
      payer: person, sharedWith: members.map(m => m.displayName).join(', '), amounts: '',
      description: '', paymentMethod: 'cash', itineraryTitle: 'Lake Kawaguchi'
    }
  ];
}
