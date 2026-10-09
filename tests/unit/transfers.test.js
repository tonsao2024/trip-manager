import { applyTransfers, calculateSettlement } from '../../src/js/utils/settlement.js';

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}: expected ${b}, got ${a}`);
}

const members = [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }];
const expenses = [{ id: 'e1', payerId: 'u1', netTotalMinor: 900, allocations: [
  { memberId: 'u1', amountMinor: 300 }, { memberId: 'u2', amountMinor: 300 }, { memberId: 'u3', amountMinor: 300 }
] }];

export function testRecordedTransferReducesWhatIsStillOwed() {
  const before = calculateSettlement(expenses, members);
  eq(before.transactions.map(t => [t.from, t.to, t.amountMinor]), [['u2', 'u1', 300], ['u3', 'u1', 300]], 'before');
  const after = calculateSettlement(expenses, members, [{ fromId: 'u2', toId: 'u1', amountMinor: 300 }]);
  eq(after.transactions.map(t => [t.from, t.to, t.amountMinor]), [['u3', 'u1', 300]], 'u2 paid in full');
  eq(after.balances.find(b => b.memberId === 'u2').net, 0, 'u2 is settled');
}

export function testPartialTransferLeavesTheRest() {
  const after = calculateSettlement(expenses, members, [{ fromId: 'u3', toId: 'u1', amountMinor: 120 }]);
  eq(after.transactions.map(t => [t.from, t.to, t.amountMinor]), [['u2', 'u1', 300], ['u3', 'u1', 180]], 'partial');
}

export function testApplyTransfersIgnoresBadRows() {
  const base = [{ memberId: 'a', net: 100 }, { memberId: 'b', net: -100 }];
  eq(applyTransfers(base, [{ fromId: 'b', toId: 'a', amountMinor: 0 }, { fromId: 'a', toId: 'a', amountMinor: 50 }, { fromId: '', toId: 'a', amountMinor: 5 }]), base, 'ignored');
  eq(applyTransfers(base, [{ fromId: 'b', toId: 'a', amountMinor: 100 }]), [{ memberId: 'a', net: 0 }, { memberId: 'b', net: 0 }], 'settles both');
}
