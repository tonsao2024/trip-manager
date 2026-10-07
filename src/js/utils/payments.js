/** New expenses store payments; legacy single-payer expenses remain readable. */
export function expensePayments(expense = {}) {
  // An estimate with no volunteer yet is intentionally outside the debt ledger.
  // Ignore any stale legacy payer fields until the host is assigned explicitly.
  if (expense.payerPending) return [];
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

/**
 * Validate payer state for an expense. Estimates may explicitly remain
 * unassigned; they must have no payments and do not enter anyone's balance.
 */
export function validateExpensePayerState(totalMinor, payments, { payerPending = false, isEstimated = false } = {}) {
  if (!payerPending) return validatePayments(totalMinor, payments);
  return isEstimated === true
    && Number.isSafeInteger(totalMinor)
    && totalMinor > 0
    && Array.isArray(payments)
    && payments.length === 0;
}
