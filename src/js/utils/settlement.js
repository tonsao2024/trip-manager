import { expensePayments } from './payments.js';
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
    for (const payment of expensePayments(exp)) {
      const payer = payment.memberId;
      balances.set(payer, (balances.get(payer) || 0) + payment.amountMinor);
    }

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

    for (const payment of expensePayments(exp)) {
      const total = payment.amountMinor;
      const payerRow = ensure(payment.memberId);
      payerRow.paidMinor += total;
      payerRow.paidByMethod[method] += total;
      payerRow.paidCount += 1;
      payerRow.items.push({
        expenseId: exp.id,
        title: exp.title || '',
        date: exp.date || '',
        role: 'paid',
        method,
        cardName: exp.cardName || '',
        hasReceipt: Boolean(exp.receiptImage || exp.receiptUrl),
        estimated: Boolean(exp.isEstimated),
        amountMinor: total,
        currency: exp.currency || null
      });
    }

    for (const alloc of exp.allocations || []) {
      const share = Number(alloc.amountMinor) || 0;
      if (share === 0) continue;
      const row = ensure(alloc.memberId);
      row.owedMinor += share;
      row.shareCount += 1;
      if (expensePayments(exp).length > 1 || alloc.memberId !== payerId || share !== total) {
        row.items.push({
          expenseId: exp.id,
          title: exp.title || '',
          date: exp.date || '',
          role: 'share',
          paidBy: payerId,
          payerIds: expensePayments(exp).map(p => p.memberId),
          method,
          cardName: exp.cardName || '',
          hasReceipt: Boolean(exp.receiptImage || exp.receiptUrl),
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

/**
 * Spending per credit card — "ค่าใช้จ่ายเกิดขึ้นในบัตรไหนบ้าง".
 *
 * @param {Array} expenses
 * @param {Object} membersMap  id → member (for the card holder name)
 * @returns {Array<{card:string, totalMinor:number, count:number, holders:string[], currency:string|null, estimatedMinor:number}>}
 */
export function cardSummary(expenses = [], membersMap = {}) {
  const rows = new Map();
  for (const e of expenses) {
    if (!e || (e.status || 'active') === 'voided') continue;
    if (e.paymentMethod !== 'card' || !e.cardName) continue;
    const key = String(e.cardName).trim();
    if (!key) continue;
    if (!rows.has(key)) rows.set(key, { card: key, totalMinor: 0, count: 0, holders: [], currency: e.currency || null, estimatedMinor: 0 });
    const row = rows.get(key);
    const amount = Number(e.netTotalMinor) || 0;
    row.totalMinor += amount;
    row.count += 1;
    if (e.isEstimated) row.estimatedMinor += amount;
    for (const p of expensePayments(e)) {
      const holder = membersMap[p.memberId]?.displayName;
      if (holder && !row.holders.includes(holder)) row.holders.push(holder);
    }
    if (!row.currency && e.currency) row.currency = e.currency;
  }
  return [...rows.values()].sort((a, b) => b.totalMinor - a.totalMinor);
}

/** Which expenses a settlement transaction settles (debtor's share of each). */
export function transactionBreakdown(statement) {
  if (!statement) return [];
  return (statement.items || []).filter(i => i.role === 'share');
}

/**
 * "จ่ายคืนจากค่าอะไร" — the expense shares that make up one transfer.
 *
 * Lists the expenses the creditor paid for, restricted to the debtor's share, so
 * a receipt can explain where the amount comes from (transfers are netted, so the
 * list is an explanation, not a strict sum).
 *
 * @param {{from:string,to:string,amountMinor:number}} tx
 * @param {Array} expenses
 * @returns {Array<{expenseId:string,title:string,date:string,amountMinor:number,currency:string|null,method:string}>}
 */
export function transactionSources(tx, expenses = []) {
  if (!tx) return [];
  const rows = [];
  for (const e of expenses) {
    if (!e || (e.status || 'active') === 'voided') continue;
    if (!expensePayments(e).some(p => p.memberId === tx.to && p.amountMinor > 0)) continue;
    const share = (e.allocations || []).find(a => a.memberId === tx.from);
    if (!share) continue;
    rows.push({
      expenseId: e.id,
      title: e.title || '',
      date: e.date || '',
      amountMinor: share.amountMinor || 0,
      currency: e.currency || null,
      method: e.paymentMethod || 'cash',
      estimated: Boolean(e.isEstimated)
    });
  }
  return rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}
