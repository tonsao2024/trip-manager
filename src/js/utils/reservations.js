import { scaleToTotal } from './split.js';
// Reservation helpers — the pure half of “ตั๋ว & ที่พัก” (types, sorting,
// warnings, “add to plan” payload, cost totals). Firestore-free for unit tests;
// the CRUD lives in src/js/reservations/index.js and re-exports everything.

export const RESERVATION_TYPES = [
  { id: 'flight', icon: 'plane', th: 'เที่ยวบิน', en: 'Flight', tone: '#2f6fe4' },
  { id: 'train', icon: 'train-front', th: 'รถไฟ', en: 'Train', tone: '#8a7ce8' },
  { id: 'bus', icon: 'bus', th: 'รถบัส / รถตู้', en: 'Bus / Van', tone: '#3f9d94' },
  { id: 'ferry', icon: 'ship', th: 'เรือ / เฟอร์รี่', en: 'Ferry', tone: '#639cb5' },
  { id: 'hotel', icon: 'bed-double', th: 'ที่พัก', en: 'Hotel', tone: '#64a1da' },
  { id: 'car', icon: 'car-front', th: 'รถเช่า', en: 'Car rental', tone: '#7d8b9c' },
  { id: 'restaurant', icon: 'utensils-crossed', th: 'ร้านอาหาร', en: 'Restaurant', tone: '#ef8f4e' },
  { id: 'ticket', icon: 'ticket', th: 'ตั๋ว / บัตรเข้าชม', en: 'Ticket', tone: '#f0ae52' },
  { id: 'other', icon: 'calendar-clock', th: 'อื่น ๆ', en: 'Other', tone: '#93a3b4' }
];

export function reservationTypeDef(id = 'other') {
  return RESERVATION_TYPES.find(t => t.id === id) || RESERVATION_TYPES[RESERVATION_TYPES.length - 1];
}

/** Sort by date + start time (entries without a date go last). */
export function sortReservations(list = []) {
  return [...list].sort((a, b) => {
    const da = a?.date || '9999-12-31';
    const dbb = b?.date || '9999-12-31';
    if (da !== dbb) return da < dbb ? -1 : 1;
    const ta = a?.startTime || '99:99';
    const tb = b?.startTime || '99:99';
    if (ta !== tb) return ta < tb ? -1 : 1;
    return String(a?.title || '').localeCompare(String(b?.title || ''));
  });
}

/** ISO-ish local timestamp string for comparing against “now”. */
export function reservationStamp(reservation = {}) {
  if (!reservation.date) return '';
  const time = reservation.startTime || '00:00';
  return `${reservation.date}T${time}`;
}

export function isUpcoming(reservation = {}, nowStamp = '') {
  const stamp = reservationStamp(reservation);
  if (!stamp) return false;
  return stamp >= String(nowStamp || '').slice(0, 16);
}

/** The next few reservations (dashboard “ถัดไป” widget). */
export function upcomingReservations(list = [], nowStamp = '', limit = 3) {
  return sortReservations(list.filter(r => isUpcoming(r, nowStamp))).slice(0, limit);
}

/** Grouped by day so the bookings page can render a timeline. */
export function groupReservationsByDate(list = []) {
  const days = [];
  for (const r of sortReservations(list)) {
    const key = r.date || 'unscheduled';
    let bucket = days.find(d => d.date === key);
    if (!bucket) { bucket = { date: key, items: [] }; days.push(bucket); }
    bucket.items.push(r);
  }
  return days;
}

/** Human label for the route line: “BKK → NRT”. */
export function routeLabel(reservation = {}) {
  const from = String(reservation.from || '').trim();
  const to = String(reservation.to || '').trim();
  if (from && to) return `${from} → ${to}`;
  return from || to || '';
}

/** Total booked spend per currency — { THB: 123400, JPY: 9800 } (minor units). */
export function reservationsCostByCurrency(list = []) {
  const out = {};
  for (const r of list) {
    const amount = Number(r?.costMinor) || 0;
    if (!amount) continue;
    const cur = r.currency || 'THB';
    out[cur] = (out[cur] || 0) + amount;
  }
  return out;
}

