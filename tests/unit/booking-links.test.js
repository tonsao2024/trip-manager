import { expenseUpdateForCost } from '../../src/js/utils/reservations.js';

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}: expected ${b}, got ${a}`);
}
const sum = rows => rows.reduce((n, r) => n + r.amountMinor, 0);

export function testBookingCostRescalesItsExpense() {
  const exp = {
    netTotalMinor: 1000, thbMinor: 1000, currency: 'THB',
    allocations: [{ memberId: 'a', amountMinor: 500 }, { memberId: 'b', amountMinor: 500 }],
    payments: [{ memberId: 'a', amountMinor: 700, paymentMethod: 'card', cardName: 'KTC' }, { memberId: 'b', amountMinor: 300, paymentMethod: 'cash' }]
  };
  const u = expenseUpdateForCost(exp, 1500);
  eq(u.netTotalMinor, 1500, 'net');
  eq(u.subtotalMinor, 1500, 'subtotal');
  eq(u.allocations.map(a => a.amountMinor), [750, 750], 'shares');
  eq(u.payments.map(p => p.amountMinor), [1050, 450], 'payments scaled');
  eq([u.payments[0].paymentMethod, u.payments[0].cardName], ['card', 'KTC'], 'method and card kept per payer');
  eq(u.thbMinor, 1500, 'baht follows the new total');
  eq(u.discountMinor + u.serviceMinor + u.taxMinor, 0, 'old adjustments cleared');
}

export function testRoundingNeverLosesASatang() {
  const exp = { netTotalMinor: 300, allocations: [{ memberId: 'a', amountMinor: 100 }, { memberId: 'b', amountMinor: 100 }, { memberId: 'c', amountMinor: 100 }] };
  eq(sum(expenseUpdateForCost(exp, 100).allocations), 100, 'exact total after splitting 100 three ways');
  eq(expenseUpdateForCost({ netTotalMinor: 0, allocations: [] }, 500).allocations, [], 'no shares → none');
  eq(expenseUpdateForCost({ netTotalMinor: 800, allocations: [] }, -5).netTotalMinor, 0, 'negative clamps to zero');
}
