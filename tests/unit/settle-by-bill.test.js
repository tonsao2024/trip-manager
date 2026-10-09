import { calculateSettlement, settleByBill } from '../../src/js/utils/settlement.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }
function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}: expected ${b}, got ${a}`);
}
const sorted = rows => rows.map(r => [r[0], r[1], r[2]]).sort((x, y) => (x[0] + x[1]).localeCompare(y[0] + y[1]));

// Four people A (the admin), B, C, D. Bill 0: A fronts 2,000 for everyone (500 each).
// Bill 1 (the reported case): B types 600 as the first payer, C is auto-filled 400,
// and the 1,000 is shared equally by all four (250 each).
const members = ['A', 'B', 'C', 'D'].map(id => ({ id, displayName: id }));
const equalShares = (ids, total) => ids.map((memberId, i) => ({
  memberId, amountMinor: Math.floor(total / ids.length) + (i < total % ids.length ? 1 : 0)
}));
const bill0 = {
  id: 'bill0', netTotalMinor: 2000,
  payments: [{ memberId: 'A', amountMinor: 2000 }],
  allocations: equalShares(['A', 'B', 'C', 'D'], 2000)
};
const bill1 = {
  id: 'bill1', netTotalMinor: 1000,
  payments: [{ memberId: 'B', amountMinor: 600 }, { memberId: 'C', amountMinor: 400 }],
  allocations: equalShares(['A', 'B', 'C', 'D'], 1000)
};

export function testNonAdminPayersAreRepaidByTheBillSharers() {
  const { balances, transactions } = calculateSettlement([bill0, bill1], members);
  // Balances are unchanged by the bill-by-bill rule.
  eq(balances.map(b => [b.memberId, b.net]), [['A', 1250], ['B', -150], ['C', -350], ['D', -750]], 'balances');
  // The people who fronted bill 1 are no longer left out: D pays B and C directly.
  eq(sorted(transactions.map(t => [t.from, t.to, t.amountMinor])), sorted([
    ['C', 'A', 500], ['D', 'A', 500], ['B', 'A', 250], ['D', 'C', 150], ['D', 'B', 100]
  ]), 'per-bill transfers');
}

export function testBillsWithOnlyTheAdminAsPayerStillGoToTheAdmin() {
  const admin = { id: 'admin-only', title: 'x', netTotalMinor: 3000, payments: [{ memberId: 'A', amountMinor: 3000 }],
    allocations: equalShares(['A', 'B', 'C'], 3000) };
  const { transactions } = calculateSettlement([admin], [{ id: 'A' }, { id: 'B' }, { id: 'C' }]);
  eq(sorted(transactions.map(t => [t.from, t.to, t.amountMinor])), sorted([['B', 'A', 1000], ['C', 'A', 1000]]), 'admin paid');
}

export function testRecordedTransferReducesTheMatchingPair() {
  // D pays B the 100 they were owed for bill 1. D's debt to B is gone, but B still
  // owes A 250, so B's own balance does not improve.
  const after = calculateSettlement([bill0, bill1], members, [{ fromId: 'D', toId: 'B', amountMinor: 100 }]);
  assert(!after.transactions.some(t => t.from === 'D' && t.to === 'B'), 'D→B is settled');
  eq(after.balances.find(b => b.memberId === 'D').net, -650, 'D owes 100 less');
  eq(after.balances.find(b => b.memberId === 'B').net, -250, 'B still owes A 250');
}

export function testEveryMemberNetMatchesTheirTransfers() {
  // Property check over pseudo-random multi-payer bills: the transfers must explain
  // exactly each member's balance, with nothing lost or invented.
  let seed = 7;
  const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const people = ['P1', 'P2', 'P3', 'P4', 'P5'];
  for (let round = 0; round < 60; round++) {
    const expenses = [];
    const count = 1 + rnd(5);
    for (let e = 0; e < count; e++) {
      const total = 100 + rnd(9000);
      const payers = people.filter(() => rnd(3) === 0);
      if (!payers.length) payers.push(people[rnd(people.length)]);
      const payments = [];
      let left = total;
      payers.forEach((memberId, i) => {
        const amount = i === payers.length - 1 ? left : Math.floor(left * rnd(100) / 100);
        left -= amount;
        payments.push({ memberId, amountMinor: amount });
      });
      expenses.push({ id: `e${round}-${e}`, netTotalMinor: total, payments, allocations: equalShares(people, total) });
    }
    const transfers = rnd(2) ? [{ fromId: people[rnd(5)], toId: people[rnd(5)], amountMinor: rnd(500) }] : [];
    const { balances, transactions } = calculateSettlement(expenses, people.map(id => ({ id })), transfers);
    const flow = new Map(people.map(id => [id, 0]));
    for (const t of transactions) {
      assert(t.amountMinor > 0 && t.from !== t.to, `valid transfer in round ${round}`);
      flow.set(t.from, flow.get(t.from) - t.amountMinor);   // what they still pay out
      flow.set(t.to, flow.get(t.to) + t.amountMinor);       // what they still receive
    }
    for (const b of balances) {
      eq(flow.get(b.memberId), b.net, `round ${round}: ${b.memberId} transfers match balance`);
    }
  }
}

export function testSettleByBillIgnoresVoidedAndPendingBills() {
  const voided = { ...bill1, status: 'voided' };
  const pending = { ...bill1, id: 'p', payerPending: true, payments: [] };
  eq(settleByBill([bill0, voided, pending], [], 1).map(t => [t.from, t.to, t.amountMinor]),
    [['B', 'A', 500], ['C', 'A', 500], ['D', 'A', 500]], 'only bill 0 counts');
}
