import { expensePayments, paymentMethodOf } from './payments.js';
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
    // No host yet ("ยังไม่ระบุเจ้าภาพ") — nobody paid, so it cannot be part of
    // any balance until a payer is assigned.
    if (exp.payerPending) continue;
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

/**
 * Money already sent between members (“จ่ายแล้ว”). A transfer from a debtor to a
 * creditor moves both nets toward zero, so the transactions that are still
 * suggested come from what is genuinely left to pay.
 * @param {{memberId:string, net:number}[]} balances
 * @param {{fromId:string, toId:string, amountMinor:number}[]} transfers
 */
export function applyTransfers(balances, transfers = []) {
  const net = new Map(balances.map(b => [b.memberId, b.net]));
  for (const t of transfers || []) {
    const amount = Math.round(Number(t?.amountMinor) || 0);
    if (!(amount > 0) || !t.fromId || !t.toId || t.fromId === t.toId) continue;
    net.set(t.fromId, (net.get(t.fromId) || 0) + amount);
    net.set(t.toId, (net.get(t.toId) || 0) - amount);
  }
  return Array.from(net.entries()).map(([memberId, n]) => ({ memberId, net: n }));
}

export function calculateSettlement(expenses, members, transfers = []) {
  const balances = applyTransfers(calculateNetBalances(expenses, members), transfers);
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
export function buildSettlementStatements(expenses, members, { includeEstimated = true, transfers = [] } = {}) {
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
    if (exp.payerPending) continue;   // no host yet → not part of any receipt
    if (!includeEstimated && exp.isEstimated) continue;
    const total = Number(exp.netTotalMinor) || 0;
    const payerId = exp.payerId || exp.paidBy;
    const method = ['cash', 'card', 'transfer'].includes(exp.paymentMethod) ? exp.paymentMethod : 'other';
    // Every payer with the amount they put in: a receipt must show the whole bill,
    // not just the viewer's own part of it.
    const payments = expensePayments(exp);
    const payers = payments.map(p => ({ memberId: p.memberId, amountMinor: p.amountMinor }));

    for (const payment of payments) {
      const paidMinor = payment.amountMinor;
      const payerRow = ensure(payment.memberId);
      payerRow.paidMinor += paidMinor;
      const pay = paymentMethodOf(exp, payment);
      const payMethod = ['cash', 'card', 'transfer'].includes(pay.method) ? pay.method : 'other';
      payerRow.paidByMethod[payMethod] += paidMinor;
      payerRow.paidCount += 1;
      payerRow.items.push({
        expenseId: exp.id,
        title: exp.title || '',
        date: exp.date || '',
        role: 'paid',
        method: payMethod,
        cardName: pay.cardName,
        hasReceipt: Boolean(exp.receiptImage || exp.receiptUrl),
        estimated: Boolean(exp.isEstimated),
        amountMinor: paidMinor,
        totalMinor: total,
        payers,
        payerCount: payers.length,
        currency: exp.currency || null
      });
    }

    for (const alloc of exp.allocations || []) {
      const share = Number(alloc.amountMinor) || 0;
      if (share === 0) continue;
      const row = ensure(alloc.memberId);
      row.owedMinor += share;
      row.shareCount += 1;
      if (payments.length > 1 || alloc.memberId !== payerId || share !== total) {
        row.items.push({
          expenseId: exp.id,
          title: exp.title || '',
          date: exp.date || '',
          role: 'share',
          paidBy: payerId,
          payerIds: payers.map(p => p.memberId),
          payers,
          payerCount: payers.length,
          totalMinor: total,
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

  // Money already sent (จ่ายแล้ว): the sender's balance moves toward zero, the receiver's moves back toward zero.
  for (const t of transfers || []) {
    const amount = Math.round(Number(t?.amountMinor) || 0);
    if (!(amount > 0) || t.fromId === t.toId) continue;
    if (rows.has(t.fromId)) rows.get(t.fromId).settledMinor = (rows.get(t.fromId).settledMinor || 0) + amount;
    if (rows.has(t.toId)) rows.get(t.toId).settledMinor = (rows.get(t.toId).settledMinor || 0) - amount;
  }
  const statements = [...rows.values()].map(row => {
    row.items.sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.role.localeCompare(b.role));
    row.netMinor = row.paidMinor - row.owedMinor + (row.settledMinor || 0);
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
    // Each payer's own card counts — a bill can be split across two cards.
    const byCard = new Map();
    for (const p of expensePayments(e)) {
      const pay = paymentMethodOf(e, p);
      if (pay.method !== 'card' || !pay.cardName) continue;
      if (!byCard.has(pay.cardName)) byCard.set(pay.cardName, { amountMinor: 0, holders: [] });
      const bucket = byCard.get(pay.cardName);
      bucket.amountMinor += Number(p.amountMinor) || 0;
      const holder = membersMap[p.memberId]?.displayName;
      if (holder && !bucket.holders.includes(holder)) bucket.holders.push(holder);
    }
    for (const [key, bucket] of byCard) {
      if (!rows.has(key)) rows.set(key, { card: key, totalMinor: 0, count: 0, holders: [], currency: e.currency || null, estimatedMinor: 0 });
      const row = rows.get(key);
      row.totalMinor += bucket.amountMinor;
      row.count += 1;
      if (e.isEstimated) row.estimatedMinor += bucket.amountMinor;
      for (const h of bucket.holders) if (!row.holders.includes(h)) row.holders.push(h);
      if (!row.currency && e.currency) row.currency = e.currency;
    }
  }
  return [...rows.values()].sort((a, b) => b.totalMinor - a.totalMinor);
}

/** How the creditor paid for a bill (falls back to the bill's own method). */
function sourceMethod(e, tx) {
  const payments = expensePayments(e);
  const payer = payments.find(p => p.memberId === tx?.to) || payments[0];
  return payer ? paymentMethodOf(e, payer).method : (e.paymentMethod || 'cash');
}

/** Which expenses a settlement transaction settles (debtor's share of each). */
export function transactionBreakdown(statement) {
  if (!statement) return [];
  return (statement.items || []).filter(i => i.role === 'share');
}

/**
 * Estimates that nobody has hosted yet ("ยังไม่ระบุเจ้าภาพ"). They are excluded
 * from balances/receipts until a payer is assigned, but must stay visible so the
 * group can decide who fronts the money.
 */
export function pendingPayerExpenses(expenses = []) {
  return (expenses || []).filter(e => e && e.payerPending && (e.status || 'active') !== 'voided');
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
 * @returns {Array<{expenseId:string,title:string,date:string,amountMinor:number,totalMinor:number,payers:Array<{memberId:string,amountMinor:number}>,currency:string|null,method:string}>}
 */
export function transactionSources(tx, expenses = []) {
  if (!tx) return [];
  const rows = [];
  for (const e of expenses) {
    if (!e || (e.status || 'active') === 'voided') continue;
    if (e.payerPending) continue;
    if (!expensePayments(e).some(p => p.memberId === tx.to && p.amountMinor > 0)) continue;
    const share = (e.allocations || []).find(a => a.memberId === tx.from);
    if (!share) continue;
    rows.push({
      expenseId: e.id,
      title: e.title || '',
      date: e.date || '',
      amountMinor: share.amountMinor || 0,
      totalMinor: Number(e.netTotalMinor) || 0,
      // All payers and what each one put in — a shared bill names everyone who paid.
      payers: expensePayments(e).map(p => ({ memberId: p.memberId, amountMinor: p.amountMinor })),
      currency: e.currency || null,
      method: sourceMethod(e, tx),
      estimated: Boolean(e.isEstimated)
    });
  }
  return rows.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}
