import { db, serverTimestamp } from '../firebase.js';
import { collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc, writeBatch, query, where, orderBy, limit, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { recalculateSchedule, detectOverlaps, validateItineraryItem } from '../utils/scheduling.js';
import { dayjs } from '../utils/date.js';
import { toMinor, getCurrencyDecimals, calculateNetTotal } from '../utils/currency.js';
import { splitEqual } from '../utils/split.js';

/* ------------------------------------------------------------------ *
 * Estimate → expense bridging (item cost flows into the expense book)
 * ------------------------------------------------------------------ */

export const ESTIMATE_CATEGORY_IDS = ['stay', 'ticket', 'transport', 'food', 'activity', 'shopping', 'insurance', 'fee', 'general'];

function normalizeCoordString(value) {
  if (!value) return '';
  if (typeof value === 'object' && value.lat != null) return `${value.lat},${value.lng}`;
  return String(value).trim();
}

/** Find an expense that was auto-created from this itinerary item. */
export async function findLinkedExpense(tripId, itemId) {
  if (!db || !itemId) return null;
  try {
    const q = query(collection(db, `trips/${tripId}/expenses`), where('itineraryItemId', '==', itemId), limit(5));
    const snap = await getDocs(q);
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return docs.find(e => e.source === 'itinerary-estimate') || docs[0] || null;
  } catch (e) {
    console.warn('[Itinerary] linked expense lookup failed', e?.message);
    return null;
  }
}

export function buildEstimateExpensePayload(item, { trip = null, payerId = null, members = [] } = {}) {
  const currency = item.estimateCurrency || trip?.baseCurrency || 'THB';
  const decimals = getCurrencyDecimals(currency);
  const amountMinor = item.estimateMinor != null && !item.estimateAmount
    ? Math.round(item.estimateMinor)
    : toMinor(item.estimateAmount || 0, decimals);
  const shareIds = (item.estimateShareWith && item.estimateShareWith.length)
    ? item.estimateShareWith
    : (members.length ? members.map(m => m.id) : []);
  const finalPayer = payerId || item.estimatePayerId || shareIds[0] || null;
  const targets = shareIds.length ? shareIds : (finalPayer ? [finalPayer] : []);
  const allocations = targets.length ? splitEqual(amountMinor, targets) : [];
  const thbRate = Number(trip?.exchangeRateToTHB) > 0 ? Number(trip.exchangeRateToTHB) : 1;
  const netTotalMinor = calculateNetTotal({ subtotalMinor: amountMinor });
  return {
    title: item.title || 'ประมาณการ',
    description: item.description || (item.address ? `ประมาณการจากแผน: ${item.address}` : 'ประมาณการจากแผนการเดินทาง'),
    date: item.date,
    category: item.estimateCategory || 'general',
    payerId: finalPayer,
    allocations,
    subtotalMinor: netTotalMinor,
    discountMinor: 0,
    serviceMinor: 0,
    taxMinor: 0,
    cardFeeMinor: 0,
    cardFeePercent: 0,
    netTotalMinor,
    currency,
    exchangeRate: thbRate,
    baseCurrency: trip?.baseCurrency || 'THB',
    convertedMinor: Math.round(netTotalMinor * thbRate),
    paymentMethod: 'cash',
    cardId: null,
    itineraryItemId: item.id || null,
    receiptUrl: '',
    status: 'active',
    isEstimated: true,
    estimatedMinor: netTotalMinor,
    actualMinor: 0,
    budgetCategory: item.estimateCategory || 'general',
    thbRate,
    thbMinor: Math.round(netTotalMinor * thbRate),
    source: 'itinerary-estimate',
    notes: item.notes || ''
  };
}

/**
 * Create / update / remove the estimated expense linked to an itinerary item.
 * This is what makes itinerary costs show up automatically in the expense book.
 */
export async function syncItineraryExpense(tripId, item, options = {}) {
  if (!db) return null;
  const { userId, trip = null, members = [], remove = false } = options;
  const existing = await findLinkedExpense(tripId, item.id);

  const hasEstimate = !remove && Number(item.estimateAmount) > 0;
  if (!hasEstimate) {
    if (existing) {
      try { await deleteDoc(doc(db, `trips/${tripId}/expenses`, existing.id)); }
      catch (e) {
        console.warn('[Itinerary] could not delete linked estimate, voiding instead', e?.message);
        try { await updateDoc(doc(db, `trips/${tripId}/expenses`, existing.id), { status: 'voided', updatedBy: userId, updatedAt: serverTimestamp() }); } catch {}
      }
    }
    return null;
  }

  const payload = buildEstimateExpensePayload({ ...item }, { trip, payerId: item.estimatePayerId, members });
  if (existing) {
    await updateDoc(doc(db, `trips/${tripId}/expenses`, existing.id), {
      ...payload,
      createdBy: existing.createdBy || userId,
      updatedBy: userId,
      updatedAt: serverTimestamp()
    });
    return existing.id;
  }
  const ref = await addDoc(collection(db, `trips/${tripId}/expenses`), {
    ...payload,
    createdBy: userId,
    updatedBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

/* ------------------------------------------------------------------ *
 * Realtime / fetch
 * ------------------------------------------------------------------ */

function mapDoc(d) {
  const data = d.data();
  return {
    id: d.id,
    ...data,
    startAt: data.startAt?.toDate?.() || data.startAt,
    endAt: data.endAt?.toDate?.() || data.endAt
  };
}

export function subscribeItinerary(tripId, day, callback) {
  if (!db) return () => {};
  let q = query(collection(db, `trips/${tripId}/itineraryItems`), orderBy('order', 'asc'));
  if (day) q = query(collection(db, `trips/${tripId}/itineraryItems`), where('date', '==', day), orderBy('order', 'asc'));
  return onSnapshot(q, snap => callback(snap.docs.map(mapDoc)), err => console.warn('subscribeItinerary error', err));
}

export async function fetchItinerary(tripId, dateStr = null) {
  if (!db) throw new Error('DB not ready');
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout loading itinerary')), 12000));
  const fetchPromise = (async () => {
    try {
      let q = query(collection(db, `trips/${tripId}/itineraryItems`), orderBy('order', 'asc'));
      if (dateStr) q = query(collection(db, `trips/${tripId}/itineraryItems`), where('date', '==', dateStr), orderBy('order', 'asc'));
      const snap = await getDocs(q);
      return snap.docs.map(mapDoc);
    } catch (e) {
      if (e?.code === 'failed-precondition' || /index/i.test(e?.message || '')) {
        const snap = await getDocs(collection(db, `trips/${tripId}/itineraryItems`));
        let items = snap.docs.map(mapDoc);
        if (dateStr) items = items.filter(i => i.date === dateStr);
        return items.sort((a, b) => (a.order || 0) - (b.order || 0));
      }
      throw e;
    }
  })();
  return Promise.race([fetchPromise, timeout]);
}

export async function getItineraryItem(tripId, itemId) {
  const snap = await getDoc(doc(db, `trips/${tripId}/itineraryItems`, itemId));
  if (!snap.exists()) throw new Error('ไม่พบแผนนี้');
  return mapDoc(snap);
}

/* ------------------------------------------------------------------ *
 * Create / update / delete
 * ------------------------------------------------------------------ */

export async function addItineraryItem(tripId, data, userId) {
  const validation = validateItineraryItem(data);
  if (!validation.valid) throw new Error(validation.errors.join(', '));
  const existing = await fetchItinerary(tripId, data.date);
  const maxOrder = existing.reduce((m, i) => Math.max(m, i.order || 0), -1);
  const duration = Number(data.durationMinutes) || 60;
  const payload = {
    title: data.title,
    description: data.description || '',
    date: data.date,
    startAt: data.startAt,
    durationMinutes: duration,
    travelToNextMinutes: data.travelToNextMinutes || 0,
    endAt: dayjs(data.startAt).add(duration, 'minute').toDate(),
    order: maxOrder + 1,
    category: data.category || 'general',
    address: data.address || '',
    coordinates: normalizeCoordString(data.coordinates),
    googleMapsUrl: data.googleMapsUrl || '',
    imageUrl: data.imageUrl || '',
    imageUrls: data.imageUrls || [],
    notes: data.notes || '',
    status: data.status || 'planned',
    expenseId: data.expenseId || null,
    estimateAmount: data.estimateAmount || 0,
    estimateCurrency: data.estimateCurrency || '',
    estimateCategory: data.estimateCategory || '',
    estimatePayerId: data.estimatePayerId || '',
    estimateShareWith: data.estimateShareWith || [],
    estimateAutoAdd: data.estimateAutoAdd !== false,
    createdBy: userId,
    updatedBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    version: 1
  };
  const ref = await addDoc(collection(db, `trips/${tripId}/itineraryItems`), payload);
  return ref.id;
}

export async function updateItineraryItem(tripId, itemId, updates, userId) {
  const ref = doc(db, `trips/${tripId}/itineraryItems`, itemId);
  let version = updates.version;
  if (version == null) {
    try { const snap = await getDoc(ref); version = snap.data()?.version || 0; } catch { version = 0; }
  }
  const clean = { ...updates };
  delete clean.id;
  if (clean.coordinates != null) clean.coordinates = normalizeCoordString(clean.coordinates);
  if (clean.startAt && clean.durationMinutes != null) {
    clean.endAt = dayjs(clean.startAt).add(Number(clean.durationMinutes) || 0, 'minute').toDate();
  }
  await updateDoc(ref, {
    ...clean,
    updatedBy: userId,
    updatedAt: serverTimestamp(),
    version: Number(version || 0) + 1
  });
}

export async function deleteItineraryItem(tripId, itemId) {
  const item = { id: itemId };
  try {
    const snap = await getDoc(doc(db, `trips/${tripId}/itineraryItems`, itemId));
    if (snap.exists()) Object.assign(item, snap.data());
  } catch {}
  await deleteDoc(doc(db, `trips/${tripId}/itineraryItems`, itemId));
  // Remove the auto-created estimated expense as well
  try { await syncItineraryExpense(tripId, item, { remove: true }); } catch (e) { console.warn('linked estimate cleanup failed', e?.message); }
}

/** Save (create or update) + sync the linked estimated expense in one call. */
export async function saveItineraryItem(tripId, data, userId, itemId = null, { trip = null, members = [] } = {}) {
  let id = itemId;
  if (itemId) {
    await updateItineraryItem(tripId, itemId, {
      ...data,
      estimateAmount: data.estimateAmount || 0,
      estimateCurrency: data.estimateCurrency || '',
      estimateCategory: data.estimateCategory || '',
      estimatePayerId: data.estimatePayerId || '',
      estimateShareWith: data.estimateShareWith || [],
      estimateAutoAdd: data.estimateAutoAdd !== false
    }, userId);
  } else {
    id = await addItineraryItem(tripId, data, userId);
  }
  let expenseId = null;
  try {
    expenseId = await syncItineraryExpense(tripId, { ...data, id }, { userId, trip, members, remove: data.estimateAutoAdd === false || !(Number(data.estimateAmount) > 0) });
    if (expenseId) {
      try { await updateDoc(doc(db, `trips/${tripId}/itineraryItems`, id), { expenseId, updatedAt: serverTimestamp() }); } catch {}
    }
  } catch (e) {
    console.warn('[Itinerary] estimate sync failed', e?.message);
  }
  return { id, expenseId };
}

export async function batchUpdateSchedule(tripId, items, userId) {
  const batch = writeBatch(db);
  for (const item of items) {
    const ref = doc(db, `trips/${tripId}/itineraryItems`, item.id);
    batch.update(ref, {
      startAt: item.startAt,
      endAt: item.endAt,
      order: item.order,
      durationMinutes: item.durationMinutes,
      travelToNextMinutes: item.travelToNextMinutes,
      updatedBy: userId,
      updatedAt: serverTimestamp(),
      version: (item.version || 0) + 1
    });
  }
  await batch.commit();
}

export async function reorderItinerary(tripId, dateStr, newOrderIds, userId) {
  const items = await fetchItinerary(tripId, dateStr);
  const map = new Map(items.map(i => [i.id, i]));
  const reordered = newOrderIds.map((id, idx) => ({ ...map.get(id), order: idx })).filter(i => i.id);
  const recalculated = recalculateSchedule(reordered, reordered[0]?.id, {});
  const overlaps = detectOverlaps(recalculated);
  await batchUpdateSchedule(tripId, recalculated, userId);
  return { items: recalculated, overlaps };
}

export async function moveItemToDay(tripId, itemId, newDate, newOrder, userId) {
  await updateItineraryItem(tripId, itemId, { date: newDate, order: newOrder }, userId);
}

/** How many itinerary items already carry a cost estimate (dashboard stat). */
export function countEstimatedItems(items = []) {
  return items.filter(i => Number(i.estimateAmount) > 0).length;
}

/**
 * Bulk create itinerary items (Excel/CSV/JSON import).
 * Handles >450 rows by committing in batches.
 */
export async function bulkCreateItineraryItems(tripId, items, userId, { onProgress } = {}) {
  if (!items?.length) return { created: 0, expenseIds: [] };
  const { writeBatch } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  let batch = writeBatch(db);
  let n = 0;
  let created = 0;
  const createdItems = [];
  for (const it of items) {
    const ref = doc(collection(db, `trips/${tripId}/itineraryItems`));
    const duration = Number(it.durationMinutes) || 60;
    const { _row, ...rest } = it;
    batch.set(ref, {
      ...rest,
      durationMinutes: duration,
      endAt: dayjs(it.startAt).add(duration, 'minute').toDate(),
      order: n,
      status: it.status || 'planned',
      createdBy: userId,
      updatedBy: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      version: 1
    });
    createdItems.push({ ...it, id: ref.id });
    n++; created++;
    if (n % 400 === 0) { await batch.commit(); batch = writeBatch(db); }
    onProgress?.(created, items.length);
  }
  if (n % 400 !== 0) await batch.commit();
  return { created, items: createdItems };
}
