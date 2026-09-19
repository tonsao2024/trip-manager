import { db, serverTimestamp } from '../firebase.js';
import { collection, doc, getDocs, addDoc, query, where, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { calculateSettlement } from '../utils/settlement.js';

export async function fetchSettlementData(tripId) {
  if (!db) throw new Error('DB not ready');
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout loading settlement data - check indexes')), 12000));
  const fetchPromise = (async () => {
    try {
      // Simple queries without composite indexes - filter client-side
      const expSnap = await getDocs(query(collection(db, `trips/${tripId}/expenses`), limit(100)));
      const memSnap = await getDocs(collection(db, `trips/${tripId}/members`));
      let expenses = expSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      // Filter voided client-side
      expenses = expenses.filter(e => e.status !== 'voided');
      const members = memSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      return { expenses, members };
    } catch (e) {
      console.warn('fetchSettlementData failed', e);
      if (e.message.includes('index') || e.code === 'failed-precondition') {
        // Fallback without limit
        const expSnap = await getDocs(collection(db, `trips/${tripId}/expenses`));
        const memSnap = await getDocs(collection(db, `trips/${tripId}/members`));
        let expenses = expSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        expenses = expenses.filter(e => e.status !== 'voided');
        const members = memSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        return { expenses, members };
      }
      throw e;
    }
  })();
  return Promise.race([fetchPromise, timeout]);
}

export async function recalculateAndSaveSettlement(tripId, userId) {
  const { expenses, members } = await fetchSettlementData(tripId);
  const { balances, transactions } = calculateSettlement(expenses, members);
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
