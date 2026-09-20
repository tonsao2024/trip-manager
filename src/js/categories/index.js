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

/** Read the trip's custom groups into the shared registry. */
export async function loadTripCategories(tripId, { silent = true } = {}) {
  if (!db || !tripId) return getCustomCategories();
  try {
    const snap = await getDocs(collection(db, `trips/${tripId}/categories`));
    const list = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(c => c && (c.th || c.en))
      .sort((a, b) => (Number(a.order) || 500) - (Number(b.order) || 500) || String(a.th).localeCompare(String(b.th)));
    setCustomCategories(list);
    return list;
  } catch (e) {
    console.warn('loadTripCategories failed', e?.code, e?.message);
    if (!silent) throw new Error('โหลดกลุ่มค่าใช้จ่ายไม่ได้ — ตรวจสอบว่าได้ Publish firestore.rules แล้ว');
    return getCustomCategories();
  }
}

export async function saveCategory(tripId, data, { id = null } = {}) {
  if (!db) throw new Error('DB not ready');
  const doc_ = toCategoryDoc(data, { id });
  const ref = id ? doc(db, `trips/${tripId}/categories`, id) : doc(collection(db, `trips/${tripId}/categories`));
  const finalId = id || ref.id;
  const payload = { ...doc_, id: finalId, createdAt: serverTimestamp() };
  try {
    if (id) {
      const { createdAt, ...rest } = payload;
      await setDoc(ref, rest, { merge: true });
    } else {
      await setDoc(ref, payload, { merge: true });
    }
  } catch (e) {
    console.warn('saveCategory failed', e?.code, e?.message);
    throw new Error('บันทึกกลุ่มค่าใช้จ่ายไม่ได้ — ต้อง Publish firestore.rules ก่อน');
  }
  await loadTripCategories(tripId);
  return { id: finalId, ...doc_ };
}

export async function deleteCategory(tripId, id) {
  if (!db) throw new Error('DB not ready');
  if (BUILTIN_IDS.has(id)) throw new Error('ลบกลุ่มพื้นฐานไม่ได้ — แก้ไขชื่อ/สีได้เท่านั้น');
  try {
    await deleteDoc(doc(db, `trips/${tripId}/categories`, id));
  } catch (e) {
    console.warn('deleteCategory failed', e?.code, e?.message);
    throw new Error('ลบกลุ่มค่าใช้จ่ายไม่สำเร็จ');
  }
  await loadTripCategories(tripId);
}

/** What each group is used for (so deleting is an informed decision). */
export async function countCategoryUsage(tripId, categoryId) {
  if (!db) return 0;
  try {
    const snap = await getDocs(collection(db, `trips/${tripId}/expenses`));
    return snap.docs.filter(d => (d.data()?.category || 'general') === categoryId).length;
  } catch {
    return 0;
  }
}
