import { splitCustom } from '../../src/js/utils/split.js';
import { expensePayments, initialExpensePayerIds, findMemberForAccount, planPayerFields, planPayerIds, validatePayments, validateExpensePayerState } from '../../src/js/utils/payments.js';
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
export function testNewExpenseDefaultsToTheSignedInPayer() {
  const members = [
    { id: 'owner', uid: 'owner', role: 'trip_admin' },
    { id: 'member', uid: 'member', role: 'member' }
  ];
  eq(initialExpensePayerIds({}, members, 'member'), ['member'], 'a member-created expense defaults to the signed-in member, not the first/admin member');
  eq(initialExpensePayerIds({}, members, 'owner'), ['owner'], 'the owner still defaults to themself');
  eq(initialExpensePayerIds({}, members, 'unknown'), ['owner'], 'unmatched account falls back to the first available member');
  eq(initialExpensePayerIds({ payerPending: true }, members, 'member'), [], 'pending estimates have no default payer');
  eq(initialExpensePayerIds({ payerId: 'member', netTotalMinor: 100 }, members, 'owner'), ['member'], 'saved legacy payer is preserved while editing');
  eq(initialExpensePayerIds({ payments: [{ memberId: 'member', amountMinor: 50 }, { memberId: 'owner', amountMinor: 50 }] }, members, 'owner'), ['member', 'owner'], 'saved multi-payer rows are preserved while editing');
}

export function testNonAdminPayerIsCreditedAndSettlementRowsLinkToTheExpense() {
  const members = [
    { id: 'owner', displayName: 'Owner' },
    { id: 'member', displayName: 'Member' },
    { id: 'friend', displayName: 'Friend' }
  ];
  const expense = {
    id: 'member-paid-bill', title: 'Dinner paid by a member', date: '2027-02-03',
    payerId: 'member', createdBy: 'member', netTotalMinor: 10000, currency: 'THB',
    payments: [{ memberId: 'member', amountMinor: 10000 }],
    allocations: [
      { memberId: 'owner', amountMinor: 6000 },
      { memberId: 'member', amountMinor: 2000 },
      { memberId: 'friend', amountMinor: 2000 }
    ]
  };

  const { balances, transactions } = calculateSettlement([expense], members);
  eq(balances.map(b => [b.memberId, b.net]), [['owner', -6000], ['member', 8000], ['friend', -2000]], 'the actual non-admin payer gets credited in net balances');
  eq(transactions.map(t => [t.from, t.to, t.amountMinor]), [['owner', 'member', 6000], ['friend', 'member', 2000]], 'both debtors are directed to reimburse the member who paid');

  const statements = buildSettlementStatements([expense], members);
  const payer = statements.find(s => s.memberId === 'member');
  eq([payer.paidMinor, payer.owedMinor, payer.netMinor], [10000, 2000, 8000], 'the member receipt agrees with the balance calculation');
  assert(payer.items.some(i => i.role === 'paid' && i.expenseId === expense.id), 'the paid receipt row links to its expense id');
  assert(payer.items.some(i => i.role === 'share' && i.expenseId === expense.id), 'the payer’s own share links to the same expense id');

  const source = transactionSources(transactions[0], [expense]);
  eq(source.map(row => [row.expenseId, row.amountMinor]), [['member-paid-bill', 6000]], 'the transfer breakdown links to the exact shared expense and debtor share');
}

export function testPayerPendingEstimate() {
  const pending = {
    id: 'hotel-estimate', isEstimated: true, payerPending: true,
    payerId: 'legacy-payer', paidBy: 'legacy-payer', netTotalMinor: 180000,
    payments: [{ memberId: 'legacy-payer', amountMinor: 180000 }]
  };
  eq(expensePayments(pending), [], 'pending estimate ignores stale payer fields');
  assert(validateExpensePayerState(180000, [], { payerPending: true, isEstimated: true }), 'positive estimate can remain unassigned');
  assert(!validateExpensePayerState(0, [], { payerPending: true, isEstimated: true }), 'zero-value pending estimate rejected');
  assert(!validateExpensePayerState(180000, [], { payerPending: true, isEstimated: false }), 'actual expense cannot have a pending payer');
  assert(!validateExpensePayerState(180000, [{ memberId: 'a', amountMinor: 180000 }], { payerPending: true, isEstimated: true }), 'pending payer cannot carry payment rows');
  assert(!validateExpensePayerState(180000, [], { payerPending: false, isEstimated: true }), 'unassigned payer must be explicitly marked pending');
}

