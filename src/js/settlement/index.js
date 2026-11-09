import { db } from '../firebase.js';
import { collection, getDocs, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { fetchAllExpenses } from '../expenses/index.js';
import { listMembers } from '../members/index.js';

export async function fetchSettlementData(tripId, { fresh = false } = {}) {
  if (!db) throw new Error('DB not ready');
  const [expenses, members, transfers] = await Promise.all([
    fetchAllExpenses(tripId, { fresh }), listMembers(tripId, { fresh }), listTransfers(tripId)
  ]);
  return { expenses: expenses.filter(e => e.status !== 'voided'), members, transfers };
}

export async function listTransfers(tripId) {
  if (!db) return [];
  try {
    const snap = await getDocs(query(collection(db, `trips/${tripId}/transfers`), orderBy('createdAt', 'desc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn('[Settlement] transfers unavailable', err?.message);
    throw err;
  }
}

export { recordTransfer, deleteTransfer } from './transfers.js';
