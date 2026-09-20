/**
 * Settlement algorithm - minimize transactions
 * Net balance = Paid - Owed
 */

export function calculateNetBalances(expenses, members) {
  // expenses: [{ payerId, allocations: [{ memberId, amountMinor }] }]
  const balances = new Map();
  for (const m of members) balances.set(m.id, 0);

  for (const exp of expenses) {
    if (exp.status === 'voided') continue;
    const payer = exp.payerId || exp.paidBy;
    if (!balances.has(payer)) balances.set(payer, 0);
    balances.set(payer, balances.get(payer) + exp.netTotalMinor);

    for (const alloc of exp.allocations || []) {
      if (!balances.has(alloc.memberId)) balances.set(alloc.memberId, 0);
      balances.set(alloc.memberId, balances.get(alloc.memberId) - alloc.amountMinor);
    }
  }
  return Array.from(balances.entries()).map(([memberId, net]) => ({ memberId, net }));
}

export function minimizeTransactions(balances, toleranceMinor = 1) {
  // balances: [{ memberId, net }] positive = should receive, negative = should pay
  const creditors = balances.filter(b => b.net > toleranceMinor).map(b => ({ ...b })).sort((a,b) => b.net - a.net);
  const debtors = balances.filter(b => b.net < -toleranceMinor).map(b => ({ ...b, net: -b.net })).sort((a,b) => b.net - a.net);

  const transactions = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(debtor.net, creditor.net);
    if (amount > toleranceMinor) {
      transactions.push({
        from: debtor.memberId,
        to: creditor.memberId,
        amountMinor: amount
      });
    }
    debtor.net -= amount;
    creditor.net -= amount;
    if (debtor.net <= toleranceMinor) i++;
    if (creditor.net <= toleranceMinor) j++;
  }
  return transactions;
}

export function calculateSettlement(expenses, members) {
  const balances = calculateNetBalances(expenses, members);
  const transactions = minimizeTransactions(balances);
  return { balances, transactions };
}


/**
 * Per-member statement for the "เคลียร์บิล" page — the receipt view:
 * what each person paid (and how: cash / card / transfer), what they owe,
 * the per-item deductions, and the final balance.
 *
 * @param {Array} expenses  [{ id, title, date, payerId|paidBy, netTotalMinor, currency,
 *                             paymentMethod, isEstimated, status, allocations:[{memberId, amountMinor}] }]
 * @param {Array} members   [{ id, displayName }]
 * @param {{includeEstimated?:boolean}} [options] estimated rows are included by
 *   default so the receipts agree with the transfer list (pass false for an
 *   "actual money only" receipt).
 * @returns {Array<{memberId, displayName, paidMinor, paidByMethod, owedMinor, netMinor, items, transactions}>}
 */
export function buildSettlementStatements(expenses, members, { includeEstimated = true } = {}) {
  const rows = new Map();
  const ensure = (memberId) => {
    const id = memberId || 'unknown';
    if (!rows.has(id)) {
      const member = members.find(m => m.id === id);
      rows.set(id, {
        memberId: id,
        displayName: member?.displayName || member?.email || id,
        color: member?.color || null,
        photoURL: member?.photoURL || null,
        paidMinor: 0,
        paidByMethod: { cash: 0, card: 0, transfer: 0, other: 0 },
        owedMinor: 0,
        paidCount: 0,
        shareCount: 0,
        items: []
      });
    }
    return rows.get(id);
  };

  for (const m of members) ensure(m.id);

  for (const exp of expenses || []) {
    if (exp.status === 'voided') continue;
    if (!includeEstimated && exp.isEstimated) continue;
    const total = Number(exp.netTotalMinor) || 0;
    const payerId = exp.payerId || exp.paidBy;
    const method = ['cash', 'card', 'transfer'].includes(exp.paymentMethod) ? exp.paymentMethod : 'other';

    const payerRow = ensure(payerId);
    payerRow.paidMinor += total;
    payerRow.paidByMethod[method] += total;
    payerRow.paidCount += 1;
    payerRow.items.push({
      expenseId: exp.id,
      title: exp.title || '',
      date: exp.date || '',
      role: 'paid',
      method,
      estimated: Boolean(exp.isEstimated),
      amountMinor: total,
      currency: exp.currency || null
    });

    for (const alloc of exp.allocations || []) {
      const share = Number(alloc.amountMinor) || 0;
      if (share === 0) continue;
      const row = ensure(alloc.memberId);
      row.owedMinor += share;
      row.shareCount += 1;
      if (alloc.memberId !== payerId || share !== total) {
        row.items.push({
          expenseId: exp.id,
          title: exp.title || '',
          date: exp.date || '',
          role: 'share',
          paidBy: payerId,
          method,
          estimated: Boolean(exp.isEstimated),
          amountMinor: share,
          currency: exp.currency || null
        });
      }
    }
  }

  const statements = [...rows.values()].map(row => {
    row.items.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.role.localeCompare(b.role));
    row.netMinor = row.paidMinor - row.owedMinor;
    row.estimatedPaidMinor = row.items.filter(i => i.role === 'paid' && i.estimated).reduce((n, i) => n + i.amountMinor, 0);
    return row;
  });
  return statements.sort((a, b) => b.paidMinor - a.paidMinor || String(a.displayName).localeCompare(String(b.displayName)));
}

/** Which expenses a settlement transaction settles (debtor's share of each). */
export function transactionBreakdown(statement) {
  if (!statement) return [];
  return (statement.items || []).filter(i => i.role === 'share');
}
