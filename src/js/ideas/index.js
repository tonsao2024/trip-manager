// ─────────────────────────────────────────────────────────────────────────────
// Ideas board — Firestore CRUD for trips/{tripId}/ideas/{id}
// Pure helpers are in ../utils/ideas.js and re-exported here.
// ─────────────────────────────────────────────────────────────────────────────
import { db, serverTimestamp } from '../firebase.js';
import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export {
  IDEA_STATUSES, ideaStatusDef, voteInfo, hasVoted, toggleVoteMap, voteCount,
  sortIdeas, voterNames, ideaToItineraryPayload, ideasBudget, trendingIdeas
} from '../utils/ideas.js';
import { toggleVoteMap } from '../utils/ideas.js';

/* ------------------------------------------------------------------ *
 * Firestore CRUD
 * ------------------------------------------------------------------ */
function ideasCol(tripId) {
  return collection(db, `trips/${tripId}/ideas`);
}

export async function listIdeas(tripId) {
  if (!db) throw new Error('DB not ready');
  try {
    const snap = await getDocs(query(ideasCol(tripId), orderBy('createdAt', 'desc')));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    const snap = await getDocs(ideasCol(tripId));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
}

export async function createIdea(tripId, data = {}, uid = null) {
  if (!db) throw new Error('DB not ready');
  const title = String(data.title || '').trim();
  if (!title) throw new Error('ต้องมีชื่อสถานที่');
  const ref = await addDoc(ideasCol(tripId), {
    title,
    note: String(data.note || '').trim(),
    url: String(data.url || '').trim(),
    address: String(data.address || '').trim(),
    category: data.category || 'sightseeing',
    coordinates: data.coordinates || null,
    imageUrl: data.imageUrl || '',
    estimatedCostMinor: Number(data.estimatedCostMinor) || 0,
    currency: data.currency || 'THB',
    votes: data.votes || (uid ? { [uid]: true } : {}), // the author votes for it by default
    status: 'idea',
    plannedItemId: null,
    plannedDate: null,
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedBy: uid,
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

export async function updateIdea(tripId, ideaId, patch = {}, uid = null) {
  if (!db) throw new Error('DB not ready');
  const payload = { ...patch, updatedBy: uid, updatedAt: serverTimestamp() };
  delete payload.id;
  await updateDoc(doc(db, `trips/${tripId}/ideas/${ideaId}`), payload);
}

export async function deleteIdea(tripId, ideaId) {
  if (!db) throw new Error('DB not ready');
  await deleteDoc(doc(db, `trips/${tripId}/ideas/${ideaId}`));
}

/** Toggle a member's vote in Firestore (read-modify-write on a tiny map). */
export async function voteIdea(tripId, idea, memberId) {
  if (!db) throw new Error('DB not ready');
  const next = toggleVoteMap(idea.votes || {}, memberId);
  await updateDoc(doc(db, `trips/${tripId}/ideas/${idea.id}`), {
    votes: next,
    updatedAt: serverTimestamp()
  });
  return next;
}
