import { db, serverTimestamp } from '../firebase.js';
import { collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit, startAfter, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { calculateNetTotal } from '../utils/currency.js';
import { validateAllocations } from '../utils/split.js';

export function subscribeExpenses(tripId, cb) {
  if (!db) return () => {};
  const q = query(collection(db, `trips/${tripId}/expenses`), where('status', '!=', 'voided'), orderBy('status'), orderBy('date', 'desc'));
  return onSnapshot(q, snap => {
    cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }, err => console.warn(err));
}

export async function fetchExpenses(tripId, { filters = {}, pageSize = 20, lastDoc = null } = {}) {
  if (!db) throw new Error('DB not ready');
  
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout loading expenses')), 8000));
  
  const fetchPromise = (async () => {
    let q = collection(db, `trips/${tripId}/expenses`);
    let constraints = [where('status', '!=', 'voided'), orderBy('status'), orderBy('date', 'desc'), limit(pageSize)];
    if (filters.category) constraints.unshift(where('category', '==', filters.category));
    if (filters.payerId) constraints.unshift(where('payerId', '==', filters.payerId));
    if (filters.currency) constraints.unshift(where('currency', '==', filters.currency));
    let queryRef = query(q, ...constraints);
    if (lastDoc) queryRef = query(q, ...constraints, startAfter(lastDoc));
    const snap = await getDocs(queryRef);
    return { items: snap.docs.map(d => ({ id: d.id, ...d.data() })), lastDoc: snap.docs[snap.docs.length -1] || null };
  })();
  
  return Promise.race([fetchPromise, timeout]);
}

export async function addExpense(tripId, data, userId) {
  // Validate allocations
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
    createdBy: userId,
    updatedBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };
  const ref = await addDoc(collection(db, `trips/${tripId}/expenses`), payload);
  // Add line items if itemized
  if (data.lineItems?.length) {
    for (const line of data.lineItems) {
      await addDoc(collection(db, `trips/${tripId}/expenses/${ref.id}/lineItems`), line);
    }
  }
  return ref.id;
}

export async function updateExpense(tripId, expenseId, updates, userId) {
  const ref = doc(db, `trips/${tripId}/expenses`, expenseId);
  // If updating amounts, recalc net
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
