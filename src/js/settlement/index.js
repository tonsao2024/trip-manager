import { db, serverTimestamp } from '../firebase.js';
import { collection, doc, getDocs, addDoc, updateDoc, query, where } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { calculateSettlement } from '../utils/settlement.js';

export async function fetchSettlementData(tripId) {
  const expSnap = await getDocs(query(collection(db, `trips/${tripId}/expenses`), where('status', '!=', 'voided')));
  const memSnap = await getDocs(collection(db, `trips/${tripId}/members`));
  const expenses = expSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const members = memSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  return { expenses, members };
}

export async function recalculateAndSaveSettlement(tripId, userId) {
  const { expenses, members } = await fetchSettlementData(tripId);
  const { balances, transactions } = calculateSettlement(expenses, members);
  // Save settlement doc
  const ref = await addDoc(collection(db, `trips/${tripId}/settlements`), {
    balances,
    transactions,
    createdBy: userId,
    createdAt: serverTimestamp(),
    status: 'pending'
  });
  return { id: ref.id, balances, transactions };
}

export async function markSettlementPaid(tripId, settlementId, transactionIndex, proofUrl, userId) {
  const ref = doc(db, `trips/${tripId}/settlements`, settlementId);
  // For simplicity, we store paid status in subcollection or update array - here we use a settlementsPaid collection
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
