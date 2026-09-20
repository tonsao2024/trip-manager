// Member login that does NOT depend on Cloud Functions.
//
// Cloud Functions on the free tier (or before `firebase deploy --only functions`)
// answer `internal` for createMemberAccount / loginWithUsernamePin, which used to
// break "add member" and member login completely. This module stores the member
// credentials inside the trip itself:
//
//   trips/{tripId}/members/{memberId}  { pinHash, loginReady: true, … }
//
// and lets a member sign in by looking the username up in a public registry doc:
//
//   publicMemberLogins/{username}      { tripId, memberId }
//
// The PIN is hashed with PBKDF2-SHA256 (100k iterations, random salt) so the raw
// PIN is never stored. Everything runs in the browser — no function deploys needed.

import { db } from '../firebase.js';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const PBKDF2_ITERATIONS = 100000;
const SESSION_KEY = 'fuji_member_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days when "remember me"

export function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase().replace(/\s+/g, '');
}

function getCrypto() {
  return (typeof window !== 'undefined' && window.crypto) || globalThis.crypto || null;
}

function toHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function pbkdf2Hex(pin, saltHex, iterations = PBKDF2_ITERATIONS) {
  const c = getCrypto();
  if (!c?.subtle) return null; // no WebCrypto (http:// or very old browser)
  const enc = new TextEncoder();
  const key = await c.subtle.importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array((saltHex.match(/.{2}/g) || []).map(h => parseInt(h, 16)));
  const bits = await c.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return toHex(new Uint8Array(bits));
}

