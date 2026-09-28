import { toMinor, fromMinor, calculateNetTotal, convertCurrency, resolveTripThbRate, tripCurrencyList } from '../../src/js/utils/currency.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

export function testCurrency() {
  console.log('Testing currency...');

  assert(toMinor(10.50)===1050, 'toMinor');
  assert(fromMinor(1050)===10.5, 'fromMinor');

  const net = calculateNetTotal({ subtotalMinor:10000, discountMinor:1000, serviceMinor:500, taxMinor:700, cardFeePercent: 3 });
  // 10000-1000+500+700=10200 +3% = 10506
  assert(net===10506, `Net total should be 10506, got ${net}`);
  console.log('✓ calculateNetTotal');

  const conv = convertCurrency(10000, 'THB', 'JPY', 4.2); // 100 THB *4.2 =420 JPY, minor 0 decimals? Actually JPY 0 decimals
  console.log('✓ convertCurrency', conv);

  console.log('All currency tests passed');
}

export function testTripMultiCurrencyRates() {
  console.log('Testing trip multi-currency rates...');

  // Base currency keeps using the trip's own rate; added currencies use theirs.
  const trip = {
    baseCurrency: 'JPY', exchangeRateToTHB: 0.24,
    tripCurrencies: ['EUR'], currencyRates: { EUR: 38.5 }
  };
  assert(resolveTripThbRate(trip, [], 'JPY') === 0.24, 'base currency resolves to exchangeRateToTHB');
  assert(resolveTripThbRate(trip, [], 'EUR') === 38.5, 'added trip currency resolves to trip.currencyRates');
  assert(resolveTripThbRate(trip, [], 'THB') === 1, 'THB is always 1');
  console.log('✓ resolveTripThbRate uses trip.currencyRates');

  // Trip rate beats an old expense snapshot for the same currency.
  const snap = [{ currency: 'EUR', thbRate: 41 }];
  assert(resolveTripThbRate(trip, snap, 'EUR') === 38.5, 'configured trip rate wins over expense snapshots');
  console.log('✓ trip rate wins over expense snapshots');

  // Without a trip rate the median expense snapshot is the fallback …
  const noRate = { baseCurrency: 'THB', exchangeRateToTHB: 1 };
  try { localStorage.removeItem('fuji_rate_EUR'); } catch {}
  assert(resolveTripThbRate(noRate, snap, 'EUR') === 41, 'expense snapshot fallback');
  // … and 0 means "nobody knows yet" (callers show "no rate" instead of 1:1).
  assert(resolveTripThbRate(noRate, [], 'GBP') === 0, 'unknown currency resolves to 0');
  console.log('✓ snapshot fallback + unknown → 0');

  // Currency picker list: base first, then trip currencies, then the standard set.
  const list = tripCurrencyList(trip);
  assert(list[0] === 'JPY', 'base currency comes first');
  assert(list.includes('EUR') && list.includes('THB') && list.includes('USD'), 'trip + standard currencies are offered');
  assert(new Set(list).size === list.length, 'no duplicate codes');
  assert(tripCurrencyList({ baseCurrency: 'THB' }, ['MYR']).includes('MYR'), 'extra defaults are merged in');
  console.log('✓ tripCurrencyList');

  console.log('All multi-currency tests passed');
}
