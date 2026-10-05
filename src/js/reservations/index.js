// ─────────────────────────────────────────────────────────────────────────────
// Reservations — Firestore CRUD for trips/{tripId}/reservations/{id}
// Pure helpers are in ../utils/reservations.js and re-exported here.
// ─────────────────────────────────────────────────────────────────────────────
import { db, serverTimestamp } from '../firebase.js';
import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export {
  RESERVATION_TYPES, reservationTypeDef, sortReservations, reservationStamp, isUpcoming,
  upcomingReservations, groupReservationsByDate, routeLabel, reservationsCostByCurrency,
  reservationToItineraryPayload, durationBetween, reservationWarnings
} from '../utils/reservations.js';
import { reservationTypeDef } from '../utils/reservations.js';

/* ------------------------------------------------------------------ *
 * Firestore CRUD
 * ------------------------------------------------------------------ */
function reservationsCol(tripId) {
  return collection(db, `trips/${tripId}/reservations`);
}

export async function listReservations(tripId) {
  if (!db) throw new Error('DB not ready');
  try {
    const snap = await getDocs(query(reservationsCol(tripId), orderBy('date', 'asc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    const snap = await getDocs(reservationsCol(tripId));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
}

export async function createReservation(tripId, data = {}, uid = null) {
  if (!db) throw new Error('DB not ready');
  const title = String(data.title || '').trim();
  if (!title) throw new Error('ต้องมีชื่อรายการจอง');
  const ref = await addDoc(reservationsCol(tripId), {
    type: reservationTypeDef(data.type).id,
    title,
    provider: String(data.provider || '').trim(),
    confirmation: String(data.confirmation || '').trim(),
    date: data.date || '',
    startTime: data.startTime || '',
    endTime: data.endTime || '',
    from: String(data.from || '').trim(),
    to: String(data.to || '').trim(),
    seat: String(data.seat || '').trim(),
    room: String(data.room || '').trim(),
    address: String(data.address || '').trim(),
    phone: String(data.phone || '').trim(),
    url: String(data.url || '').trim(),
    costMinor: Number(data.costMinor) || 0,
    currency: data.currency || 'THB',
    notes: String(data.notes || '').trim(),
    coordinates: data.coordinates || null,
    linkedItemId: data.linkedItemId || null,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedBy: uid,
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

export async function updateReservation(tripId, reservationId, patch = {}, uid = null) {
  if (!db) throw new Error('DB not ready');
  const payload = { ...patch, updatedBy: uid, updatedAt: serverTimestamp() };
  delete payload.id;
  await updateDoc(doc(db, `trips/${tripId}/reservations/${reservationId}`), payload);
}

export async function deleteReservation(tripId, reservationId) {
  if (!db) throw new Error('DB not ready');
  await deleteDoc(doc(db, `trips/${tripId}/reservations/${reservationId}`));
}