/**
 * Itinerary payload for “เพิ่มเข้าแผน” — a flight becomes
 * “✈️ BKK → NRT”, a hotel “เช็คอิน …”, with the confirmation code in the notes.
 */
export function reservationToItineraryPayload(reservation = {}, { date = '', startAt = '', order = 999 } = {}) {
  const type = reservationTypeDef(reservation.type);
  const route = routeLabel(reservation);
  const title = reservation.title || (route ? `${type.en} ${route}` : type.en);
  const noteBits = [
    reservation.confirmation ? `รหัสยืนยัน: ${reservation.confirmation}` : '',
    reservation.provider ? `ผู้ให้บริการ: ${reservation.provider}` : '',
    reservation.seat ? `ที่นั่ง: ${reservation.seat}` : '',
    reservation.room ? `ห้อง: ${reservation.room}` : '',
    reservation.notes || ''
  ].filter(Boolean);
  return {
    title,
    description: noteBits.join(' • '),
    date: date || reservation.date || '',
    startAt: startAt || '',
    durationMinutes: durationBetween(reservation.startTime, reservation.endTime),
    order,
    category: type.id === 'hotel' ? 'stay' : (['flight', 'train', 'bus', 'ferry', 'car'].includes(type.id) ? 'transport' : 'activity'),
    address: reservation.address || '',
    coordinates: reservation.coordinates || null,
    bookingRef: reservation.confirmation || '',
    status: 'booked',
    estimatedCostMinor: Number(reservation.costMinor) || 0,
    currency: reservation.currency || 'THB'
  };
}

/** Minutes between two HH:mm strings (handles overnight). */
export function durationBetween(start, end) {
  if (!start || !end) return 0;
  const [sh, sm] = String(start).split(':').map(Number);
  const [eh, em] = String(end).split(':').map(Number);
  if ([sh, sm, eh, em].some(n => Number.isNaN(n))) return 0;
  let minutes = (eh * 60 + em) - (sh * 60 + sm);
  if (minutes < 0) minutes += 24 * 60;
  return minutes;
}

/** Missing bits worth nagging about in the UI. */
export function reservationWarnings(reservation = {}) {
  const warnings = [];
  const type = reservationTypeDef(reservation.type);
  if (!reservation.confirmation && ['flight', 'train', 'hotel', 'car', 'ferry'].includes(type.id)) {
    warnings.push({ th: 'ยังไม่ได้ใส่รหัสยืนยัน', en: 'No confirmation code yet' });
  }
  if (['flight', 'train', 'bus', 'ferry'].includes(type.id) && !routeLabel(reservation)) {
    warnings.push({ th: 'ยังไม่ได้ระบุต้นทาง–ปลายทาง', en: 'No route yet' });
  }
  if (type.id === 'hotel' && !reservation.address) {
    warnings.push({ th: 'ยังไม่มีที่อยู่ที่พัก', en: 'No hotel address' });
  }
  return warnings;
}

/**
 * The expense book's numbers for a booking whose price changed: the same bill at
 * the new total, every share and payment scaled pro rata (largest remainder, so
 * they add up exactly to the new total). Each payment keeps its own method/card.
 */
export function expenseUpdateForCost(expense = {}, netMinor = 0) {
  const net = Math.max(0, Math.round(Number(netMinor) || 0));
  const scale = (rows = []) => {
    if (!rows.length) return rows;
    const scaled = scaleToTotal(net, rows);
    return rows.map((row, i) => ({ ...row, amountMinor: scaled[i].amountMinor }));
  };
  const oldNet = Number(expense.netTotalMinor) || 0;
  const update = {
    subtotalMinor: net,
    netTotalMinor: net,
    discountMinor: 0,
    serviceMinor: 0,
    taxMinor: 0,
    cardFeeMinor: 0,
    cardFeePercent: 0,
    allocations: scale(expense.allocations || []),
    thbMinor: oldNet > 0 ? Math.round((Number(expense.thbMinor) || 0) * net / oldNet) : net
  };
  if (Array.isArray(expense.payments) && expense.payments.length) update.payments = scale(expense.payments);
  return update;
}
