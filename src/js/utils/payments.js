/** New expenses store payments; legacy single-payer expenses remain readable. */
export function expensePayments(expense = {}) {
  // An estimate with no volunteer yet is intentionally outside the debt ledger.
  // Ignore any stale legacy payer fields until the host is assigned explicitly.
  if (expense.payerPending) return [];
  if (expense.payments?.length) return expense.payments;
  const memberId = expense.payerId || expense.paidBy;
  return memberId ? [{ memberId, amountMinor: Number(expense.netTotalMinor) || 0 }] : [];
}

/**
 * Payers selected when opening the expense form.
 *
 * Saved payment data always wins (editing must not silently rewrite a bill).
 * For a new expense, default to the signed-in trip member rather than the first
 * member in the list — that first entry is commonly the trip owner/admin, which
 * used to attribute every member-created expense to the admin by accident.
 */
export function initialExpensePayerIds(expense = {}, members = [], currentUserId = '') {
  if (expense.payerPending) return [];

  const savedPayments = expensePayments(expense);
  if (savedPayments.length) {
    return [...new Set(savedPayments.map(p => p?.memberId).filter(Boolean).map(String))];
  }

  const uid = String(currentUserId || '');
  const currentMember = members.find(m =>
    String(m?.id || '') === uid || String(m?.uid || '') === uid || String(m?.authUid || '') === uid
  );
  const fallback = currentMember || members[0];
  const payerId = fallback?.id || fallback?.uid || uid;
  return payerId ? [String(payerId)] : [];
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

/**
 * How one payer paid: cash, card or transfer, and the card if it was a card. A
 * payment without its own method (every record saved before v25) inherits the
 * bill's, so older expenses keep meaning what they meant.
 */
export function paymentMethodOf(expense = {}, payment = {}) {
  const method = ['cash', 'card', 'transfer'].includes(payment.paymentMethod)
    ? payment.paymentMethod
    : (['cash', 'card', 'transfer'].includes(expense.paymentMethod) ? expense.paymentMethod : 'cash');
  if (method !== 'card') return { method, cardName: '' };
  const cardName = String(payment.cardName ?? expense.cardName ?? '').trim();
  return { method, cardName };
}
