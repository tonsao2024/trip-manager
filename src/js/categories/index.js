/**
 * Editable expense groups ("หมวดหมู่ค่าใช้จ่าย").
 *
 * Built-in categories keep working out of the box; a trip admin can add, rename
 * (Thai + English label), recolour, re-icon and delete their own groups. Custom
 * groups live in `trips/{tripId}/categories/{id}` and the merged list is pushed
 * into `utils/categories.js` so every screen (expense form, filters, dashboard,
 * settlement, Excel import) sees them.
 */
import { db, serverTimestamp } from '../firebase.js';
import {
  collection, doc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp as _ts
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { setCustomCategories, getCustomCategories, EXPENSE_CATEGORIES } from '../utils/categories.js';
import { cachedRead, cacheInvalidate, cacheForget, seedFromPersist, persistSet, persistDelete } from '../utils/datacache.js';
import { fetchAllExpenses } from '../expenses/index.js';

export const CATEGORY_ICON_CHOICES = [
  'utensils-crossed', 'coffee', 'pizza', 'ice-cream', 'beer', 'train-front', 'bus', 'plane',
  'car', 'fuel', 'bed-double', 'home', 'ticket', 'ferris-wheel', 'camera', 'shopping-bag',
  'gift', 'shirt', 'shield-check', 'receipt', 'credit-card', 'banknote', 'package',
  'heart-pulse', 'dog', 'sparkles', 'map-pin', 'umbrella', 'wallet', 'phone'
];

export const CATEGORY_COLOR_CHOICES = [
  '#e0a17a', '#8aa8b5', '#a48fc0', '#8bb89a', '#e0b17a', '#d391ab', '#7fa9b8',
  '#b0a17a', '#9aa79c', '#6ea8fe', '#f2a65a', '#e57373'
];

export function slugifyCategoryId(label) {
  const base = String(label || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9ก-๙]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 28);
  return `custom-${base || 'group'}-${Math.random().toString(36).slice(2, 6)}`;
}

const BUILTIN_IDS = new Set(EXPENSE_CATEGORIES.map(c => c.id));

/* ------------------------------------------------------------------ *
 * Offline fallback
 *
 * Until `firestore.rules` is published the `categories` collection is
 * denied. Rather than losing the user's groups, they are kept in this
 * browser and merged with whatever the server returns; the next
 * successful sync pushes them up.
 * ------------------------------------------------------------------ */
const LOCAL_KEY = (tripId) => `fuji_custom_cats:${tripId}`;

