import { splitCustom } from '../../src/js/utils/split.js';
import { expensePayments, validatePayments } from '../../src/js/utils/payments.js';
import { calculateSettlement, buildSettlementStatements, transactionSources } from '../../src/js/utils/settlement.js';
import { toThbMinor, expensesInThb, formatAmount, moneyHtml, parseCurrencyInput } from '../../src/js/utils/currency.js';
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const eq = (a, b, message) => assert(JSON.stringify(a) === JSON.stringify(b), `${message}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
export function testCustomAdjustments() {
  const bill = { subtotalMinor: 100000, discountMinor: 10000, serviceMinor: 9000, taxMinor: 6930, netTotalMinor: 105930, includesAdjustments: false };
  const result = splitCustom({ ...bill, entries: [{ memberId: 'a', amountMinor: 60000 }, { memberId: 'b', amountMinor: null }] });
  assert(result.valid, 'blank participant gets remaining subtotal');
  eq(result.rows.map(r => r.amountMinor), [63558, 42372], 'discount, SC and VAT included');
  for (const key of ['discountMinor','serviceMinor','taxMinor']) eq(result.rows.reduce((s, r) => s + r[key], 0), bill[key], `${key} exact`);
  assert(!splitCustom({ ...bill, entries: [{ memberId: 'a', amountMinor: 20000 }, { memberId: 'b', amountMinor: 20000 }] }).valid, 'underpayment cannot be silently corrected');
  assert(!splitCustom({ ...bill, entries: [{ memberId: 'a', amountMinor: 110000 }, { memberId: 'b', amountMinor: null }] }).valid, 'overpayment with blanks invalid');
  assert(!splitCustom({ ...bill, entries: [{ memberId: 'a', amountMinor: -1 }] }).valid, 'negative input invalid');
  const rounded = splitCustom({ subtotalMinor: 100, netTotalMinor: 107, taxMinor: 7, includesAdjustments: false, entries: ['a','b','c'].map(memberId => ({ memberId, amountMinor: null })) });
  assert(rounded.valid, 'rounding preserves net total');
  eq(rounded.rows.reduce((s, r) => s + r.amountMinor, 0), 107, 'rounding exact');
  const final = splitCustom({ netTotalMinor: 100, includesAdjustments: true, entries: [{ memberId: 'a', amountMinor: 80 }, { memberId: 'b', amountMinor: null }] });
  eq(final.rows.map(r => r.amountMinor), [80,20], 'final amounts remain unchanged');
}
export function testMultiplePayers() {
  const expense = { id: 'dinner', payerId: 'a', netTotalMinor: 10000, payments: [{ memberId: 'a', amountMinor: 6000 }, { memberId: 'b', amountMinor: 4000 }], allocations: [{ memberId: 'a', amountMinor: 5000 }, { memberId: 'b', amountMinor: 5000 }] };
  const members = [{ id: 'a' }, { id: 'b' }];
  assert(validatePayments(10000, expense.payments), 'valid multiple payments');
  assert(!validatePayments(11000, expense.payments), 'mismatched payments rejected');
  assert(!validatePayments(10000, [{ memberId: 'a', amountMinor: 5000 }, { memberId: 'a', amountMinor: 5000 }]), 'duplicate payers rejected');
  eq(calculateSettlement([expense], members).balances, [{ memberId: 'a', net: 1000 }, { memberId: 'b', net: -1000 }], 'balances credit each payer once');
  eq(buildSettlementStatements([expense], members).map(r => r.paidMinor), [6000,4000], 'receipts credit actual contributions');
  assert(transactionSources({ from: 'a', to: 'b' }, [expense]).length === 1, 'second payer appears in sources');
  eq(expensePayments({ payerId: 'a', netTotalMinor: 10000 }), [{ memberId: 'a', amountMinor: 10000 }], 'legacy single payer readable');
}
export function testMoneyDisplayAndAggregation() {
  eq(toThbMinor(1000, 'JPY', .24), 24000, '1000 yen = 240 baht = 24000 satang');
  eq(toThbMinor(10000, 'USD', 35), 350000, '100 USD = 3500 baht');
  eq(parseCurrencyInput('12,345.67'), 12345.67, 'grouped input');
  eq(formatAmount(12345.67), '12,345.67', 'grouped display');
  const html = moneyHtml(10000, 'JPY', .24);
  assert(html.indexOf('2,400.00') < html.indexOf('10,000'), 'THB precedes original amount');
  assert(!moneyHtml(1000, 'JPY', 0).includes('≈ ฿0'), 'missing rate never displays false zero');
  const rows = expensesInThb([{ currency: 'JPY', netTotalMinor: 1000, thbRate: .24 }, { currency: 'THB', netTotalMinor: 10000 }], { baseCurrency: 'JPY', exchangeRateToTHB: .24 });
  eq(rows.reduce((n, e) => n + e.netTotalMinor, 0), 34000, 'mixed-currency sum is 340 baht');
  const rounded = expensesInThb([{ currency: 'JPY', netTotalMinor: 3, thbRate: .245, allocations: ['a','b','c'].map(memberId => ({ memberId, amountMinor: 1 })), payments: [{ memberId: 'a', amountMinor: 3 }] }], {});
  eq(calculateSettlement(rounded, []).balances.reduce((s, b) => s + b.net, 0), 0, 'converted ledger remains balanced');
}
