// ─────────────────────────────────────────────────────────────────────────────
// Ideas board — Firestore CRUD for trips/{tripId}/ideas/{id}
// Pure helpers are in ../utils/ideas.js and re-exported here.
//
// Local-first: “เพิ่มไอเดีย” must work even when the project's published rules
// are older than this code (the write comes back permission-denied). In that
// case the idea is queued on the device, shown on the board with a “รอซิงก์”
// badge, and pushed to Firestore automatically once the rules allow it again.
// ─────────────────────────────────────────────────────────────────────────────
import { db, auth, serverTimestamp } from '../firebase.js';
import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy } from '../../../vendor/firebase/firestore.js';

export {
  IDEA_STATUSES, ideaStatusDef, voteInfo, hasVoted, toggleVoteMap, voteCount,
  sortIdeas, voterNames, ideaToItineraryPayload, ideasBudget, trendingIdeas,
  LOCAL_IDEA_PREFIX, isLocalIdeaId, pendingIdeaRecord, mergeIdeas, pendingIdeaCount
} from '../utils/ideas.js';
import {
  isLocalIdeaId, pendingIdeaRecord, mergeIdeas, toggleVoteMap
} from '../utils/ideas.js';

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

/** Firestore said no (rules) — as opposed to a network hiccup. */
export function isPermissionDenied(e) {
  const text = `${e?.code || ''} ${e?.message || ''}`;
  return /permission-denied|insufficient permissions|insufficient_permissions/i.test(text);
}

/* ------------------------------------------------------------------ *
 * Local queue (device only)
 * ------------------------------------------------------------------ */

const queueKey = (tripId) => `fuji_pending_ideas_${tripId}`;

function readQueue(tripId) {
  try {
    const raw = localStorage.getItem(queueKey(tripId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(i => i && i.title) : [];
  } catch { return []; }
}

function writeQueue(tripId, list) {
  try {
    if (!list.length) localStorage.removeItem(queueKey(tripId));
    else localStorage.setItem(queueKey(tripId), JSON.stringify(list));
  } catch { /* private mode / quota — the idea still lives in memory this session */ }
}

/** Ideas waiting to be written to Firestore (for the board's banner + badges). */
export function listPendingIdeas(tripId) {
  return readQueue(tripId);
}

export function hasPendingIdeas(tripId) {
  return readQueue(tripId).length > 0;
}

/* ------------------------------------------------------------------ *
 * Firestore CRUD
 * ------------------------------------------------------------------ */
function ideasCol(tripId) {
  return collection(db, `trips/${tripId}/ideas`);
}

export async function listIdeas(tripId) {
  if (!db) throw new Error('DB not ready');
  const pending = readQueue(tripId);
  let remote = [];
  try {
    const snap = await getDocs(query(ideasCol(tripId), orderBy('createdAt', 'desc')));
    remote = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    const snap = await getDocs(ideasCol(tripId));
    remote = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  // Anything queued earlier can be pushed now that we know we can read again.
  if (pending.length) {
    const left = await flushPendingIdeas(tripId).catch(() => pending);
    if (left.length !== pending.length) {
      try {
        const snap = await getDocs(query(ideasCol(tripId), orderBy('createdAt', 'desc')));
        remote = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      } catch { /* keep the first read */ }
      return mergeIdeas(remote, left);
    }
  }
  return mergeIdeas(remote, pending);
}

/**
 * Write one queued idea to Firestore. Returns the ids that are STILL queued.
 * Called on every board load + from the “ลองซิงก์อีกครั้ง” button.
 */
export async function flushPendingIdeas(tripId) {
  const queue = readQueue(tripId);
  if (!queue.length || !db) return queue;
  const left = [];
  for (const idea of queue) {
    try {
      const { id, pendingSync, queuedAt, ...payload } = idea;
      const ref = await addDoc(ideasCol(tripId), { ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      // Re-point anything the caller stored against the local id (plan status).
      if (idea.status === 'planned' && idea.plannedItemId) {
        try { await updateDoc(doc(db, `trips/${tripId}/ideas/${ref.id}`), { status: 'planned', plannedItemId: idea.plannedItemId, plannedDate: idea.plannedDate || null }); } catch { /* keep the base doc */ }
      }
      idea.syncedId = ref.id;
    } catch (e) {
      if (isPermissionDenied(e)) return queue;   // rules still old — keep everything
      left.push(idea);
    }
  }
  writeQueue(tripId, left);
  return left;
}

export async function createIdea(tripId, data = {}, uid = null) {
  if (!db) throw new Error('DB not ready');
  const title = String(data.title || '').trim();
  if (!title) throw new Error('ต้องมีชื่อสถานที่');
  const resolvedUid = actorUid(uid) || 'unknown';
  const payload = {
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
  };
  try {
    const ref = await addDoc(ideasCol(tripId), payload);
    return ref.id;
  } catch (e) {
    if (!isPermissionDenied(e)) throw e;
    // Rules deny this device → keep the idea locally (never lose the text).
    const queued = pendingIdeaRecord({ ...payload, votes: payload.votes }, { uid: resolvedUid, seq: readQueue(tripId).length });
    writeQueue(tripId, [...readQueue(tripId), queued]);
    return queued.id;
  }
}

export async function updateIdea(tripId, ideaId, patch = {}, uid = null) {
  if (!db) throw new Error('DB not ready');
  if (isLocalIdeaId(ideaId)) {
    // Still only on this device — patch the queued copy.
    const queue = readQueue(tripId).map(i => (i.id === ideaId ? { ...i, ...patch, updatedBy: actorUid(uid), pendingSync: true } : i));
    writeQueue(tripId, queue);
    return ideaId;
  }
  const payload = { ...patch, updatedBy: actorUid(uid), updatedAt: serverTimestamp() };
  delete payload.id;
  await updateDoc(doc(db, `trips/${tripId}/ideas/${ideaId}`), payload);
  return ideaId;
}

export async function deleteIdea(tripId, ideaId) {
  if (!db) throw new Error('DB not ready');
  if (isLocalIdeaId(ideaId)) {
    writeQueue(tripId, readQueue(tripId).filter(i => i.id !== ideaId));
    return;
  }
  await deleteDoc(doc(db, `trips/${tripId}/ideas/${ideaId}`));
}

/** Toggle a member's vote in Firestore (read-modify-write on a tiny map). */
export async function voteIdea(tripId, idea, memberId) {
  if (!db) throw new Error('DB not ready');
  const next = toggleVoteMap(idea.votes || {}, memberId);
  if (isLocalIdeaId(idea.id)) {
    writeQueue(tripId, readQueue(tripId).map(i => (i.id === idea.id ? { ...i, votes: next } : i)));
    return next;
  }
  await updateDoc(doc(db, `trips/${tripId}/ideas/${idea.id}`), {
    votes: next,
    updatedAt: serverTimestamp()
  });
  return next;
}
