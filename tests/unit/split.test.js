import { splitEqual, splitPercentage, splitShares, splitUnequal, validateAllocations, scaleToTotal } from '../../src/js/utils/split.js';

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

export function testScaleToTotal() {
  // Proportional re-fit lands exactly on the total
  const fit = scaleToTotal(10000, [{ memberId: 'a', amountMinor: 5000 }, { memberId: 'b', amountMinor: 3000 }]);
  assert(fit.reduce((s, r) => s + r.amountMinor, 0) === 10000, 'scaled amounts add up exactly');
  assert(fit[0].amountMinor === 6250 && fit[1].amountMinor === 3750, 'keeps proportions');
  // Largest remainder: a third of 100 is 33.33 — the extra minor unit goes to the first in order
  const thirds = scaleToTotal(100, [{ memberId: 'a', amountMinor: 1 }, { memberId: 'b', amountMinor: 1 }, { memberId: 'c', amountMinor: 1 }]);
  assert(JSON.stringify(thirds.map(r => r.amountMinor)) === '[34,33,33]', 'rounding is deterministic and exact');
  // No weights to scale from → equal split; zero shares stay zero
  assert(JSON.stringify(scaleToTotal(90, [{ memberId: 'a', amountMinor: 0 }, { memberId: 'b', amountMinor: 0 }]).map(r => r.amountMinor)) === '[45,45]', 'all-zero weights split equally');
  assert(JSON.stringify(scaleToTotal(100, [{ memberId: 'a', amountMinor: 0 }, { memberId: 'b', amountMinor: 5 }]).map(r => r.amountMinor)) === '[0,100]', 'zero share stays zero');
  assert(scaleToTotal(10, []).length === 0, 'no entries, no rows');
  console.log('✓ scaleToTotal');
}
