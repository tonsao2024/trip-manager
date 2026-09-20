// Sticky notes — "post-it" reminders attached to a trip (itinerary page).
import { db, serverTimestamp } from '../firebase.js';
import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/** Post-it palette (soft paper tones that stay readable in Thai + dark mode). */
export const NOTE_COLORS = [
  { id: 'yellow', color: '#ffe9a8', label: 'เหลือง' },
  { id: 'pink', color: '#ffd6e7', label: 'ชมพู' },
  { id: 'blue', color: '#cfe8ff', label: 'ฟ้า' },
  { id: 'green', color: '#d6f5d6', label: 'เขียว' },
  { id: 'purple', color: '#e6dcff', label: 'ม่วง' },
  { id: 'orange', color: '#ffdfc2', label: 'ส้ม' }
];

export function noteColorHex(id) {
  return (NOTE_COLORS.find(c => c.id === id) || NOTE_COLORS[0]).color;
}

function notesCol(tripId) {
  return collection(db, `trips/${tripId}/notes`);
}

export async function listNotes(tripId) {
  if (!db) throw new Error('DB not ready');
  try {
    const snap = await getDocs(query(notesCol(tripId), orderBy('createdAt', 'desc'), limit(60)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    // Missing index / unsupported order → fall back to an unordered read
    if (e?.code === 'failed-precondition' || /index/i.test(e?.message || '')) {
      const snap = await getDocs(notesCol(tripId));
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    throw e;
  }
}

export async function createNote(tripId, { title = '', body = '', color = 'yellow', pinned = false, itemId = null } = {}, uid = null) {
  if (!db) throw new Error('DB not ready');
  if (!String(body || '').trim() && !String(title || '').trim()) throw new Error('โน้ตว่างเปล่า');
  const ref = await addDoc(notesCol(tripId), {
    title: String(title || '').trim(),
    body: String(body || '').trim(),
    color,
    pinned: !!pinned,
    itemId,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

export async function updateNote(tripId, noteId, patch = {}, uid = null) {
  if (!db) throw new Error('DB not ready');
  const payload = { ...patch, updatedBy: uid, updatedAt: serverTimestamp() };
  delete payload.id;
  await updateDoc(doc(db, `trips/${tripId}/notes/${noteId}`), payload);
}

export async function deleteNote(tripId, noteId) {
  if (!db) throw new Error('DB not ready');
  await deleteDoc(doc(db, `trips/${tripId}/notes/${noteId}`));
}

/* ------------------------------------------------------------------ *
 * "เก็บโน้ต" (done / archived) — keeps the board tidy but never loses a note.
 * The flag lives on the document; if Firestore refuses the write (rules not
 * published yet) the note id is remembered on this device instead, so the
 * button always works and can always be undone.
 * ------------------------------------------------------------------ */
const ARCHIVE_KEY = (tripId) => `fuji_notes_archived:${tripId}`;

/** Note ids archived locally (fallback when the write was denied). */
export function localArchivedIds(tripId) {
  try {
    const raw = localStorage.getItem(ARCHIVE_KEY(tripId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function setLocalArchived(tripId, noteId, archived) {
  try {
    const list = new Set(localArchivedIds(tripId));
    if (archived) list.add(noteId); else list.delete(noteId);
    localStorage.setItem(ARCHIVE_KEY(tripId), JSON.stringify([...list]));
  } catch { /* ignore */ }
}

/**
 * Hide a note as done (or bring it back).
 * @returns {Promise<{synced: boolean}>} synced=false → kept on this device only
 */
export async function setNoteArchived(tripId, noteId, archived = true, uid = null) {
  const payload = { archived: !!archived, archivedAt: archived ? serverTimestamp() : null, updatedBy: uid, updatedAt: serverTimestamp() };
  try {
    if (!db) throw new Error('DB not ready');
    await updateDoc(doc(db, `trips/${tripId}/notes/${noteId}`), payload);
    setLocalArchived(tripId, noteId, false);   // the document is the source of truth now
    return { synced: true };
  } catch (e) {
    console.warn('setNoteArchived failed (keeping it local)', e?.code || e?.message);
    setLocalArchived(tripId, noteId, !!archived);
    return { synced: false };
  }
}
