import { splitEqual, splitPercentage, splitShares, splitUnequal, validateAllocations } from '../../src/js/utils/split.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

export function testSplit() {
  console.log('Testing split...');

  // Equal
  const eq = splitEqual(100, ['a','b','c']);
  assert(eq.reduce((s,a)=>s+a.amountMinor,0)===100, 'Equal sum must match');
  assert(eq[0].amountMinor===34, 'Remainder distribution');
  console.log('✓ splitEqual');

  // Percentage
  const pct = splitPercentage(1000, [{memberId:'a', percent:50},{memberId:'b', percent:30},{memberId:'c', percent:20}]);
  assert(pct.reduce((s,a)=>s+a.amountMinor,0)===1000, 'Pct sum');
  assert(pct[0].amountMinor===500, 'Pct 50%');
  console.log('✓ splitPercentage');

  // Shares
  const shares = splitShares(100, [{memberId:'a', shares:1},{memberId:'b', shares:1},{memberId:'c', shares:2}]);
  assert(shares.reduce((s,a)=>s+a.amountMinor,0)===100, 'Shares sum');
  console.log('✓ splitShares');

  // Validate
  const v = validateAllocations(100, [{memberId:'a', amountMinor:60},{memberId:'b', amountMinor:40}]);
  assert(v.valid, 'Should be valid');
  const v2 = validateAllocations(100, [{memberId:'a', amountMinor:60}]);
  assert(!v2.valid, 'Should be invalid');
  console.log('✓ validateAllocations');

  console.log('All split tests passed');
}
