import { db, serverTimestamp } from '../firebase.js';
import { collection, deleteDoc, doc, addDoc, getDocs, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { fetchAllExpenses } from '../expenses/index.js';
import { listMembers } from '../members/index.js';

/**
 * Everything the settlement page needs: expenses, members and the transfers that
 * were already marked as paid. Served from the shared caches where they exist.
 */
export async function fetchSettlementData(tripId, { fresh = false } = {}) {
  if (!db) throw new Error('DB not ready');
  const [expenses, members, transfers] = await Promise.all([
    fetchAllExpenses(tripId, { fresh }),
    listMembers(tripId, { fresh }),
    listTransfers(tripId)
  ]);
  return { expenses: expenses.filter(e => e.status !== 'voided'), members, transfers };
}

/** Transfers recorded as paid, newest first. */
export async function listTransfers(tripId) {
  if (!db) return [];
  try {
    const snap = await getDocs(query(collection(db, `trips/${tripId}/transfers`), orderBy('createdAt', 'desc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (err) {
    // Before the new rules are published the read is denied; the page still loads without the list.
    console.warn('[Settlement] transfers unavailable', err?.message);
    return [];
  }
}

/** Records money actually sent (“จ่ายแล้ว”). Amounts are in THB minor units, like the settlement. */
export async function recordTransfer(tripId, { fromId, toId, amountMinor, date = '', note = '' }, userId = null) {
  const amount = Math.round(Number(amountMinor));
  if (!fromId || !toId || fromId === toId) throw new Error('Choose two different people');
  if (!(amount > 0)) throw new Error('Amount must be more than zero');
  const ref = await addDoc(collection(db, `trips/${tripId}/transfers`), {
    fromId,
    toId,
    amountMinor: amount,
    currency: 'THB',
    date: String(date || '').slice(0, 10),
    note: String(note || '').trim().slice(0, 120),
    createdBy: userId || null,
    createdAt: serverTimestamp()
  });
  return ref.id;
}

/** Undo a recorded transfer. */
export async function deleteTransfer(tripId, transferId) {
  await deleteDoc(doc(db, `trips/${tripId}/transfers/${transferId}`));
}
