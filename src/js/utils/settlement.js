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
