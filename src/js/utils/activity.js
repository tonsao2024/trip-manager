// Activity log — "ใครแก้ไขล่าสุด" for expenses (and anything else that changes).
//
// Every write appends one entry to `trips/{tripId}/activity` with who did it and
// what changed. The same "who" is stamped on the document itself
// (updatedByName / updatedAt) so lists can show the last editor without a second
// read. If the write is refused (rules not published) the entry is kept on the
// device, so the history is never silently lost.
import { db, serverTimestamp } from '../firebase.js';
import { collection, addDoc, getDocs, query, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const LOCAL_KEY = (tripId) => `fuji_activity:${tripId}`;
const MAX_LOCAL = 150;

function readLocal(tripId) {
  try {
    const raw = localStorage.getItem(LOCAL_KEY(tripId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch { return []; }
}

function writeLocal(tripId, list) {
  try { localStorage.setItem(LOCAL_KEY(tripId), JSON.stringify(list.slice(-MAX_LOCAL))); } catch { /* ignore */ }
}

/** Human-readable Thai/English descriptions for each action. */
export const ACTIVITY_TYPES = {
  'expense.create': { th: 'เพิ่มค่าใช้จ่าย', en: 'added an expense', icon: 'plus-circle' },
  'expense.update': { th: 'แก้ไขค่าใช้จ่าย', en: 'edited an expense', icon: 'pencil' },
  'expense.delete': { th: 'ลบค่าใช้จ่าย', en: 'deleted an expense', icon: 'trash-2' },
  'comment.create': { th: 'แสดงความเห็น', en: 'commented', icon: 'message-square' },
  'comment.delete': { th: 'ลบความเห็น', en: 'deleted a comment', icon: 'message-square-x' },
  'category.create': { th: 'เพิ่มกลุ่มค่าใช้จ่าย', en: 'added an expense group', icon: 'layout-grid' },
  'category.update': { th: 'แก้ไขกลุ่มค่าใช้จ่าย', en: 'edited an expense group', icon: 'layout-grid' },
  'category.delete': { th: 'ลบกลุ่มค่าใช้จ่าย', en: 'deleted an expense group', icon: 'layout-grid' }
};

export function activityLabel(type, lang = 'th') {
  const def = ACTIVITY_TYPES[type];
  if (!def) return type;
  return lang === 'th' ? def.th : def.en;
}

export function activityIcon(type) {
  return ACTIVITY_TYPES[type]?.icon || 'history';
}

/**
 * Append one entry to the trip's activity log.
 * @param {string} tripId
 * @param {{type:string, targetId?:string, title?:string, detail?:string,
 *          user?:{uid?:string, displayName?:string, email?:string, photoURL?:string}}} entry
 * @returns {Promise<{synced:boolean}>}
 */
export async function logActivity(tripId, entry = {}) {
  const user = entry.user || {};
  const payload = {
    type: entry.type || 'unknown',
    targetId: entry.targetId || '',
    title: entry.title || '',
    detail: entry.detail || '',
    uid: user.uid || '',
    name: user.displayName || user.email || 'ไม่ทราบชื่อ',
    photoURL: user.photoURL || ''
  };
  try {
    if (!db) throw new Error('DB not ready');
    await addDoc(collection(db, `trips/${tripId}/activity`), { ...payload, at: serverTimestamp() });
    return { synced: true };
  } catch (e) {
    console.warn('logActivity failed (keeping it on this device)', e?.code || e?.message);
    const list = readLocal(tripId);
    list.push({ id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...payload, pending: true, at: { seconds: Math.floor(Date.now() / 1000) } });
    writeLocal(tripId, list);
    return { synced: false };
  }
}

/**
 * The trip's history, newest first (remote entries + device-only ones merged).
 */
export async function listActivity(tripId, { limitCount = 80 } = {}) {
  let remote = [];
  try {
    if (!db) throw new Error('DB not ready');
    const snap = await getDocs(query(collection(db, `trips/${tripId}/activity`), orderBy('at', 'desc'), limit(limitCount)));
    remote = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    // Missing index / no permission → fall back to the device copy
    console.warn('listActivity failed (using the device copy)', e?.code || e?.message);
  }
  const local = readLocal(tripId);
  return [...remote, ...local.filter(l => !remote.some(r => r.id === l.id))]
    .sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0))
    .slice(0, limitCount);
}

/** Log + stamp in one call: keeps the "who edited last" fields consistent. */
export async function recordAction(tripId, { type, targetId, title, detail, user }) {
  const [log] = await Promise.all([
    logActivity(tripId, { type, targetId, title, detail, user })
  ]);
  return { ...log, by: user?.displayName || user?.email || '', uid: user?.uid || '' };
}

/** "สมชาย • 2 ชม. ที่แล้ว" for the last-editor line on a card. */
export function lastEditorText(doc, lang = 'th') {
  const name = doc?.updatedByName || doc?.createdByName || '';
  const stamp = doc?.updatedAt?.seconds || doc?.createdAt?.seconds;
  if (!name && !stamp) return '';
  const when = stamp ? new Date(stamp * 1000).toLocaleString(lang === 'th' ? 'th-TH' : 'en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  }) : '';
  const label = doc?.updatedAt ? (lang === 'th' ? 'แก้ไขล่าสุด' : 'last edited') : (lang === 'th' ? 'สร้างโดย' : 'created by');
  return `${label} ${name || '—'}${when ? ` • ${when}` : ''}`;
}
