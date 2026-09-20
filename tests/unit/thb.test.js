// THB equivalents: every screen must be able to show the baht value of an amount
// stored in the trip currency.
import { toThbMinor, formatThbLabel, effectiveThbRate, formatCurrency } from '../../src/js/utils/currency.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }
const eq = (a, b, msg) => assert(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);

export function testThbConversion() {
  console.log('Testing THB conversion...');

  eq(toThbMinor(100000, 'THB', 1), 100000, 'THB is unchanged');
  // 0.24 THB per JPY: ¥1,000 = ฿240
  eq(toThbMinor(1000, 'JPY', 0.24), 240, 'JPY → THB uses the trip rate');
  eq(toThbMinor(0, 'JPY', 0.24), 0, 'zero stays zero');
  eq(toThbMinor(1000, 'JPY', 0), null, 'no rate → null (caller hides the line)');
  eq(toThbMinor(1000, 'JPY', null), null, 'null rate → null');
  eq(toThbMinor(1234, 'JPY', 0.245), 302, 'rounds to the nearest satang');

  assert(formatThbLabel(24000).startsWith('≈'), 'label carries the ≈ sign');
  assert(/240/.test(formatThbLabel(24000)), 'label formats the amount');
  eq(formatThbLabel(null), '', 'null is blank, not "฿0"');

  eq(effectiveThbRate({ thbRate: 0.25 }, { exchangeRateToTHB: 0.24 }), 0.25, 'expense snapshot wins');
  eq(effectiveThbRate({}, { exchangeRateToTHB: 0.24 }), 0.24, 'falls back to the trip rate');
  eq(effectiveThbRate({}, {}), 0, 'no rate anywhere → 0');
  eq(effectiveThbRate({ thbRate: -1 }, { exchangeRateToTHB: 0.24 }), 0.24, 'negative snapshot ignored');

  assert(formatCurrency(24000, 'THB').includes('240'), 'THB formats through Intl');
  console.log('All THB conversion tests passed');
}
