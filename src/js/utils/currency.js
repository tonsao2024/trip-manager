import { escapeHtml } from './sanitize.js';
/**
 * Currency utilities - always store as minor units (satang/cent) to avoid float
 */

export function toMinor(amount, decimals = 2) {
  // amount as float major unit -> minor int
  const factor = Math.pow(10, decimals);
  return Math.round(Number(amount) * factor);
}

export function fromMinor(minor, decimals = 2) {
  const factor = Math.pow(10, decimals);
  return minor / factor;
}

export function formatCurrency(minor, currency = 'THB', locale = 'th-TH') {
  const decimals = getCurrencyDecimals(currency);
  const major = fromMinor(minor, decimals);
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, useGrouping: true }).format(major);
  } catch {
    return `${formatAmount(major, decimals)} ${currency}`;
  }
}

export function getCurrencyDecimals(currency) {
  const zero = ['JPY', 'KRW', 'VND'];
  if (zero.includes(currency)) return 0;
  return 2;
}

export function parseCurrencyInput(input) {
  // Remove commas, spaces
  const cleaned = String(input).replace(/[^0-9.-]/g, '');
  return Number(cleaned) || 0;
}

// Net total: Subtotal - Discount + Service + Tax + Card Fee
export function calculateNetTotal({ subtotalMinor, discountMinor = 0, serviceMinor = 0, taxMinor = 0, cardFeeMinor = 0, cardFeePercent = 0 }) {
  let total = subtotalMinor - discountMinor + serviceMinor + taxMinor;
  if (cardFeePercent) {
    const fee = Math.round(total * (cardFeePercent / 100));
    total += fee;
  }
  total += cardFeeMinor;
  return Math.max(0, total);
}

export function calculateCardFee(subtotalMinor, feeConfig) {
  // feeConfig: { type: 'percent'|'fixed', value: number }
  if (!feeConfig) return 0;
  if (feeConfig.type === 'percent') {
    return Math.round(subtotalMinor * (feeConfig.value / 100));
  }
  return toMinor(feeConfig.value);
}

export function convertCurrency(amountMinor, fromCurrency, toCurrency, rate) {
  // rate: how much 1 from = to ? Use rate snapshot
  // amount in from minor -> to minor
  if (fromCurrency === toCurrency) return amountMinor;
  const fromDec = getCurrencyDecimals(fromCurrency);
  const toDec = getCurrencyDecimals(toCurrency);
  const major = fromMinor(amountMinor, fromDec);
  const convertedMajor = major * rate;
  return toMinor(convertedMajor, toDec);
}


/**
 * Convert an amount to Thai baht minor units.
 * `rate` = how many THB 1 unit of `currency` is worth (trip.exchangeRateToTHB).
 * Returns null when there is no usable rate (caller can then hide the THB line).
 */
export function toThbMinor(minor, currency = 'THB', rate = 0) {
  const value = Number(minor) || 0;
  if (!currency || currency === 'THB') return value;
  const r = Number(rate) || 0;
  if (!Number.isFinite(r) || r <= 0) return null;
  return convertCurrency(value, currency, 'THB', r);
}

/** "≈ ฿7,680.00" — short label used next to a foreign-currency amount. */
export function formatThbLabel(minor, locale = 'th-TH') {
  if (minor == null) return '';
  return `≈ ${formatCurrency(minor, 'THB', locale)}`;
}

/** Effective THB rate for an expense (its own snapshot wins over the trip rate). */
export function effectiveThbRate(expense, trip) {
  const own = Number(expense?.thbRate);
  if (own > 0) return own;
  const tripRate = Number(trip?.exchangeRateToTHB);
  return tripRate > 0 ? tripRate : 0;
}

/**
 * The THB rate to use for a trip.
 *
 * Priority: the trip's own rate → the median snapshot saved on its expenses
 * (`thbRate`) → the rate stored in the browser for this currency. Returns 0 when
 * nothing is known, so callers can tell "no rate" apart from "1:1".
 *
 * @param {object|null} trip
 * @param {Array<{thbRate?:number, currency?:string}>} [expenses]
 * @param {string} [currency] defaults to trip.baseCurrency
 */