export function testMoneyDisplayAndAggregation() {
  eq(toThbMinor(1000, 'JPY', .24), 24000, '1000 yen = 240 baht = 24000 satang');
  eq(toThbMinor(10000, 'USD', 35), 350000, '100 USD = 3500 baht');
  eq(parseCurrencyInput('12,345.67'), 12345.67, 'grouped input');
  eq(formatAmount(12345.67), '12,345.67', 'grouped display');
  const html = moneyHtml(10000, 'JPY', .24);
  assert(html.indexOf('2,400') < html.indexOf('10,000'), 'THB precedes original amount');
  assert(html.includes('money-dec">.00</span>'), 'the fraction is hide-able so phones never break mid-number');
  assert(!moneyHtml(1000, 'JPY', 0).includes('≈ ฿0'), 'missing rate never displays false zero');
  const rows = expensesInThb([{ currency: 'JPY', netTotalMinor: 1000, thbRate: .24 }, { currency: 'THB', netTotalMinor: 10000 }], { baseCurrency: 'JPY', exchangeRateToTHB: .24 });
  eq(rows.reduce((n, e) => n + e.netTotalMinor, 0), 34000, 'mixed-currency sum is 340 baht');
  const rounded = expensesInThb([{ currency: 'JPY', netTotalMinor: 3, thbRate: .245, allocations: ['a','b','c'].map(memberId => ({ memberId, amountMinor: 1 })), payments: [{ memberId: 'a', amountMinor: 3 }] }], {});
  eq(calculateSettlement(rounded, []).balances.reduce((s, b) => s + b.net, 0), 0, 'converted ledger remains balanced');
}

export function testPayerRemainderMatchesUnequalSplit() {
  // The first payer types 6,000 of 10,000 → the blank payer is worked out as 4,000
  const remainder = splitCustom({ netTotalMinor: 10000, subtotalMinor: 10000, includesAdjustments: true, entries: [{ memberId: 'a', amountMinor: 6000 }, { memberId: 'b', amountMinor: null }] });
  assert(remainder.valid, 'one typed payer + one blank is valid');
  eq(remainder.rows.map(r => [r.memberId, r.amountMinor]), [['a', 6000], ['b', 4000]], 'blank payer takes the rest');
  // Several blanks share what is left, exact to the minor unit
  const three = splitCustom({ netTotalMinor: 10001, subtotalMinor: 10001, includesAdjustments: true, entries: [{ memberId: 'a', amountMinor: 1000 }, { memberId: 'b', amountMinor: null }, { memberId: 'c', amountMinor: null }] });
  assert(three.valid, 'several blanks are valid');
  eq(three.rows.map(r => r.amountMinor), [1000, 4501, 4500], 'remainder shared, extra unit to the first blank');
  eq(three.rows.reduce((n, r) => n + r.amountMinor, 0), 10001, 'payments add up to the net total');
  // Over-typed with a blank left is invalid; fully typed but short is invalid too
  assert(!splitCustom({ netTotalMinor: 10000, subtotalMinor: 10000, includesAdjustments: true, entries: [{ memberId: 'a', amountMinor: 12000 }, { memberId: 'b', amountMinor: null }] }).valid, 'over-typed payer leaves nothing for the blank');
  assert(!splitCustom({ netTotalMinor: 10000, subtotalMinor: 10000, includesAdjustments: true, entries: [{ memberId: 'a', amountMinor: 4000 }, { memberId: 'b', amountMinor: 4000 }] }).valid, 'fully typed but short is rejected');
  // Payments built this way always pass the stored-payment validation
  const payments = remainder.rows.filter(r => r.amountMinor > 0).map(r => ({ memberId: r.memberId, amountMinor: r.amountMinor }));
  assert(validatePayments(10000, payments), 'auto-worked payments validate');
  // A payer left with nothing is dropped rather than stored as a zero payment
  const zeroShare = splitCustom({ netTotalMinor: 10000, subtotalMinor: 10000, includesAdjustments: true, entries: [{ memberId: 'a', amountMinor: 10000 }, { memberId: 'b', amountMinor: null }] });
  eq(zeroShare.rows.filter(r => r.amountMinor > 0).map(r => r.memberId), ['a'], 'zero-share payer is not a payer');
}

