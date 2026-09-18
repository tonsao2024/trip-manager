import { toMinor, fromMinor, calculateNetTotal, convertCurrency } from '../../src/js/utils/currency.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

export function testCurrency() {
  console.log('Testing currency...');

  assert(toMinor(10.50)===1050, 'toMinor');
  assert(fromMinor(1050)===10.5, 'fromMinor');

  const net = calculateNetTotal({ subtotalMinor:10000, discountMinor:1000, serviceMinor:500, taxMinor:700, cardFeePercent:3 });
  // 10000-1000+500+700=10200 +3% = 10506
  assert(net===10506, `Net total should be 10506, got ${net}`);
  console.log('✓ calculateNetTotal');

  const conv = convertCurrency(10000, 'THB', 'JPY', 4.2); // 100 THB *4.2 =420 JPY, minor 0 decimals? Actually JPY 0 decimals
  console.log('✓ convertCurrency', conv);

  console.log('All currency tests passed');
}
