// Username/PIN members use callable Cloud Functions for every credential action.
// PIN verification and the username-to-member registry must never run in the browser:
// `memberSecrets` and `publicMemberLogins` are server-only collections.

import {
  auth, functions, isFirebaseConfigured, httpsCallable,
  signInWithCustomToken, setPersistence,
  browserLocalPersistence, browserSessionPersistence
} from '../firebase.js';

const SESSION_KEY = 'fuji_member_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // legacy device-only session compatibility

export function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase().replace(/\s+/g, '');
}

function requireFunctions() {
  if (!isFirebaseConfigured) throw new Error('ยังไม่ได้ตั้งค่า Firebase');
  if (!functions) throw new Error('Cloud Functions ยังไม่พร้อม — กรุณาติดต่อผู้ดูแลระบบ');
}

async function callMemberFunction(name, data) {
  requireFunctions();
  const result = await httpsCallable(functions, name)(data);
  return result?.data || {};
}

/** Set/reset a PIN on the server; the callable hashes it and publishes the login index. */
export async function setMemberPin(tripId, memberId, pin, username, previousUsername = null) {
  const norm = normalizeUsername(username);
  const value = String(pin ?? '');
  if (!tripId || !memberId || !norm) throw new Error('ต้องระบุทริป สมาชิก และชื่อผู้ใช้ก่อนตั้ง PIN');
  if (value.length < 4 || value.length > 12) throw new Error('PIN ต้อง 4-12 ตัวอักษร');
  const result = await callMemberFunction('setMemberPin', {
    tripId,
    memberId,
    username: norm,
    previousUsername: normalizeUsername(previousUsername) || null,
    pin: value
  });
  if (result.success !== true) throw new Error('บันทึก PIN ไม่สำเร็จ');
  return true;
}

/** Remove the server-side PIN/login index; used when a member is deleted or loses a username. */
export async function clearMemberPin(tripId, memberId, username = null) {
  const result = await callMemberFunction('clearMemberPin', {
    tripId,
    memberId,
    username: normalizeUsername(username) || null
  });
  if (result.success !== true) throw new Error('Server PIN cleanup did not complete');
  return true;
}

/** Move the private username index after a member's username changes. */
export async function publishMemberLookup(username, tripId, memberId, previousUsername = null) {
  const norm = normalizeUsername(username);
  if (!norm) throw new Error('กรุณากรอกชื่อผู้ใช้');
  const result = await callMemberFunction('publishMemberLoginLookup', {
    username: norm,
    previousUsername: normalizeUsername(previousUsername) || null,
    tripId,
    memberId
  });
  if (result.success !== true) throw new Error('อัปเดตชื่อผู้ใช้สำหรับเข้าสู่ระบบไม่สำเร็จ');
  return norm;
}

/** Backwards-compatible helper name; cleanup is now a server callable, never a client write. */
export async function unpublishMemberLookup(username, tripId, memberId) {
  if (!tripId || !memberId) return false;
  return clearMemberPin(tripId, memberId, username);
}

/* ------------------------------- session -------------------------------- */

// Old devices may still carry a local-only session. Keep reading and clearing it
// so those users can leave the legacy view, but new PIN logins always sign in with
// Firebase Auth and no longer create this client-trusted session.
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
  for (const storage of [globalThis.localStorage, globalThis.sessionStorage]) {
    try {
      if (!storage) continue;
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
  try { globalThis.localStorage?.removeItem(SESSION_KEY); } catch {}
  try { globalThis.sessionStorage?.removeItem(SESSION_KEY); } catch {}
}

/* -------------------------------- login --------------------------------- */

/** Verify a PIN on the server and exchange its result for a real Firebase Auth session. */
export async function memberLogin(username, pin, tripIdHint = null, remember = true) {
  const norm = normalizeUsername(username);
  const value = String(pin ?? '');
  if (!norm) throw new Error('กรุณากรอกชื่อผู้ใช้');
  if (value.length < 4 || value.length > 12) throw new Error('PIN ต้อง 4-12 ตัวอักษร');
  if (!auth) throw new Error('Auth ยังไม่พร้อม');

  try {
    const result = await callMemberFunction('loginWithUsernamePin', {
      username: norm,
      pin: value,
      tripId: tripIdHint || null
    });
    if (!result.token || !result.tripId || !result.memberId) {
      throw new Error('เซิร์ฟเวอร์เข้าสู่ระบบส่งข้อมูลไม่ครบ');
    }
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
    const credential = await signInWithCustomToken(auth, result.token);
    clearMemberSession();
    return {
      tripId: result.tripId,
      memberId: result.memberId,
      member: { ...(result.member || {}), id: result.memberId },
      user: credential.user
    };
  } catch (e) {
    const code = String(e?.code || '').replace(/^functions\//, '');
    if (code === 'unauthenticated') throw new Error('ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง');
    if (code === 'resource-exhausted') throw new Error('ลองเข้าสู่ระบบบ่อยเกินไป — รอสักครู่แล้วลองใหม่');
    throw e;
  }
}