function randomHex(bytes = 16) {
  const c = getCrypto();
  if (c?.getRandomValues) {
    const arr = new Uint8Array(bytes);
    c.getRandomValues(arr);
    return toHex(arr);
  }
  return Array.from({ length: bytes * 2 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

/** Create/refresh the local PIN hash on the member document. */
export async function setMemberPin(tripId, memberId, pin) {
  const c = getCrypto();
  if (!c?.subtle) {
    throw new Error('เบราว์เซอร์นี้ไม่รองรับการเข้ารหัส PIN — กรุณาเปิดผ่าน https:// (หรือใช้ Chrome/Safari รุ่นใหม่)');
  }
  const salt = randomHex(16);
  const pinHash = await pbkdf2Hex(pin, salt);
  await updateDoc(doc(db, `trips/${tripId}/members/${memberId}`), {
    pinHash,
    pinSalt: salt,
    pinIterations: PBKDF2_ITERATIONS,
    pinAlgo: 'pbkdf2-sha256',
    loginReady: true,
    failedAttempts: 0
  });
  return true;
}

export async function clearMemberPin(tripId, memberId) {
  try {
    await updateDoc(doc(db, `trips/${tripId}/members/${memberId}`), {
      pinHash: null, pinSalt: null, loginReady: false
    });
  } catch (e) {
    console.warn('[MemberAuth] clear pin failed', e?.message);
  }
}

/** Publish (or refresh) the username → trip/member lookup used by the login page. */
export async function publishMemberLookup(username, tripId, memberId) {
  const norm = normalizeUsername(username);
  if (!norm) throw new Error('กรุณากรอกชื่อผู้ใช้');
  await setDoc(doc(db, 'publicMemberLogins', norm), {
    username: norm,
    tripId,
    memberId,
    updatedAt: Date.now()
  }, { merge: true });
  return norm;
}

export async function unpublishMemberLookup(username) {
  const norm = normalizeUsername(username);
  if (!norm) return;
  try {
    await setDoc(doc(db, 'publicMemberLogins', norm), { disabled: true, updatedAt: Date.now() }, { merge: true });
  } catch (e) {
    console.warn('[MemberAuth] unpublish failed', e?.message);
  }
}

/** Where can this username log in? Tries the registry, then every member collection. */
export async function findMemberByUsername(username, tripIdHint = null) {
  const norm = normalizeUsername(username);
  if (!norm) return null;

  if (tripIdHint) {
    const direct = await findMemberInTrip(tripIdHint, norm);
    if (direct) return direct;
  }

  try {
    const snap = await getDoc(doc(db, 'publicMemberLogins', norm));
    if (snap.exists()) {
      const data = snap.data();
      if (!data.disabled && data.tripId && data.memberId) {
        const member = await getMemberDoc(data.tripId, data.memberId);
        if (member) return member;
      }
    }
  } catch (e) {
    console.warn('[MemberAuth] lookup registry failed', e?.code || e?.message);
  }

  // Fallback: search member collections (rules allow an authenticated list on trips)
  try {
    const tripsSnap = await getDocs(query(collection(db, 'trips'), limit(30)));
    for (const tripDoc of tripsSnap.docs) {
      const found = await findMemberInTrip(tripDoc.id, norm);
      if (found) return found;
    }
  } catch (e) {
    console.warn('[MemberAuth] trips scan failed', e?.code || e?.message);
  }
  return null;
}

async function findMemberInTrip(tripId, norm) {
  try {
    const q = query(collection(db, `trips/${tripId}/members`), where('username', '==', norm), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
      const d = snap.docs[0];
      return { tripId, memberId: d.id, member: d.data() };
    }
  } catch (e) {
    console.warn('[MemberAuth] member query failed', e?.code || e?.message);
  }
  return null;
}

async function getMemberDoc(tripId, memberId) {
  try {
    const snap = await getDoc(doc(db, `trips/${tripId}/members/${memberId}`));
    if (!snap.exists()) return null;
    return { tripId, memberId, member: snap.data() };
  } catch (e) {
    console.warn('[MemberAuth] member read failed', e?.code || e?.message);
    return null;
  }
}

/* ------------------------------- session -------------------------------- */

export function saveMemberSession({ tripId, memberId, username, displayName, photoURL, color, role, remember = true }) {
  const payload = {
    tripId, memberId, username, displayName, photoURL, color, role,
    ts: Date.now(),
    expires: remember ? Date.now() + SESSION_TTL_MS : 0
  };
  try {
    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(SESSION_KEY, JSON.stringify(payload));
  } catch {}
  return payload;
}

export function getMemberSession() {
  for (const storage of [localStorage, sessionStorage]) {
    try {
      const raw = storage.getItem(SESSION_KEY);
      if (!raw) continue;
      const data = JSON.parse(raw);
      if (data.expires && Date.now() > data.expires) { storage.removeItem(SESSION_KEY); continue; }
      return data;
    } catch {}
  }
  return null;
}

export function clearMemberSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
  try { sessionStorage.removeItem(SESSION_KEY); } catch {}
}

/* -------------------------------- login --------------------------------- */

export async function memberLogin(username, pin, tripIdHint = null, remember = true) {
  const norm = normalizeUsername(username);
  const found = await findMemberByUsername(norm, tripIdHint);
  if (!found) throw new Error('ไม่พบชื่อผู้ใช้นี้ — ตรวจสอบชื่อผู้ใช้ หรือให้แอดมินเพิ่มสมาชิกใหม่');

  const { tripId, memberId, member } = found;
  if (member.status && member.status !== 'active') throw new Error('บัญชีนี้ถูกระงับการใช้งาน');
  if (!member.pinHash || !member.pinSalt) {
    throw new Error('สมาชิกนี้ยังไม่ได้ตั้ง PIN — ให้แอดมินแก้ไขสมาชิกแล้วตั้ง PIN ให้');
  }

  const attempt = await pbkdf2Hex(pin, member.pinSalt, member.pinIterations || PBKDF2_ITERATIONS);
  if (!attempt) throw new Error('เบราว์เซอร์นี้ไม่รองรับการตรวจสอบ PIN — เปิดผ่าน https:// แล้วลองใหม่');
  if (attempt !== member.pinHash) {
    try {
      await updateDoc(doc(db, `trips/${tripId}/members/${memberId}`), {
        failedAttempts: (Number(member.failedAttempts) || 0) + 1,
        lastFailedAt: Date.now()
      });
    } catch {}
    throw new Error('PIN ไม่ถูกต้อง');
  }

  try {
    await updateDoc(doc(db, `trips/${tripId}/members/${memberId}`), { failedAttempts: 0, lastLoginAt: Date.now() });
  } catch {}

  // Keep the trip list readable for this member id (rules use memberUids)
  try {
    const tripRef = doc(db, 'trips', tripId);
    const tripSnap = await getDoc(tripRef);
    if (tripSnap.exists()) {
      const uids = tripSnap.data().memberUids || [];
      if (!uids.includes(memberId)) await updateDoc(tripRef, { memberUids: [...uids, memberId] });
    }
  } catch (e) {
    console.warn('[MemberAuth] could not add uid to memberUids', e?.code || e?.message);
  }

  return { tripId, memberId, member: { ...member, id: memberId } };
}
