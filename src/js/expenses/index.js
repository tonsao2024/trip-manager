import { db, serverTimestamp } from '../firebase.js';
import { collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, limit, startAfter, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { calculateNetTotal, getCurrencyDecimals, toMinor } from '../utils/currency.js';
import { validateAllocations } from '../utils/split.js';
import { normalizeCategory } from '../utils/categories.js';
import { cachedRead, cacheInvalidate, cacheForget } from '../utils/datacache.js';

export function subscribeExpenses(tripId, cb) {
  if (!db) return () => {};
  const q = query(collection(db, `trips/${tripId}/expenses`), orderBy('date', 'desc'), limit(50));
  return onSnapshot(q, snap => {
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    cb(all.filter(e => e.status !== 'voided'));
  }, err => console.warn('subscribeExpenses error', err));
}

/** Every expense of the trip, cached per trip (stale-while-revalidate). */
async function loadAllExpensesUncached(tripId) {
  const snap = await getDocs(query(collection(db, `trips/${tripId}/expenses`), limit(500)));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(e => e.status !== 'voided')
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}

export async function fetchExpenses(tripId, { filters = {}, pageSize = 20, lastDoc = null } = {}) {
  if (!db) throw new Error('DB not ready');
  // No cursor → serve from the cached trip list, so switching to the expenses
  // menu does not cost a round trip. Later pages still come from the server.
  if (!lastDoc) {
    const all = await fetchAllExpenses(tripId);
    return { items: applyFilters(all, filters).slice(0, pageSize), lastDoc: null, fromCache: true };
  }
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout loading expenses - check Firestore indexes')), 12000));

  const fetchPromise = (async () => {
    try {
      const col = collection(db, `trips/${tripId}/expenses`);
      const queryRef = lastDoc
        ? query(col, orderBy('date', 'desc'), startAfter(lastDoc), limit(pageSize))
        : query(col, orderBy('date', 'desc'), limit(pageSize));
      const snap = await getDocs(queryRef);
      let items = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.status !== 'voided');
      items = applyFilters(items, filters);
      return { items, lastDoc: snap.docs[snap.docs.length - 1] || null };
    } catch (e) {
      if (/index/i.test(e.message || '') || e.code === 'failed-precondition') {
        console.warn('Expenses index missing, falling back without orderBy', e.message);
        const snap = await getDocs(query(collection(db, `trips/${tripId}/expenses`), limit(200)));
        let items = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.status !== 'voided');
        items.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
        items = applyFilters(items, filters);
        return { items, lastDoc: null };
      }
      throw e;
    }
  })();

  return Promise.race([fetchPromise, timeout]);
}

function applyFilters(items, filters = {}) {
  let out = items;
  if (filters.category) out = out.filter(e => e.category === filters.category);
  if (filters.payerId) out = out.filter(e => e.payerId === filters.payerId);
  if (filters.currency) out = out.filter(e => e.currency === filters.currency);
  if (filters.kind === 'estimated') out = out.filter(e => e.isEstimated);
  if (filters.kind === 'actual') out = out.filter(e => !e.isEstimated);
  return out;
}

/** Every expense of the trip (used by exports / dashboard summaries). */
export async function fetchAllExpenses(tripId, { max = 500, fresh = false } = {}) {
  if (!db) throw new Error('DB not ready');
  const key = `exps:${tripId}`;
  if (fresh) cacheForget(key);
  return cachedRead(key, () => loadAllExpensesUncached(tripId), { maxAgeMs: 60 * 1000 }).then(list => (
    max && list.length > max ? list.slice(0, max) : list
  ));
}

export async function getExpense(tripId, expenseId) {
  const cached = await fetchAllExpenses(tripId).catch(() => null);
  const hit = cached?.find(e => e.id === expenseId);
  if (hit) return hit;
  const snap = await getDoc(doc(db, `trips/${tripId}/expenses`, expenseId));
  if (!snap.exists()) throw new Error('ไม่พบรายการค่าใช้จ่ายนี้');
  return { id: snap.id, ...snap.data() };
}

