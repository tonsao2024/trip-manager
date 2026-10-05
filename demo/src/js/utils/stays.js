// Hotel / accommodation stays (v13).
//
// One itinerary item can describe a whole stay: check-in date, check-out date
// and ONE total price. The plan view then expands it so the hotel shows up on
// every night ("กลับเข้าพัก"), and the cost is distributed per night so each
// day's total is correct — while the expense book keeps a single entry that is
// entered only once.
import { dayjs } from './date.js';
import { toMinor, fromMinor, getCurrencyDecimals } from './currency.js';

/** Number of nights of a stay item (0 when it is not a stay). */
export function stayNights(item) {
  if (!item?.stayCheckIn || !item?.stayCheckOut) return 0;
  const a = dayjs(item.stayCheckIn).startOf('day');
  const b = dayjs(item.stayCheckOut).startOf('day');
  if (!a.isValid() || !b.isValid()) return 0;
  const n = b.diff(a, 'day');
  return n > 0 ? n : 0;
}

export function isStayItem(item) {
  return stayNights(item) > 0;
}

/** Split a minor-unit total across nights; the remainder lands on the last night. */
export function splitStayMinor(totalMinor, nights) {
  const total = Math.max(0, Math.round(Number(totalMinor) || 0));
  const n = Math.max(1, Math.round(nights) || 1);
  const base = Math.floor(total / n);
  const parts = new Array(n).fill(base);
  parts[n - 1] = total - base * (n - 1);
  return parts;
}

/**
 * Expand stay items into one entry per night for the plan view.
 *
 * - Night 1 keeps the real item (id unchanged) on the check-in date and is
 *   flagged `stayRole: 'checkin'`.
 * - Every following night gets a virtual "return to hotel" card
 *   (`virtualStay: true`, `masterId` = the real item id) placed at the end of
 *   that day (order 9000+) around `returnTime`.
 * - Each entry carries `stayNightMinor` / `stayNightAmount` — that night's
 *   share of the total — so per-day money totals distribute correctly.
 */
export function expandStayItems(items, { returnTime = '21:00' } = {}) {
  const out = [];
  for (const it of items || []) {
    const nights = stayNights(it);
    if (!nights) { out.push(it); continue; }
    const cur = it.estimateCurrency || 'THB';
    const dec = getCurrencyDecimals(cur);
    const totalMinor = toMinor(Number(it.estimateAmount) || 0, dec);
    const parts = splitStayMinor(totalMinor, nights);
    const checkIn = dayjs(it.stayCheckIn).startOf('day');
    for (let k = 0; k < nights; k++) {
      const date = checkIn.add(k, 'day').format('YYYY-MM-DD');
      const base = {
        ...it,
        date,
        isStay: true,
        stayNights: nights,
        stayNight: k + 1,
        stayNightMinor: parts[k],
        stayNightAmount: fromMinor(parts[k], dec)
      };
      if (k === 0) {
        out.push({ ...base, stayRole: 'checkin' });
      } else {
        const startAt = dayjs(`${date}T${returnTime}:00`).toDate();
        out.push({
          ...base,
          id: `${it.id}@stay-${date}`,
          masterId: it.id,
          virtualStay: true,
          stayRole: 'return',
          startAt,
          endAt: dayjs(startAt).add(30, 'minute').toDate(),
          durationMinutes: 30,
          travelToNextMinutes: 0,
          order: 9000 + k,
          status: it.status || 'planned'
        });
      }
    }
  }
  return out;
}

/** The amount one (possibly expanded) item contributes to its day's total. */
export function dayEstimateAmount(item) {
  if (!item) return 0;
  if (item.isStay && item.stayNightAmount != null) return Number(item.stayNightAmount) || 0;
  return Number(item.estimateAmount) || 0;
}
