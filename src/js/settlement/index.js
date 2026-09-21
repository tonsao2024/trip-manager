import { expensesInThb } from '../utils/currency.js';
import { db, serverTimestamp } from '../firebase.js';
import { collection, doc, getDoc, getDocs, addDoc, query, where, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { calculateSettlement } from '../utils/settlement.js';
import { fetchAllExpenses } from '../expenses/index.js';
import { listMembers } from '../members/index.js';

/**
 * Everything the settlement page needs.
 *
 * Served from the shared expense/member caches (both stale-while-revalidate), so
 * the settlement menu costs zero round trips once the trip has been opened. The
 * two queries run in parallel the first time.
 */
export async function fetchSettlementData(tripId, { fresh = false } = {}) {
  if (!db) throw new Error('DB not ready');
  const [expenses, members] = await Promise.all([
    fetchAllExpenses(tripId, { fresh }),
    listMembers(tripId, { fresh })
  ]);
  return { expenses: expenses.filter(e => e.status !== 'voided'), members };
}

export async function recalculateAndSaveSettlement(tripId, userId) {
  const { expenses, members } = await fetchSettlementData(tripId);
  const trip = (await getDoc(doc(db, 'trips', tripId))).data();
  const { balances, transactions } = calculateSettlement(expensesInThb(expenses, trip), members);
  const ref = await addDoc(collection(db, `trips/${tripId}/settlements`), {
    balances,
    transactions,
    currency: 'THB',
    createdBy: userId,
    createdAt: serverTimestamp(),
    status: 'pending'
  });
  return { id: ref.id, balances, transactions };
}

export async function markSettlementPaid(tripId, settlementId, transactionIndex, proofUrl, userId) {
  await addDoc(collection(db, `trips/${tripId}/settlements/${settlementId}/payments`), {
    transactionIndex,
    proofUrl: proofUrl || '',
    paidAt: serverTimestamp(),
    paidBy: userId
  });
}

export async function fetchSettlements(tripId) {
  const snap = await getDocs(collection(db, `trips/${tripId}/settlements`));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