function buildPayload(data) {
  const decimals = getCurrencyDecimals(data.currency || 'THB');
  const currency = data.currency || 'THB';
  const rate = Number(data.thbRate) > 0 ? Number(data.thbRate) : 1;
  return {
    title: data.title,
    description: data.description || '',
    date: data.date,
    category: normalizeCategory(data.category),
    payerId: data.payerId,
    allocations: data.allocations,
    subtotalMinor: data.subtotalMinor,
    discountMinor: data.discountMinor || 0,
    serviceMinor: data.serviceMinor || 0,
    taxMinor: data.taxMinor || 0,
    cardFeeMinor: data.cardFeeMinor || 0,
    cardFeePercent: data.cardFeePercent || 0,
    netTotalMinor: data.netTotalMinor,
    currency,
    exchangeRate: rate,
    baseCurrency: data.baseCurrency || 'THB',
    convertedMinor: data.convertedMinor ?? data.netTotalMinor,
    paymentMethod: data.paymentMethod || 'cash',
    // Which card was used — the settlement groups spending per card.
    cardName: String(data.cardName || '').trim(),
    cardId: data.cardId || null,
    itineraryItemId: data.itineraryItemId || null,
    receiptUrl: data.receiptUrl || '',
    // Optional receipt photo (Storage URL or an inlined data-URL image).
    receiptImage: data.receiptImage || '',
    receiptStorage: data.receiptStorage || '',
    receiptNames: data.receiptNames || [],
    status: data.status || 'active',
    isEstimated: !!data.isEstimated,
    estimatedMinor: data.isEstimated ? (data.netTotalMinor || 0) : 0,
    actualMinor: data.isEstimated ? 0 : (data.netTotalMinor || 0),
    budgetCategory: data.budgetCategory || data.category || '',
    thbRate: rate,
    thbMinor: Math.round((data.netTotalMinor || 0) * rate),
    notes: data.notes || '',
    source: data.source || 'manual',
    _decimals: decimals,
    _currency: currency
  };
}

export async function addExpense(tripId, data, userId) {
  if (!db) throw new Error('DB not ready');
  if (!userId) throw new Error('User not authenticated');

  const net = data.netTotalMinor != null && data.netTotalMinor > 0
    ? data.netTotalMinor
    : calculateNetTotal({
      subtotalMinor: data.subtotalMinor,
      discountMinor: data.discountMinor || 0,
      serviceMinor: data.serviceMinor || 0,
      taxMinor: data.taxMinor || 0,
      cardFeeMinor: data.cardFeeMinor || 0,
      cardFeePercent: data.cardFeePercent || 0
    });
  if (!net) throw new Error('ยอดรวมต้องมากกว่า 0');
  const valid = validateAllocations(net, data.allocations);
  if (!valid.valid) throw new Error(valid.error);

  const payload = buildPayload({ ...data, netTotalMinor: net });
  delete payload._decimals; delete payload._currency;
  const ref = await addDoc(collection(db, `trips/${tripId}/expenses`), {
    ...payload,
    createdBy: userId,
    updatedBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    version: 1
  });
  if (data.lineItems?.length) {
    for (const line of data.lineItems) {
      await addDoc(collection(db, `trips/${tripId}/expenses/${ref.id}/lineItems`), line);
    }
  }
  invalidateExpenses(tripId);
  return ref.id;
}