export function testMultiPayerReceiptsShowEveryPayer() {
  const members = [{ id: 'a', displayName: 'A' }, { id: 'b', displayName: 'B' }, { id: 'c', displayName: 'C' }];
  const dinner = {
    id: 'dinner', title: 'ข้าว', date: '2027-01-02', netTotalMinor: 10000,
    payments: [{ memberId: 'a', amountMinor: 6000 }, { memberId: 'b', amountMinor: 4000 }],
    allocations: [{ memberId: 'a', amountMinor: 5000 }, { memberId: 'b', amountMinor: 3000 }, { memberId: 'c', amountMinor: 2000 }]
  };
  const statements = buildSettlementStatements([dinner], members);
  const paidA = statements.find(s => s.memberId === 'a').items.find(i => i.role === 'paid');
  eq(paidA.amountMinor, 6000, 'payer keeps own contribution');
  eq(paidA.totalMinor, 10000, 'paid row carries the whole bill');
  eq(paidA.payers.map(p => [p.memberId, p.amountMinor]), [['a', 6000], ['b', 4000]], 'paid row lists every payer with amounts');
  const shareC = statements.find(s => s.memberId === 'c').items.find(i => i.role === 'share');
  eq(shareC.payers.map(p => p.memberId), ['a', 'b'], 'share row names every payer');
  eq(shareC.payers.reduce((n, p) => n + p.amountMinor, 0), 10000, 'payer amounts add up to the bill');
  const sources = transactionSources({ from: 'c', to: 'a', amountMinor: 2000 }, [dinner]);
  eq(sources.map(s => [s.expenseId, s.amountMinor, s.totalMinor, s.payers.length]), [['dinner', 2000, 10000, 2]], 'transfer sources show the bill total and every payer');
}

// v26: the signed-in account is found by id, uid or authUid — never by id alone.
export function testFindMemberForAccountMatchesAllIds() {
  const members = [
    { id: 'owner', authUid: 'owner-auth' },
    { id: 'mb-linked', authUid: 'google-123' },
    { id: 'pin-member', uid: 'pin-member' }
  ];
  eq(findMemberForAccount(members, 'google-123')?.id, 'mb-linked', 'account linked by authUid');
  eq(findMemberForAccount(members, 'pin-member')?.id, 'pin-member', 'PIN member matched by uid');
  eq(findMemberForAccount(members, 'nobody'), null, 'unknown account has no member');
  eq(findMemberForAccount(members, ''), null, 'empty account has no member');
  eq(initialExpensePayerIds({}, members, 'google-123'), ['mb-linked'], 'default payer follows the linked account, not the first member');
}

// v26: a plan card shows every payer of its linked expense, not only the first.
export function testPlanPayerFieldsKeepEveryPayer() {
  const multi = { payerId: 'a', payments: [{ memberId: 'a', amountMinor: 300 }, { memberId: 'b', amountMinor: 700 }] };
  eq(planPayerFields(multi), { estimatePayerId: 'a', estimatePayerIds: ['a', 'b'], estimatePayerPending: false }, 'two payers are both kept');
  eq(planPayerFields({ payerId: 'c', netTotalMinor: 500 }), { estimatePayerId: 'c', estimatePayerIds: ['c'], estimatePayerPending: false }, 'legacy single payer');
  eq(planPayerFields({ payerPending: true, payments: [] }), { estimatePayerId: '', estimatePayerIds: [], estimatePayerPending: true }, 'unassigned estimate stays unassigned');
  eq(planPayerIds({ estimatePayerIds: ['a', 'b'], estimatePayerId: 'a' }), ['a', 'b'], 'card reads the full list');
  eq(planPayerIds({ estimatePayerId: 'x' }), ['x'], 'older plan items fall back to the single payer');
  eq(planPayerIds({ estimatePayerId: 'x', estimatePayerPending: true }), [], 'pending plan item has no payer');
  eq(planPayerIds({}), [], 'no payer at all');
}
