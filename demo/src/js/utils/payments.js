/** New expenses store payments; legacy single-payer expenses remain readable. */
export function expensePayments(expense = {}) {
  if (expense.payments?.length) return expense.payments;
  const memberId = expense.payerId || expense.paidBy;
  return memberId ? [{ memberId, amountMinor: Number(expense.netTotalMinor) || 0 }] : [];
}

export function validatePayments(totalMinor, payments) {
  return Number.isSafeInteger(totalMinor) && totalMinor > 0 && payments?.length > 0
    && new Set(payments.map(p => p.memberId)).size === payments.length
    && payments.every(p => p.memberId && Number.isSafeInteger(p.amountMinor) && p.amountMinor >= 0)
    && payments.reduce((sum, p) => sum + p.amountMinor, 0) === totalMinor;
}
