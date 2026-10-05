// ─────────────────────────────────────────────────────────────────────────────
// Prep checklists — Firestore CRUD for trips/{tripId}/checklists/{id}
// Pure templates + progress helpers live in ../utils/checklists.js and are
// re-exported here so views only need a single import.
// ─────────────────────────────────────────────────────────────────────────────
import { db, serverTimestamp } from '../firebase.js';
import { BRAND_PRIMARY } from '../utils/brand.js';
import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy } from '../../../vendor/firebase/firestore.js';

export {
  CHECKLIST_TEMPLATES, itemId, itemsFromTemplate, checklistProgress, checklistsProgress,
  sortChecklistItems, mergeTemplateItems, assigneeSummary, templateById
} from '../utils/checklists.js';

/* ------------------------------------------------------------------ *
 * Firestore CRUD
 * ------------------------------------------------------------------ */
function checklistsCol(tripId) {
  return collection(db, `trips/${tripId}/checklists`);
}

export async function listChecklists(tripId) {
  if (!db) throw new Error('DB not ready');
  try {
    const snap = await getDocs(query(checklistsCol(tripId), orderBy('order', 'asc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    // Missing composite index / offline → plain read, sorted in memory
    const snap = await getDocs(checklistsCol(tripId));
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
}

export async function createChecklist(tripId, data = {}, uid = null) {
  if (!db) throw new Error('DB not ready');
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) throw new Error('รายการว่างเปล่า');
  const ref = await addDoc(checklistsCol(tripId), {
    title: String(data.title || '').trim() || 'เช็กลิสต์',
    kind: data.kind === 'todo' ? 'todo' : 'packing',
    icon: data.icon || (data.kind === 'todo' ? 'list-checks' : 'luggage'),
    color: data.color || BRAND_PRIMARY,
    order: Number.isFinite(data.order) ? data.order : Date.now(),
    items,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: uid
  });
  return ref.id;
}

export async function updateChecklist(tripId, checklistId, patch = {}, uid = null) {
  if (!db) throw new Error('DB not ready');
  const payload = { ...patch, updatedBy: uid, updatedAt: serverTimestamp() };
  delete payload.id;
  await updateDoc(doc(db, `trips/${tripId}/checklists/${checklistId}`), payload);
}

export async function deleteChecklist(tripId, checklistId) {
  if (!db) throw new Error('DB not ready');
  await deleteDoc(doc(db, `trips/${tripId}/checklists/${checklistId}`));
}

/** Persist a whole items array (lists are small — one atomic array write). */
export async function saveChecklistItems(tripId, checklistId, items = [], uid = null) {
  return updateChecklist(tripId, checklistId, { items }, uid);
}
