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
  for (const e of expenses) {
    if (e?.cardName) push(e.cardName);
    for (const p of e?.payments || []) if (p?.cardName) push(p.cardName);
  }
  return [...seen.values()];
}

/* ------------------------------------------------------------------ *
 * Managed trip cards (v13) — stored on the trip document (`trip.cards`)
 * so every member picks from the SAME dropdown and nobody can type a
 * random card name. Shape: { id, name, holderId?, bank?, last4? }.
 * ------------------------------------------------------------------ */

let cardSeq = 0;
export function newCardId() {
  cardSeq = (cardSeq + 1) % 100000;
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${cardSeq}`;
}

/** Sanitized card list of a trip (always an array of well-formed objects). */
export function tripCards(trip) {
  const list = Array.isArray(trip?.cards) ? trip.cards : [];
  return list
    .filter(c => c && String(c.name || '').trim())
    .map(c => ({
      id: String(c.id || newCardId()),
      name: String(c.name).trim(),
      holderId: c.holderId || '',
      bank: c.bank || '',
      last4: String(c.last4 || '').replace(/[^0-9]/g, '').slice(-4)
    }));
}

/** Add or update (by id) one card; duplicate names are merged. */
export function upsertTripCard(cards, card) {
  const list = tripCards({ cards });
  const clean = {
    id: card?.id || newCardId(),
    name: String(card?.name || '').trim(),
    holderId: card?.holderId || '',
    bank: card?.bank || '',
    last4: String(card?.last4 || '').replace(/[^0-9]/g, '').slice(-4)
  };
  if (!clean.name) return list;
  const byName = list.findIndex(c => c.name.toLowerCase() === clean.name.toLowerCase());
  const byId = list.findIndex(c => c.id === clean.id);
  if (byId >= 0) list[byId] = { ...list[byId], ...clean };
  else if (byName >= 0) list[byName] = { ...list[byName], ...clean, id: list[byName].id };
  else list.push(clean);
  return list;
}

export function removeTripCard(cards, id) {
  return tripCards({ cards }).filter(c => c.id !== id);
}

/** Display label: "KBank Visa ••4321" (+ nothing else — holder shown separately). */
export function tripCardLabel(card) {
  const last4 = card?.last4 ? ` ••${card.last4}` : '';
  return `${card?.name || ''}${last4}`.trim();
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** Reject if `promise` does not settle in time (a hung upload must fall back). */
function withTimeout(promise, ms, message) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })
  ]).finally(() => clearTimeout(timer));
}

/**
 * Store a receipt photo for an expense.
 *
 * Tries Firebase Storage first; when Storage is unavailable (free tier / rules
 * not published / offline) the (compressed) image is inlined into the expense
 * document instead, so the feature still works everywhere.
 *
 * Never hangs: the Storage upload races a timeout and falls back to inline, and
 * the inline image is shrunk until its base64 form leaves headroom under
 * Firestore's ~1 MB document limit (otherwise the save itself would be rejected).
 *
 * @returns {Promise<{url:string, storage:'storage'|'inline'|'none', warning?:string}>}
 */
export async function uploadReceiptImage(tripId, expenseId, file) {
  if (!file) return { url: '', storage: 'none' };
  let blob;
  try {
    // A decoded image event that never fires must not wedge the whole save.
    blob = await withTimeout(compressImage(file, 1200, 0.72), 20000, 'receipt image compress timed out');
  } catch (e) {
    console.warn('receipt compress failed', e?.message || e);
    return { url: '', storage: 'none', warning: (e?.message || 'compress failed') };
  }

  if (storage && isStorageAvailable) {
    try {
      const path = `trips/${tripId}/receipts/${expenseId || Date.now()}_${Date.now()}.webp`;
      const ref = storageRef(storage, path);
      const url = await withTimeout((async () => {
        await uploadBytes(ref, blob);
        return getDownloadURL(ref);
      })(), 30000, 'receipt upload timed out');
      return { url, storage: 'storage' };
    } catch (e) {
      console.warn('receipt upload failed → inline', e?.code || e?.message);
    }
  }

  try {
    // Firestore documents cap at ~1 MB and base64 inflates by ~37% — keep the
    // inlined photo well under that so "save with receipt" never gets rejected.
    const INLINE_LIMIT = 600 * 1024;
    if (blob.size > INLINE_LIMIT) {
      for (const [maxWidth, quality] of [[900, 0.6], [700, 0.5], [500, 0.45]]) {
        try {
          const smaller = await compressImage(file, maxWidth, quality);
          if (smaller.size < blob.size) blob = smaller;
          if (blob.size <= INLINE_LIMIT) break;
        } catch { break; }
      }
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
