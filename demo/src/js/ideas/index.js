// ─────────────────────────────────────────────────────────────────────────────
// Ideas board — Firestore CRUD for trips/{tripId}/ideas/{id}
// Pure helpers are in ../utils/ideas.js and re-exported here.
// ─────────────────────────────────────────────────────────────────────────────
import { db, auth, serverTimestamp } from '../firebase.js';
import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy } from '../../../vendor/firebase/firestore.js';

/**
 * v18: the security rules gate deletes on `createdBy`, and the ideas board used to
 * also gate *creates* on it — so a write with `createdBy: null` was rejected with
 * "Missing or insufficient permissions" even by the trip owner. Always resolve the
 * actor here, from the live auth session, when the caller did not pass one.
 */
function actorUid(uid) {
  if (uid) return uid;
  try { return auth?.currentUser?.uid || null; } catch { return null; }
}

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
  const resolvedUid = actorUid(uid) || 'unknown';
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
    votes: data.votes || (resolvedUid !== 'unknown' ? { [resolvedUid]: true } : {}), // the author votes for it by default
    status: 'idea',
    plannedItemId: null,
    plannedDate: null,
    createdBy: resolvedUid,
    createdAt: serverTimestamp(),
    updatedBy: resolvedUid,
    updatedAt: serverTimestamp()
  });
  return ref.id;
}

export async function updateIdea(tripId, ideaId, patch = {}, uid = null) {
  if (!db) throw new Error('DB not ready');
  const payload = { ...patch, updatedBy: actorUid(uid), updatedAt: serverTimestamp() };
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