export function resolveTripThbRate(trip, expenses = [], currency = null) {
  const code = currency || trip?.baseCurrency || 'THB';
  if (!code || code === 'THB') return 1;
  const explicit = !trip?.baseCurrency || code === trip.baseCurrency ? Number(trip?.exchangeRateToTHB) : 0;
  if (explicit > 0) return explicit;
  const rates = (expenses || [])
    .filter(e => !e?.currency || e.currency === code)
    .map(e => Number(e?.thbRate))
    .filter(r => r > 0)
    .sort((a, b) => a - b);
  if (rates.length) return rates[Math.floor(rates.length / 2)];
  try {
    const stored = Number(JSON.parse(localStorage.getItem(`fuji_rate_${code}`) || '0'));
    if (stored > 0) return stored;
  } catch { /* ignore */ }
  return 0;
}

/** Remember a rate so the next trip in the same currency can use it. */
export function rememberThbRate(currency, rate) {
  const r = Number(rate);
  if (!currency || currency === 'THB' || !(r > 0)) return;
  try { localStorage.setItem(`fuji_rate_${currency}`, String(r)); } catch { /* ignore */ }
}

/** Grouped decimal amounts, including editable money fields. */
export function formatAmount(value, decimals = 2) {
  return Number(value || 0).toLocaleString('en-US', { useGrouping: true, minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** The original-currency amount rendered as a small chip (¥10,000). */
export function origChipHtml(minor, currency) {
  return `<span class="money-orig">${escapeHtml(formatCurrency(minor, currency))}</span>`;
}

/** Chip holding a pre-formatted secondary text (e.g. the trip-currency label). */
export function origTextChipHtml(text) {
  if (!text) return '';
  return `<span class="money-orig">${escapeHtml(text)}</span>`;
}

/**
 * Dual-currency display (v13 redesign): the baht amount is the headline and the
 * original currency rides BESIDE it as a chip — never stacked on top of it.
 */
export function moneyHtml(minor, currency = 'THB', rate = 0) {
  if (currency === 'THB') return `<span class="money-primary">${escapeHtml(formatCurrency(minor, 'THB'))}</span>`;
  const baht = toThbMinor(minor, currency, rate);
  const orig = origChipHtml(minor, currency);
  if (baht == null) {
    return `<span class="money-dual">${orig}<span class="money-norate">${escapeHtml('ยังไม่มีเรท THB')}</span></span>`;
  }
  return `<span class="money-dual"><span class="money-primary">${escapeHtml(formatCurrency(baht, 'THB'))}</span><span class="money-eq">≈</span>${orig}</span>`;
}

/**
 * Same dual layout, but built from a THB amount plus an already-formatted
 * secondary label (used where totals were normalized to baht first).
 */
export function thbPlusLabelHtml(thbMinor, secondaryLabel) {
  const primary = `<span class="money-primary">${escapeHtml(formatCurrency(thbMinor || 0, 'THB'))}</span>`;
  if (!secondaryLabel) return primary;
  return `<span class="money-dual">${primary}<span class="money-eq">≈</span>${origTextChipHtml(secondaryLabel)}</span>`;
}

/** Normalize before aggregating: never add yen, cents and satang together.
 * Returned copies are for reports only, not persisted. Round allocations and
 * payments together to keep a balanced ledger after conversion.
 */
export function expensesInThb(expenses, trip) {
  return expenses.map(e => {
    const code = e.currency || trip?.baseCurrency || 'THB';
    const rate = code === 'THB' ? 1 : Number(e.thbRate) || resolveTripThbRate(trip, expenses, code);
    const total = toThbMinor(e.netTotalMinor, code, rate);
    if (total == null) throw new Error(`กรุณาตั้งเรท ${code} → THB เพื่อคำนวณยอดรวม`);
    const convertRows = rows => {
      if (!rows?.length) return rows || [];
      const converted = rows.map(r => ({ ...r, amountMinor: toThbMinor(r.amountMinor, code, rate) }));
      const diff = total - converted.reduce((s, r) => s + r.amountMinor, 0);
      // Correct rounding only when the original ledger itself was balanced.
      if (rows.reduce((s, r) => s + r.amountMinor, 0) === e.netTotalMinor) {
        const largest = converted.reduce((best, r) => r.amountMinor > best.amountMinor ? r : best);
        largest.amountMinor += diff;
      }
      return converted;
    };
    return { ...e, originalExpense: e, currency: 'THB', netTotalMinor: total, thbMinor: total, thbRate: 1,
      allocations: convertRows(e.allocations),
      ...(e.payments?.length ? { payments: convertRows(e.payments) } : {}) };
  });
}
