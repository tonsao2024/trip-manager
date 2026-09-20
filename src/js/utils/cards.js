// Credit cards per trip (v10).
//
// The card names a member uses are kept in a small local list so the expense
// form can autocomplete them ("KBank Visa ••4321"). They are also derived from
// the expenses themselves, so the list survives a device change as soon as the
// Firestore rules are published — no extra collection is required, which keeps
// the app working on the free plan and before the rules are deployed.
import { compressImage } from './helpers.js';
import { storage, isStorageAvailable } from '../firebase.js';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

const KEY = (tripId) => `fuji_cards:${tripId}`;

/** Card names known on this device for a trip. */
export function listCards(tripId) {
  try {
    const raw = localStorage.getItem(KEY(tripId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(Boolean) : [];
  } catch { return []; }
}

/** Remember a card name so the next expense can pick it from a list. */
export function rememberCard(tripId, name) {
  const clean = String(name || '').trim();
  if (!tripId || !clean) return;
  try {
    const list = listCards(tripId).filter(c => c.toLowerCase() !== clean.toLowerCase());
    list.unshift(clean);
    localStorage.setItem(KEY(tripId), JSON.stringify(list.slice(0, 30)));
  } catch { /* ignore */ }
}

export function forgetCard(tripId, name) {
  try {
    const list = listCards(tripId).filter(c => c !== name);
    localStorage.setItem(KEY(tripId), JSON.stringify(list));
  } catch { /* ignore */ }
}

/** Every card name we can suggest: local list first, then ones used in expenses. */
export function suggestCards(tripId, expenses = []) {
  const seen = new Map();
  const push = (name) => {
    const clean = String(name || '').trim();
    if (!clean) return;
    const key = clean.toLowerCase();
    if (!seen.has(key)) seen.set(key, clean);
  };
  listCards(tripId).forEach(push);
  for (const e of expenses) if (e?.cardName) push(e.cardName);
  return [...seen.values()];
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Store a receipt photo for an expense.
 *
 * Tries Firebase Storage first; when Storage is unavailable (free tier / rules
 * not published / offline) the (compressed) image is inlined into the expense
 * document instead, so the feature still works everywhere.
 *
 * @returns {Promise<{url:string, storage:'storage'|'inline'|'none', warning?:string}>}
 */
export async function uploadReceiptImage(tripId, expenseId, file) {
  if (!file) return { url: '', storage: 'none' };
  let blob;
  try {
    blob = await compressImage(file, 1200, 0.72);
  } catch (e) {
    console.warn('receipt compress failed', e?.message || e);
    return { url: '', storage: 'none', warning: (e?.message || 'compress failed') };
  }

  if (storage && isStorageAvailable) {
    try {
      const path = `trips/${tripId}/receipts/${expenseId || Date.now()}_${Date.now()}.webp`;
      const ref = storageRef(storage, path);
      await uploadBytes(ref, blob);
      const url = await getDownloadURL(ref);
      return { url, storage: 'storage' };
    } catch (e) {
      console.warn('receipt upload failed → inline', e?.code || e?.message);
    }
  }

  try {
    if (blob.size > 700 * 1024) {
      const smaller = await compressImage(new File([blob], 'receipt.webp', { type: 'image/webp' }), 900, 0.6);
      if (smaller.size <= 700 * 1024) blob = smaller;
    }
    const url = await blobToDataURL(blob);
    return {
      url,
      storage: 'inline',
      warning: 'เก็บรูปไว้ในเอกสารของทริป (ยังไม่ได้เปิด Firebase Storage)'
    };
  } catch (e) {
    console.warn('receipt inline failed', e?.message || e);
    return { url: '', storage: 'none', warning: e?.message || 'upload failed' };
  }
}
