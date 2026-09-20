// Comments on expenses — how members question a bill ("ทักท้วงรายการ").
//
// Stored in `trips/{tripId}/comments` (one document per comment) so a note can
// point at the exact expense from both the expense list and the settlement
// receipts. When Firestore refuses the write (rules not published yet) the
// comment is kept on the device instead, exactly like the expense groups, so the
// feature works before the rules are deployed.
import { db, serverTimestamp } from '../firebase.js';
import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc, query, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { cacheForget } from '../utils/datacache.js';

const LOCAL_KEY = (tripId) => `fuji_comments:${tripId}`;
const LEGACY_CACHE = (tripId) => `fuji_comments_cache:${tripId}`;

function readLocal(tripId) {
  try {
    const raw = localStorage.getItem(LOCAL_KEY(tripId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function writeLocal(tripId, list) {
  try { localStorage.setItem(LOCAL_KEY(tripId), JSON.stringify(list.slice(-200))); } catch { /* ignore */ }
}

function putLocal(tripId, comment) {
  const list = readLocal(tripId).filter(c => c.id !== comment.id);
  list.push(comment);
  writeLocal(tripId, list);
}

function dropLocal(tripId, id) {
  writeLocal(tripId, readLocal(tripId).filter(c => c.id !== id));
}

/** Are we showing comments that could not be synced yet? */
export function commentsPending(tripId) {
  return readLocal(tripId).some(c => c.pending);
}

/**
 * Every comment of the trip, newest last, with any device-only ones merged in.
 * @returns {Promise<Array<{id:string, expenseId:string, text:string, uid:string,
 *   name:string, createdAt:Object, pending?:boolean}>>}
 */
export async function listComments(tripId, { limitCount = 200 } = {}) {
  const local = readLocal(tripId);
  const localIds = new Set(local.map(c => c.id));
  let remote = [];
  try {
    if (!db) throw new Error('DB not ready');
    const snap = await getDocs(query(collection(db, `trips/${tripId}/comments`), orderBy('createdAt', 'asc'), limit(limitCount)));
    remote = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('listComments failed (using the device copy)', e?.code || e?.message);
  }
  return [...remote, ...local.filter(c => !remote.some(r => r.id === c.id) && localIds.has(c.id))]
    .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
}

/**
 * Add a comment to an expense.
 * @returns {Promise<{id:string, synced:boolean}>} synced=false → kept on this device
 */
export async function addComment(tripId, expenseId, text, user = {}) {
  const clean = String(text || '').trim();
  if (!clean) throw new Error('ความเห็นว่างเปล่า');
  const payload = {
    expenseId: expenseId || '',
    text: clean,
    uid: user.uid || '',
    name: user.displayName || user.email || '',
    photoURL: user.photoURL || '',
    color: user.color || ''
  };
  try {
    if (!db) throw new Error('DB not ready');
    const ref = await addDoc(collection(db, `trips/${tripId}/comments`), {
      ...payload, createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    invalidateComments(tripId);
    return { id: ref.id, synced: true };
  } catch (e) {
    console.warn('addComment failed (keeping it on this device)', e?.code || e?.message);
    const id = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    putLocal(tripId, { id, ...payload, pending: true, createdAt: { seconds: Math.floor(Date.now() / 1000) } });
    invalidateComments(tripId);
    return { id, synced: false };
  }
}

export async function updateComment(tripId, commentId, text, uid = null) {
  const clean = String(text || '').trim();
  if (!clean) throw new Error('ความเห็นว่างเปล่า');
  try {
    await updateDoc(doc(db, `trips/${tripId}/comments/${commentId}`), {
      text: clean, editedAt: serverTimestamp(), updatedBy: uid
    });
  } catch (e) {
    const list = readLocal(tripId).map(c => (c.id === commentId ? { ...c, text: clean } : c));
    writeLocal(tripId, list);
  }
  invalidateComments(tripId);
}

export async function deleteComment(tripId, commentId) {
  try {
    if (!String(commentId).startsWith('local-')) {
      await deleteDoc(doc(db, `trips/${tripId}/comments/${commentId}`));
    }
  } catch (e) {
    console.warn('deleteComment failed', e?.code || e?.message);
  } finally {
    dropLocal(tripId, commentId);
    invalidateComments(tripId);
  }
}

export function invalidateComments(tripId) {
  cacheForget(`comments:${tripId}`);
}

/** Group a comment list by expense id (for badges in lists). */
export function commentsByExpense(comments = []) {
  const map = new Map();
  for (const c of comments) {
    if (!c.expenseId) continue;
    if (!map.has(c.expenseId)) map.set(c.expenseId, []);
    map.get(c.expenseId).push(c);
  }
  return map;
}
