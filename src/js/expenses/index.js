import { db, serverTimestamp } from '../firebase.js';
import { collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit, startAfter, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { calculateNetTotal } from '../utils/currency.js';
import { validateAllocations } from '../utils/split.js';

export function subscribeExpenses(tripId, cb) {
  if (!db) return () => {};
  // Simple query to avoid index requirement - filter voided client-side
  const q = query(collection(db, `trips/${tripId}/expenses`), orderBy('date', 'desc'), limit(50));
  return onSnapshot(q, snap => {
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const filtered = all.filter(e => e.status !== 'voided');
    cb(filtered);
  }, err => console.warn('subscribeExpenses error', err));
}

export async function fetchExpenses(tripId, { filters = {}, pageSize = 20, lastDoc = null } = {}) {
  if (!db) throw new Error('DB not ready');
  
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout loading expenses - check Firestore indexes')), 10000));
  
  const fetchPromise = (async () => {
    try {
      // Try simple query first - no composite index needed
      let q = collection(db, `trips/${tripId}/expenses`);
      let queryRef;
      
      if (lastDoc) {
        queryRef = query(q, orderBy('date', 'desc'), startAfter(lastDoc), limit(pageSize));
      } else {
        queryRef = query(q, orderBy('date', 'desc'), limit(pageSize));
      }
      
      const snap = await getDocs(queryRef);
      let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Filter voided client-side to avoid != index
      items = items.filter(e => e.status !== 'voided');
      
      // Apply filters client-side to avoid composite indexes
      if (filters.category) {
        items = items.filter(e => e.category === filters.category);
      }
      if (filters.payerId) {
        items = items.filter(e => e.payerId === filters.payerId);
      }
      if (filters.currency) {
        items = items.filter(e => e.currency === filters.currency);
      }
      
      return { items, lastDoc: snap.docs[snap.docs.length -1] || null };
    } catch (e) {
      // If orderBy date fails (no index), fallback to no order
      if (e.message.includes('index') || e.code === 'failed-precondition') {
        console.warn('Expenses index missing, trying fallback without orderBy', e.message);
        const snap = await getDocs(query(collection(db, `trips/${tripId}/expenses`), limit(pageSize)));
        let items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        items = items.filter(e => e.status !== 'voided');
        // Sort client-side
        items.sort((a, b) => new Date(b.date) - new Date(a.date));
        return { items, lastDoc: null };
      }
      throw e;
    }
  })();
  
  return Promise.race([fetchPromise, timeout]);
}

export async function addExpense(tripId, data, userId) {
  if (!db) throw new Error('DB not ready');
  if (!userId) throw new Error('User not authenticated');
  
  const net = calculateNetTotal({
    subtotalMinor: data.subtotalMinor,
    discountMinor: data.discountMinor || 0,
    serviceMinor: data.serviceMinor || 0,
    taxMinor: data.taxMinor || 0,
    cardFeeMinor: data.cardFeeMinor || 0,
    cardFeePercent: data.cardFeePercent || 0
  });
  const valid = validateAllocations(net, data.allocations);
  if (!valid.valid) throw new Error(valid.error);

  const payload = {
    title: data.title,
    description: data.description || '',
    date: data.date,
    category: data.category || 'general',
    payerId: data.payerId,
    allocations: data.allocations,
    subtotalMinor: data.subtotalMinor,
    discountMinor: data.discountMinor || 0,
    serviceMinor: data.serviceMinor || 0,
    taxMinor: data.taxMinor || 0,
    cardFeeMinor: data.cardFeeMinor || 0,
    cardFeePercent: data.cardFeePercent || 0,
    netTotalMinor: net,
    currency: data.currency || 'THB',
    exchangeRate: data.exchangeRate || 1,
    baseCurrency: data.baseCurrency || 'THB',
    convertedMinor: data.convertedMinor || net,
    paymentMethod: data.paymentMethod || 'cash',
    cardId: data.cardId || null,
    itineraryItemId: data.itineraryItemId || null,
    receiptUrl: data.receiptUrl || '',
    status: 'active',
    // New fields for estimated vs actual, budget
    isEstimated: data.isEstimated || false,
    estimatedMinor: data.estimatedMinor || 0,
    actualMinor: data.actualMinor || net,
    budgetCategory: data.budgetCategory || '',
    // Exchange rate to THB
    thbRate: data.thbRate || 1,
    thbMinor: data.thbMinor || net,
    createdBy: userId,
    updatedBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  const ref = await addDoc(collection(db, `trips/${tripId}/expenses`), payload);
  if (data.lineItems?.length) {
    for (const line of data.lineItems) {
      await addDoc(collection(db, `trips/${tripId}/expenses/${ref.id}/lineItems`), line);
    }
  }
  return ref.id;
}

export async function updateExpense(tripId, expenseId, updates, userId) {
  const ref = doc(db, `trips/${tripId}/expenses`, expenseId);
  if (updates.subtotalMinor != null) {
    const snap = await getDoc(ref);
    const existing = snap.data();
    const merged = { ...existing, ...updates };
    merged.netTotalMinor = calculateNetTotal({
      subtotalMinor: merged.subtotalMinor,
      discountMinor: merged.discountMinor,
      serviceMinor: merged.serviceMinor,
      taxMinor: merged.taxMinor,
      cardFeeMinor: merged.cardFeeMinor,
      cardFeePercent: merged.cardFeePercent
    });
    if (merged.allocations) {
      const v = validateAllocations(merged.netTotalMinor, merged.allocations);
      if (!v.valid) throw new Error(v.error);
    }
    updates.netTotalMinor = merged.netTotalMinor;
  }
  await updateDoc(ref, { ...updates, updatedBy: userId, updatedAt: serverTimestamp() });
}

export async function voidExpense(tripId, expenseId, userId) {
  await updateDoc(doc(db, `trips/${tripId}/expenses`, expenseId), {
    status: 'voided',
    updatedBy: userId,
    updatedAt: serverTimestamp()
  });
}

// Export/import expenses
export async function exportExpensesToJson(tripId) {
  const snap = await getDocs(collection(db, `trips/${tripId}/expenses`));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function importExpensesFromJson(tripId, expenses, userId) {
  const { writeBatch } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  const batch = writeBatch(db);
  for (const exp of expenses) {
    const ref = doc(collection(db, `trips/${tripId}/expenses`));
    const { id, ...data } = exp;
    batch.set(ref, { ...data, createdBy: userId, updatedBy: userId, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  }
  await batch.commit();
}
