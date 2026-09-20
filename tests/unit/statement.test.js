// Per-member settlement statements power the "เคลียร์บิล" receipts:
// received (paid, split by cash/card), deducted (their share) and the balance.
import { buildSettlementStatements, transactionBreakdown, calculateSettlement } from '../../src/js/utils/settlement.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }
const eq = (a, b, msg) => assert(a === b, `${msg} (got ${JSON.stringify(a)}, expected ${JSON.stringify(b)})`);

const members = [
  { id: 'u1', displayName: 'สมชาย' },
  { id: 'u2', displayName: 'นุ่น' },
  { id: 'u3', displayName: 'เคน' }
];

// ¥ amounts are stored as minor units of the trip currency (JPY = 0 decimals).
const expenses = [
  {
    id: 'e1', title: 'ค่าที่พัก', date: '2027-01-10', payerId: 'u1', netTotalMinor: 30000,
    currency: 'JPY', paymentMethod: 'card', allocations: [
      { memberId: 'u1', amountMinor: 10000 },
      { memberId: 'u2', amountMinor: 10000 },
      { memberId: 'u3', amountMinor: 10000 }
    ]
  },
  {
    id: 'e2', title: 'ราเมง', date: '2027-01-11', payerId: 'u2', netTotalMinor: 3000,
    currency: 'JPY', paymentMethod: 'cash', allocations: [
      { memberId: 'u1', amountMinor: 1000 },
      { memberId: 'u2', amountMinor: 1000 },
      { memberId: 'u3', amountMinor: 1000 }
    ]
  },
  {
    id: 'e3', title: 'ตั๋วรถบัส', date: '2027-01-12', payerId: 'u1', netTotalMinor: 2000,
    currency: 'JPY', paymentMethod: 'cash', isEstimated: true, allocations: [
      { memberId: 'u2', amountMinor: 1000 },
      { memberId: 'u3', amountMinor: 1000 }
    ]
  },
  {
    id: 'e4', title: 'ยกเลิกแล้ว', date: '2027-01-13', payerId: 'u3', netTotalMinor: 99999,
    status: 'voided', paymentMethod: 'cash', allocations: [{ memberId: 'u3', amountMinor: 99999 }]
  }
];

export function testSettlementStatements() {
  console.log('Testing per-member statements...');

  const statements = buildSettlementStatements(expenses, members);
  const by = Object.fromEntries(statements.map(s => [s.memberId, s]));

  eq(statements.length, 3, 'one statement per member');
  eq(by.u1.paidMinor, 32000, 'card + estimated cash payment counted');
  eq(by.u1.paidByMethod.card, 30000, 'split by method: card');
  eq(by.u1.paidByMethod.cash, 2000, 'split by method: cash (the estimate)');
  eq(by.u1.estimatedPaidMinor, 2000, 'estimated part flagged separately');
  eq(by.u2.paidMinor, 3000, 'cash payment counted');
  eq(by.u2.paidByMethod.cash, 3000, 'split by method: cash');
  eq(by.u3.paidMinor, 0, 'voided expense ignored');

  eq(by.u1.owedMinor, 11000, 'u1 share = 10000 + 1000');
  eq(by.u2.owedMinor, 12000, 'u2 share = 10000 + 1000 + 1000 (estimates included by default)');
  eq(by.u3.owedMinor, 12000, 'u3 share');
  eq(by.u1.netMinor, 32000 - 11000, 'balance = received − deducted');
  eq(by.u2.netMinor, 3000 - 12000, 'u2 owes money');
  eq(by.u1.paidCount, 2, 'paid count');
  eq(by.u1.shareCount, 2, 'share count');

  // Statements must agree with the transfer minimisation used by the page.
  const { balances, transactions } = calculateSettlement(expenses, members);
  for (const b of balances) eq(by[b.memberId].netMinor, b.net, `statement balance == settlement balance for ${b.memberId}`);
  const totalTx = transactions.reduce((s, t) => s + t.amountMinor, 0);
  assert(totalTx > 0, 'there are transfers to settle');

  // Item rows: who paid what, and what the member owes, with the method.
  const paid = by.u1.items.filter(i => i.role === 'paid');
  eq(paid.length, 2, 'u1 has two payment rows');
  const cardRow = paid.find(p => p.method === 'card');
  eq(cardRow.title, 'ค่าที่พัก', 'payment row keeps the title');
  assert(paid.some(p => p.estimated), 'estimated rows are flagged');
  const shares = by.u2.items.filter(i => i.role === 'share');
  assert(shares.length >= 2, 'u2 has share rows');
  assert(shares.every(s => s.paidBy), 'each share row names the payer');
  assert(shares.some(s => s.method === 'card'), 'share rows keep the payment method');
  assert(!by.u1.items.some(i => i.role === 'share' && i.expenseId === 'e1' && i.amountMinor === 0), 'zero shares skipped');
  eq(transactionBreakdown(by.u2).length, shares.length, 'transaction breakdown lists the share rows');

  // Actual-money-only view drops the estimated rows.
  const actualOnly = buildSettlementStatements(expenses, members, { includeEstimated: false });
  const u2Actual = actualOnly.find(s => s.memberId === 'u2');
  eq(u2Actual.owedMinor, 11000, 'estimates excluded on request');
  eq(actualOnly.find(s => s.memberId === 'u1').paidMinor, 30000, 'estimate not counted as paid');
  assert(!actualOnly.some(s => s.items.some(i => i.estimated)), 'no estimated rows in actual-only mode');

  // Sorting: biggest payer first.
  eq(statements[0].memberId, 'u1', 'statements sorted by amount paid');

  console.log('All statement tests passed');
}
