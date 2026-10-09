import { paymentMethodOf } from '../../src/js/utils/payments.js';
import { cardSummary, buildSettlementStatements } from '../../src/js/utils/settlement.js';

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}: expected ${b}, got ${a}`);
}

const members = [{ id: 'a', displayName: 'เอ' }, { id: 'b', displayName: 'บี' }];

export function testPaymentMethodInheritsForLegacyRecords() {
  eq(paymentMethodOf({ paymentMethod: 'card', cardName: 'KTC' }, { memberId: 'a' }), { method: 'card', cardName: 'KTC' }, 'legacy card');
  eq(paymentMethodOf({ paymentMethod: 'card', cardName: 'KTC' }, { memberId: 'a', paymentMethod: 'cash' }), { method: 'cash', cardName: '' }, 'own cash drops the card');
  eq(paymentMethodOf({}, { memberId: 'a' }), { method: 'cash', cardName: '' }, 'default cash');
}

const split = { id: 'x', date: '2027-01-02', currency: 'THB', netTotalMinor: 1000, payerId: 'a', payments: [
  { memberId: 'a', amountMinor: 600, paymentMethod: 'card', cardName: 'KTC' },
  { memberId: 'b', amountMinor: 400, paymentMethod: 'cash' }
], allocations: [{ memberId: 'a', amountMinor: 500 }, { memberId: 'b', amountMinor: 500 }] };

export function testSplitBillCountsEachPayersOwnCard() {
  const cards = cardSummary([split], Object.fromEntries(members.map(m => [m.id, m])));
  eq(cards.map(c => [c.card, c.totalMinor, c.count]), [['KTC', 600, 1]], 'only the card payment lands on the card');
  const statements = buildSettlementStatements([split], members);
  const a = statements.find(s => s.memberId === 'a');
  const b = statements.find(s => s.memberId === 'b');
  eq(a.paidByMethod, { cash: 0, card: 600, transfer: 0, other: 0 }, 'a paid by card');
  eq(b.paidByMethod, { cash: 400, card: 0, transfer: 0, other: 0 }, 'b paid cash');
}
