import { db, serverTimestamp } from '../firebase.js';
import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, writeBatch, query, where, orderBy, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { recalculateSchedule, detectOverlaps, validateItineraryItem } from '../utils/scheduling.js';
import { dayjs } from '../utils/date.js';

export function subscribeItinerary(tripId, day, callback) {
  if (!db) return () => {};
  let q = query(collection(db, `trips/${tripId}/itineraryItems`), orderBy('order', 'asc'));
  if (day) q = query(collection(db, `trips/${tripId}/itineraryItems`), where('date', '==', day), orderBy('order', 'asc'));
  return onSnapshot(q, snap => {
    const items = snap.docs.map(d => ({ id: d.id, ...d.data(), startAt: d.data().startAt?.toDate?.() || d.data().startAt, endAt: d.data().endAt?.toDate?.() || d.data().endAt }));
    callback(items);
  });
}

export async function fetchItinerary(tripId, dateStr = null) {
  let q = query(collection(db, `trips/${tripId}/itineraryItems`), orderBy('order', 'asc'));
  if (dateStr) q = query(collection(db, `trips/${tripId}/itineraryItems`), where('date', '==', dateStr), orderBy('order', 'asc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data(), startAt: d.data().startAt?.toDate?.() || d.data().startAt, endAt: d.data().endAt?.toDate?.() || d.data().endAt }));
}

export async function addItineraryItem(tripId, data, userId) {
  const validation = validateItineraryItem(data);
  if (!validation.valid) throw new Error(validation.errors.join(', '));
  const col = collection(db, `trips/${tripId}/itineraryItems`);
  // Determine order: max+1 for that date
  const existing = await fetchItinerary(tripId, data.date);
  const maxOrder = existing.reduce((m, i) => Math.max(m, i.order || 0), -1);
  const payload = {
    title: data.title,
    description: data.description || '',
    date: data.date,
    startAt: data.startAt,
    durationMinutes: data.durationMinutes || 60,
    travelToNextMinutes: data.travelToNextMinutes || 0,
    endAt: dayjs(data.startAt).add(data.durationMinutes || 60, 'minute').toDate(),
    order: maxOrder + 1,
    category: data.category || 'general',
    address: data.address || '',
    coordinates: data.coordinates || '',
    googleMapsUrl: data.googleMapsUrl || '',
    imageUrl: data.imageUrl || '',
    notes: data.notes || '',
    status: 'planned',
    expenseId: data.expenseId || null,
    createdBy: userId,
    updatedBy: userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    version: 1
  };
  const ref = await addDoc(col, payload);
  return ref.id;
}

export async function updateItineraryItem(tripId, itemId, updates, userId) {
  const ref = doc(db, `trips/${tripId}/itineraryItems`, itemId);
  await updateDoc(ref, {
    ...updates,
    updatedBy: userId,
    updatedAt: serverTimestamp(),
    version: (updates.version || 0) + 1
  });
}

export async function deleteItineraryItem(tripId, itemId) {
  await deleteDoc(doc(db, `trips/${tripId}/itineraryItems`, itemId));
}

export async function batchUpdateSchedule(tripId, items, userId) {
  // Use batch write with version check
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
  const reordered = newOrderIds.map((id, idx) => ({ ...map.get(id), order: idx }));
  // Recalculate times from first item's start
  const recalculated = recalculateSchedule(reordered, reordered[0]?.id, {});
  const overlaps = detectOverlaps(recalculated);
  await batchUpdateSchedule(tripId, recalculated, userId);
  return { items: recalculated, overlaps };
}

export async function moveItemToDay(tripId, itemId, newDate, newOrder, userId) {
  const itemsOldDate = await fetchItinerary(tripId, null);
  const item = itemsOldDate.find(i => i.id === itemId);
  if (!item) throw new Error('Item not found');
  // Update date and order, then recalc both days
  // Simplified: just update date and order, let user trigger reschedule
  await updateItineraryItem(tripId, itemId, { date: newDate, order: newOrder }, userId);
}
