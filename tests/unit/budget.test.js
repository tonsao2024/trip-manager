// Tests for THB budget calculations and equal distribution across members
import { distributeBudgetEqually, toMinor, fromMinor, formatAmount, parseCurrencyInput, formatCurrency } from '../../src/js/utils/currency.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }
const eq = (a, b, msg) => assert(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);

export function testBudgetEquallyDistributed() {
  console.log('Testing distributeBudgetEqually...');

  // Case 1: Total budget distributed among 4 members
  const r1 = distributeBudgetEqually({ total: 40000, memberCount: 4 });
  eq(r1.perPerson, 10000, '40,000 / 4 = 10,000 per person');
  eq(r1.total, 40000, 'total matches');

  // Case 2: Total budget with decimal split among 3 members
  const r2 = distributeBudgetEqually({ total: 50000, memberCount: 3 });
  eq(r2.perPerson, 16666.67, '50,000 / 3 = 16,666.67 per person');

  // Case 3: Per-person default distributed when total is not set
  const r3 = distributeBudgetEqually({ perPerson: 15000, memberCount: 3 });
  eq(r3.perPerson, 15000, 'per person is 15,000');
  eq(r3.total, 45000, 'total is 15,000 * 3 = 45,000');

  // Case 4: No members
  const r4 = distributeBudgetEqually({ total: 50000, memberCount: 0 });
  eq(r4.perPerson, 0, 'zero members gives zero');

  // Case 5: Zero amounts
  const r5 = distributeBudgetEqually({ total: 0, perPerson: 0, memberCount: 5 });
  eq(r5.perPerson, 0, 'zero amounts gives zero');

  console.log('✓ distributeBudgetEqually passed');
}

export function testBudgetThbMinorUnits() {
  console.log('Testing budget THB minor units (satang)...');

  // Budget is stored in THB minor units (satang, 2 decimals)
  eq(toMinor(50000, 2), 5000000, '50,000 THB = 5,000,000 satang');
  eq(toMinor(12500.50, 2), 1250050, '12,500.50 THB = 1,250,050 satang');
  eq(fromMinor(5000000, 2), 50000, '5,000,000 satang = 50,000 THB');
  eq(fromMinor(1250050, 2), 12500.5, '1,250,050 satang = 12,500.50 THB');

  // Parsing formatted string inputs with commas
  eq(parseCurrencyInput('50,000'), 50000, 'parses 50,000');
  eq(parseCurrencyInput('16,666.67'), 16666.67, 'parses 16,666.67');
  eq(parseCurrencyInput('฿20,000'), 20000, 'parses with baht symbol');

  // Budget formatting helper test: whole numbers have no trailing .00
  const fmtBudget = (minor) => {
    if (!(Number(minor) > 0)) return '';
    const val = fromMinor(Number(minor), 2);
    return val % 1 === 0 ? formatAmount(val, 0) : formatAmount(val, 2);
  };
  eq(fmtBudget(5000000), '50,000', 'formats whole 50,000 without decimals');
  eq(fmtBudget(1666667), '16,666.67', 'formats 16,666.67 with satang');
  eq(fmtBudget(0), '', 'formats zero as empty');

  // Currency label is THB
  assert(formatCurrency(5000000, 'THB').includes('50,000'), 'formats THB currency');

  console.log('✓ budget THB minor units passed');
}