function readLocalCategories(tripId) {
  try {
    const raw = localStorage.getItem(LOCAL_KEY(tripId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(c => c && (c.th || c.en)) : [];
  } catch { return []; }
}

function writeLocalCategories(tripId, list) {
  try { localStorage.setItem(LOCAL_KEY(tripId), JSON.stringify(list)); } catch { /* ignore */ }
}

function mergeCategories(remote, local) {
  const byId = new Map();
  for (const c of remote || []) byId.set(c.id, c);
  for (const c of local || []) byId.set(c.id, { ...(byId.get(c.id) || {}), ...c, pending: byId.has(c.id) ? undefined : c.pending });
  return [...byId.values()];
}

export function localCategoryPending(tripId) {
  return readLocalCategories(tripId).some(c => c.pending);
}

/** Did the last load fall back because Firestore denied the collection? */
let lastLoadDenied = false;
export function categoriesLoadDenied() { return lastLoadDenied; }

export function toCategoryDoc(data, { id = null } = {}) {
  const th = String(data.th || data.label || '').trim();
  const en = String(data.en || data.label || th).trim();
  if (!th && !en) throw new Error('กรุณากรอกชื่อกลุ่มค่าใช้จ่าย');
  return {
    id: id || slugifyCategoryId(en || th),
    th: th || en,
    en: en || th,
    icon: data.icon || 'package',
    color: data.color || '#9aa79c',
    custom: true,
    order: Number.isFinite(Number(data.order)) ? Number(data.order) : 500,
    updatedAt: serverTimestamp()
  };
}

async function fetchTripCategories(tripId) {
  const snap = await getDocs(collection(db, `trips/${tripId}/categories`));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(c => c && (c.th || c.en))
    .sort((a, b) => (Number(a.order) || 500) - (Number(b.order) || 500) || String(a.th).localeCompare(String(b.th)));
}

/**
 * Read the trip's custom groups into the shared registry.
 *
 * Cached for the session (stale-while-revalidate): the groups change rarely and
 * the read is on the critical path of four menus, so it must not add a round trip
 * every time the user taps a menu item. Every write invalidates the entry.
 *
 * @param {string} tripId
 * @param {{silent?: boolean, fresh?: boolean}} [options]
 */
export async function loadTripCategories(tripId, { silent = true, fresh = false } = {}) {
  if (!db || !tripId) return getCustomCategories();
  const key = `cats:${tripId}`;
  if (fresh) { cacheForget(key); persistDelete(key); }
  else seedFromPersist(key);
  const local = readLocalCategories(tripId);
  lastLoadDenied = false;
  try {
    const remote = await cachedRead(key, () => fetchTripCategories(tripId), { maxAgeMs: 5 * 60 * 1000 });
    const list = mergeCategories(remote, local);
    persistSet(key, remote);
    setCustomCategories(list);
    return getCustomCategories();
  } catch (e) {
    console.warn('loadTripCategories failed', e?.code, e?.message);
    lastLoadDenied = /permission|insufficient/i.test(`${e?.code || ''} ${e?.message || ''}`);
    // Firestore denied (rules not published) → keep working with the local copy.
    if (local.length) { setCustomCategories(local); return getCustomCategories(); }
    if (!silent) throw new Error('โหลดกลุ่มค่าใช้จ่ายไม่ได้ — ตรวจสอบว่าได้ Publish firestore.rules แล้ว');
    return getCustomCategories();
  }
}

/**
 * Create or update a group.
 *
 * Always saves locally too, so the user's groups survive even when the Firestore
 * rules are not published yet (the attempt to sync simply fails silently and the
 * entry stays marked as pending until a later successful write).
 *
 * @returns {{id:string, synced:boolean}}
 */
export async function saveCategory(tripId, data, { id = null } = {}) {
  if (!db) throw new Error('DB not ready');
  const doc_ = toCategoryDoc(data, { id });
  const finalId = id || doc_.id;
  const payload = { ...doc_, id: finalId, createdAt: serverTimestamp() };
  let synced = false;
  try {
    const ref = doc(db, `trips/${tripId}/categories`, finalId);
    if (id) {
      const { createdAt, ...rest } = payload;
      await setDoc(ref, rest, { merge: true });
    } else {
      await setDoc(ref, payload, { merge: true });
    }
    synced = true;
  } catch (e) {
    console.warn('saveCategory failed (keeping a local copy)', e?.code, e?.message);
    const local = readLocalCategories(tripId).filter(c => c.id !== finalId);
    local.push({ ...doc_, id: finalId, pending: true });
    writeLocalCategories(tripId, local);
  }
  if (synced) {
    // The server copy is the truth now — drop the local pending entry.
    writeLocalCategories(tripId, readLocalCategories(tripId).filter(c => c.id !== finalId));
  }
  cacheForget(`cats:${tripId}`);
  persistDelete(`cats:${tripId}`);
  await loadTripCategories(tripId);
  return { id: finalId, synced };
}

export async function deleteCategory(tripId, id) {
  if (!db) throw new Error('DB not ready');
  if (BUILTIN_IDS.has(id)) throw new Error('ลบกลุ่มพื้นฐานไม่ได้ — แก้ไขชื่อ/สีได้เท่านั้น');
  let synced = false;
  try {
    await deleteDoc(doc(db, `trips/${tripId}/categories`, id));
    synced = true;
  } catch (e) {
    console.warn('deleteCategory failed (removing the local copy)', e?.code, e?.message);
  }
  writeLocalCategories(tripId, readLocalCategories(tripId).filter(c => c.id !== id));
  cacheForget(`cats:${tripId}`);
  persistDelete(`cats:${tripId}`);
  await loadTripCategories(tripId);
  return { synced };
}

/** What each group is used for (so deleting is an informed decision). */
export async function countCategoryUsage(tripId, categoryId) {
  if (!db) return 0;
  try {
    const list = await fetchAllExpenses(tripId);
    return list.filter(e => (e?.category || 'general') === categoryId).length;
  } catch {
    return 0;
  }
}
