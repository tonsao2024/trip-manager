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
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(major);
  } catch {
    return `${major.toFixed(decimals)} ${currency}`;
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