export async function updateExpense(tripId, expenseId, updates, userId) {
  const ref = doc(db, `trips/${tripId}/expenses`, expenseId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('ไม่พบรายการนี้');
  const existing = snap.data();
  const merged = { ...existing, ...updates };
  const decimals = getCurrencyDecimals(merged.currency || 'THB');
  merged.netTotalMinor = merged.netTotalMinor != null && updates.netTotalMinor != null
    ? merged.netTotalMinor
    : calculateNetTotal({
      subtotalMinor: merged.subtotalMinor || 0,
      discountMinor: merged.discountMinor || 0,
      serviceMinor: merged.serviceMinor || 0,
      taxMinor: merged.taxMinor || 0,
      cardFeeMinor: merged.cardFeeMinor || 0,
      cardFeePercent: merged.cardFeePercent || 0
    });
  if (merged.allocations) {
    const v = validateAllocations(merged.netTotalMinor, merged.allocations);
    if (!v.valid) throw new Error(v.error);
  }
  const rate = Number(merged.thbRate) > 0 ? Number(merged.thbRate) : 1;
  const payload = {
    ...updates,
    netTotalMinor: merged.netTotalMinor,
    category: normalizeCategory(merged.category),
    thbRate: rate,
    thbMinor: Math.round(merged.netTotalMinor * rate),
    estimatedMinor: merged.isEstimated ? merged.netTotalMinor : 0,
    actualMinor: merged.isEstimated ? 0 : merged.netTotalMinor,
    updatedBy: userId,
    updatedAt: serverTimestamp(),
    version: (merged.version || 0) + 1,
    _decimals: decimals
  };
  delete payload._decimals;
  await updateDoc(ref, payload);
  invalidateExpenses(tripId);
  return merged.netTotalMinor;
}

function invalidateExpenses(tripId) {
  cacheForget(`exps:${tripId}`);
}

/**
 * Drop the cached expense list for a trip. Used by the itinerary module too —
 * saving a place can create/update/remove its linked estimate expense.
 */
export function invalidateExpensesCache(tripId) {
  invalidateExpenses(tripId);
}

/** Soft delete — keeps history/audit intact (works with the current rules). */
export async function voidExpense(tripId, expenseId, userId) {
  await updateDoc(doc(db, `trips/${tripId}/expenses`, expenseId), {
    status: 'voided',
    voidedAt: serverTimestamp(),
    updatedBy: userId,
    updatedAt: serverTimestamp()
  });
  invalidateExpenses(tripId);
}

/**
 * Delete an expense. Tries a hard delete first; if the deployed rules still
 * forbid it, falls back to voiding so the UI always succeeds.
 * @returns {'deleted'|'voided'}
 */
export async function deleteExpense(tripId, expenseId, userId) {
  const ref = doc(db, `trips/${tripId}/expenses`, expenseId);
  // Best-effort cleanup of line items
  try {
    const lines = await getDocs(collection(db, `trips/${tripId}/expenses/${expenseId}/lineItems`));
    for (const l of lines.docs) { try { await deleteDoc(l.ref); } catch {} }
  } catch {}
  try {
    await deleteDoc(ref);
    invalidateExpenses(tripId);
    return 'deleted';
  } catch (e) {
    console.warn('[Expenses] hard delete blocked, voiding instead:', e?.code || e?.message);
    await voidExpense(tripId, expenseId, userId);
    return 'voided';
  }
}

/* ---------------- Backwards compatible helpers ---------------- */

export async function exportExpensesToJson(tripId) {
  const snap = await getDocs(collection(db, `trips/${tripId}/expenses`));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function importExpensesFromJson(tripId, expenses, userId) {
  const { writeBatch } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  const batch = writeBatch(db);
  let count = 0;
  for (const exp of expenses) {
    const { id, _row, ...data } = exp;
    const ref = doc(collection(db, `trips/${tripId}/expenses`));
    const net = data.netTotalMinor || calculateNetTotal({
      subtotalMinor: data.subtotalMinor || 0,
      discountMinor: data.discountMinor || 0,
      serviceMinor: data.serviceMinor || 0,
      taxMinor: data.taxMinor || 0
    });
    const rate = Number(data.thbRate) > 0 ? Number(data.thbRate) : 1;
    batch.set(ref, {
      ...data,
      category: normalizeCategory(data.category),
      netTotalMinor: net,
      thbRate: rate,
      thbMinor: Math.round(net * rate),
      status: data.status || 'active',
      isEstimated: !!data.isEstimated,
      createdBy: userId,
      updatedBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      version: 1,
      source: data.source || 'import'
    });
    count++;
    if (count % 400 === 0) await batch.commit();
  }
  await batch.commit();
  invalidateExpenses(tripId);
  return expenses.length;
}

export function sumExpenses(expenses = [], { estimatedOnly = null } = {}) {
  return expenses.reduce((sum, e) => {
    if (estimatedOnly === true && !e.isEstimated) return sum;
    if (estimatedOnly === false && e.isEstimated) return sum;
    return sum + (e.netTotalMinor || 0);
  }, 0);
}

export function amountToMinorFor(amount, currency = 'THB') {
  return toMinor(amount, getCurrencyDecimals(currency));
}

/** Bulk create expenses (Excel/CSV/JSON import). */
export async function bulkCreateExpenses(tripId, expenses, userId, { onProgress } = {}) {
  if (!expenses?.length) return 0;
  const { writeBatch } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  let batch = writeBatch(db);
  let n = 0;
  for (const exp of expenses) {
    const { _row, id, _decimals, _currency, ...data } = exp;
    const ref = doc(collection(db, `trips/${tripId}/expenses`));
    const net = data.netTotalMinor || calculateNetTotal({
      subtotalMinor: data.subtotalMinor || 0,
      discountMinor: data.discountMinor || 0,
      serviceMinor: data.serviceMinor || 0,
      taxMinor: data.taxMinor || 0
    });
    const rate = Number(data.thbRate) > 0 ? Number(data.thbRate) : 1;
    batch.set(ref, {
      ...data,
      category: normalizeCategory(data.category),
      netTotalMinor: net,
      thbRate: rate,
      thbMinor: Math.round(net * rate),
      status: 'active',
      isEstimated: !!data.isEstimated,
      createdBy: userId,
      updatedBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      version: 1,
      source: 'import'
    });
    n++;
    if (n % 400 === 0) { await batch.commit(); batch = writeBatch(db); }
    onProgress?.(n, expenses.length);
  }
  if (n % 400 !== 0) await batch.commit();
  invalidateExpenses(tripId);
  return n;
}
