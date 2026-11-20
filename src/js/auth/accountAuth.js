/**
 * Account sign-in that works on the Firebase **free (Spark) plan**.
 *
 * Google / email+password sign-in needs no Cloud Functions: Firebase Auth hands
 * the browser a real uid and Firestore rules can grant access to that uid, which
 * is exactly what the trip membership model already relies on
 * (`trips/{tripId}/members/{uid}` + `trips/{tripId}.memberUids`).
 *
 * The old username + PIN member login stays in `auth/memberAuth.js` for people
 * without a Google account / created before this change.
 */
import {
  auth, db, functions, httpsCallable, isFirebaseConfigured,
  signInWithEmailAndPassword, signInWithCustomToken, setPersistence,
  browserLocalPersistence, browserSessionPersistence, getAuthErrorMessage
} from '../firebase.js';
import {
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  createUserWithEmailAndPassword, sendPasswordResetEmail, updateProfile, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  doc, getDoc, setDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  currentBrowserEnv, webStorageStatus, redirectSignInSafety, REDIRECT_REASON
} from '../utils/browserEnv.js';

export const USER_ROLES = { member: 'member', superAdmin: 'super_admin' };

/**
 * Sign-in that could not even start because of the browser (embedded chat-app
 * webview, blocked/partitioned storage). `authBrowserHelp` is the payload the
 * login screen uses to show “open in a real browser” steps.
 */
export const AUTH_BROWSER_ERROR = 'auth/browser-environment';

async function persistence(remember) {
  try {
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  } catch (e) {
    console.warn('setPersistence failed (continuing)', e?.message);
  }
}

let persistenceRequest = null;

/**
 * Apply “remember this device” **before** the user taps, so the click handler can
 * call `signInWithPopup()` synchronously. Safari only allows `window.open()` while
 * the user gesture is still active; awaiting a storage write inside the click
 * spends that gesture, the popup is blocked, and the user is sent through the
 * redirect flow — which is exactly the flow that fails with
 * “missing initial state” in storage-partitioned browsers.
 */
export function prepareAuthPersistence(remember = true) {
  if (!auth) return Promise.resolve();
  if (persistenceRequest?.remember === remember) return persistenceRequest.promise;
  const promise = persistence(remember);
  persistenceRequest = { remember, promise };
  return promise;
}

function authBrowserError(env, reason) {
  const err = new Error(reason === REDIRECT_REASON.storage
    ? 'เบราว์เซอร์นี้บล็อกการเก็บข้อมูลของเว็บ — เปิดหน้านี้ใน Chrome หรือ Safari แล้วล็อกอินใหม่'
    : 'Google ไม่อนุญาตให้ล็อกอินในเบราว์เซอร์ของแอปแชท — เปิดหน้านี้ใน Chrome หรือ Safari แล้วล็อกอินใหม่');
  err.code = AUTH_BROWSER_ERROR;
  err.authBrowserHelp = {
    reason,
    app: env?.app || null,
    label: env?.label || null,
    platform: env?.platform || 'other'
  };
  return err;
}

/**
 * A failed redirect leaves Firebase's pending-event keys behind. Clearing them
 * lets the next attempt start from a clean slate instead of failing again.
 */
function clearStaleRedirectState() {
  try {
    const store = window.sessionStorage;
    const keys = [];
    for (let i = 0; i < store.length; i += 1) {
      const key = store.key(i);
      if (key && /^firebase:(authEvent|pendingRedirect|redirectUser)/i.test(key)) keys.push(key);
    }
    keys.forEach(k => store.removeItem(k));
  } catch { /* storage blocked — nothing to clear */ }
}

/** Thai/English message for the Firebase Auth errors users actually hit. */
export function getAccountErrorMessage(error) {
  const code = String(error?.code || '');
  const raw = String(error?.message || '');
  if (code === AUTH_BROWSER_ERROR) return raw || 'เปิดหน้านี้ใน Chrome หรือ Safari แล้วล็อกอินใหม่';
  // The auth handler's own wording for a lost redirect state; the user sees it on
  // *.firebaseapp.com/__/auth/handler and then comes back to a blank page.
  if (/missing initial state|storage-?partition/i.test(raw)) {
    return 'การล็อกอินค้างอยู่ เพราะเบราว์เซอร์ไม่ได้เก็บสถานะการล็อกอินไว้ (missing initial state) — เปิดหน้านี้ใน Chrome หรือ Safari แล้วล็อกอินใหม่';
  }
  const map = {
    'auth/popup-blocked': 'เบราว์เซอร์บล็อกหน้าต่าง Google — อนุญาต popup แล้วลองใหม่ หรือใช้การล็อกอินแบบเปลี่ยนหน้า',
    'auth/popup-closed-by-user': 'ปิดหน้าต่าง Google ก่อนล็อกอินเสร็จ — ลองใหม่ได้เลย',
    'auth/cancelled-popup-request': 'มีหน้าต่างล็อกอินเปิดอยู่แล้ว — ปิดแล้วลองใหม่',
    'auth/web-storage-unsupported': 'เบราว์เซอร์นี้บล็อกที่เก็บข้อมูลของเว็บ (คุกกี้/โหมดส่วนตัว) — เปิดหน้านี้ใน Chrome หรือ Safari แล้วลองใหม่',
    'auth/operation-not-supported-in-this-environment': 'เบราว์เซอร์ของแอปนี้ไม่รองรับการล็อกอิน Google — เปิดหน้านี้ใน Chrome หรือ Safari',
    'auth/redirect-cancelled-by-user': 'ยกเลิกการล็อกอินก่อนเสร็จ — ลองใหม่ได้เลย',
    'auth/unauthorized-domain': 'โดเมนนี้ยังไม่ได้รับอนุญาตใน Firebase Console > Authentication > Settings > Authorized domains (ต้องเพิ่มโดเมนเว็บ เช่น xxx.github.io)',
    'auth/operation-not-allowed': 'ยังไม่เปิดวิธีล็อกอินนี้ — Firebase Console > Authentication > Sign-in method เปิด Google และ Email/Password',
    'auth/email-already-in-use': 'อีเมลนี้มีบัญชีอยู่แล้ว — กด "ล็อกอิน" แทนการสมัคร',
    'auth/weak-password': 'รหัสผ่านสั้นเกินไป (ต้อง 6 ตัวขึ้นไป)',
    'auth/invalid-email': 'รูปแบบอีเมลไม่ถูกต้อง',
    'auth/user-not-found': 'ไม่พบบัญชีนี้ — ถ้ายังไม่มีบัญชีให้กด "สมัครใหม่"',
    'auth/wrong-password': 'รหัสผ่านไม่ถูกต้อง',
    'auth/invalid-credential': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
    'auth/too-many-requests': 'พยายามหลายครั้งเกินไป — รอสักครู่แล้วลองใหม่',
    'auth/network-request-failed': 'เชื่อมต่อเครือข่ายไม่ได้ — ตรวจอินเทอร์เน็ต'
  };
  return map[code] || getAuthErrorMessage(error) || error?.message || 'ล็อกอินไม่สำเร็จ';
}

/**
 * Keep `users/{uid}` and the public directory (`publicProfiles/{uid}`) in sync.
 * The directory is what lets a trip admin find a member by email.
 */
export async function ensureUserProfile(user, { displayName, role = USER_ROLES.member } = {}) {
  if (!user?.uid || !db) return null;
  const name = displayName || user.displayName || (user.email ? user.email.split('@')[0] : 'Member');
  const email = user.email ? String(user.email).trim().toLowerCase() : null;
  const profile = {
    uid: user.uid,
    displayName: name,
    email,
    photoURL: user.photoURL || null,
    updatedAt: serverTimestamp()
  };
  // Exactly the public, allowlisted directory schema. Email-based search itself
  // is performed by a callable that verifies the caller manages this trip.
  const publicProfile = {
    uid: user.uid,
    displayName: name,
    email,
    photoURL: user.photoURL || null,
    updatedAt: serverTimestamp()
  };

  const flagDenied = (e) => {
    if (String(e?.code || '').includes('permission-denied')) {
      // Rules for users/publicProfiles are not published yet — the UI shows a
      // one-line notice with the fix (the join flow explains it in detail).
      try { window.__fujiProfileDenied = true; } catch {}
    }
  };

  // users/{uid} — created once (role member), never self-promoted.
  try {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { ...profile, role, createdAt: serverTimestamp() });
    } else {
      await setDoc(ref, profile, { merge: true });
    }
  } catch (e) {
    console.warn('ensureUserProfile: users doc failed', e?.code, e?.message);
    flagDenied(e);
  }

  // publicProfiles/{uid} — owner-readable only; admins search through the guarded callable.
  try {
    await setDoc(doc(db, 'publicProfiles', user.uid), publicProfile, { merge: true });
  } catch (e) {
    console.warn('ensureUserProfile: public profile failed', e?.code, e?.message);
    flagDenied(e);
  }

  return profile;
}

/**
 * Sign in with a Google account.
 *
 * Popup first, and the popup is opened **inside** the user gesture (no `await`
 * before it) — see `prepareAuthPersistence`. The redirect fallback only runs when
 * this browser can actually finish it: a chat-app webview or a browser with
 * blocked/partitioned storage can never complete the redirect, and the user would
 * end up on the Firebase handler's “missing initial state” page. In that case we
 * throw an error carrying `authBrowserHelp` so the login screen can offer
 * “open in Chrome / Safari” instead.
 */
export async function signInWithGoogle(remember = true) {
  if (!isFirebaseConfigured) throw new Error('ยังไม่ได้ตั้งค่า Firebase');
  const env = currentBrowserEnv();
  const safety = redirectSignInSafety(env, webStorageStatus());
  // Fire-and-forget on purpose: awaiting here would spend Safari's user gesture.
  prepareAuthPersistence(remember);

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const cred = await signInWithPopup(auth, provider);
    await ensureUserProfile(cred.user);
    return cred.user;
  } catch (error) {
    const code = String(error?.code || '');
    // A popup that never opens (blocked, or the webview "opens" and immediately
    // closes it) is the moment a redirect would normally take over.
    const popupDead = /popup-blocked|operation-not-supported-in-this-environment|cancelled-popup-request/i.test(code)
      || (env.inApp && /popup-closed-by-user/i.test(code));
    if (popupDead) {
      if (!safety.safe) throw authBrowserError(env, safety.reason);
      await signInWithRedirect(auth, provider);
      return null;
    }
    if (env.inApp && /web-storage-unsupported/i.test(code)) throw authBrowserError(env, REDIRECT_REASON.inAppBrowser);
    throw new Error(getAccountErrorMessage(error));
  }
}

/** Finish a redirect sign-in (returns the user or null). */
export async function completeRedirectSignIn() {
  if (!auth) return null;
  try {
    const cred = await getRedirectResult(auth);
    if (cred?.user) {
      await ensureUserProfile(cred.user);
      return cred.user;
    }
  } catch (e) {
    const raw = String(e?.code || '') + ' ' + String(e?.message || '');
    // “Unable to process request due to missing initial state…” — the redirect
    // state was lost between the app and the auth handler.
    if (/missing initial state|storage-?partition/i.test(raw)) {
      clearStaleRedirectState();
      const env = currentBrowserEnv();
      const err = authBrowserError(env, REDIRECT_REASON.missingState);
      err.cause = e;
      throw err;
    }
    console.warn('redirect sign-in failed', e?.code, e?.message);
    throw new Error(getAccountErrorMessage(e));
  }
  return null;
}

export async function signInEmailAccount(email, password, remember = true) {
  if (!isFirebaseConfigured) throw new Error('ยังไม่ได้ตั้งค่า Firebase');
  if (!email || !email.includes('@')) throw new Error('กรุณากรอกอีเมลที่ถูกต้อง');
  if (!password || password.length < 6) throw new Error('รหัสผ่านต้องอย่างน้อย 6 ตัวอักษร');
  await prepareAuthPersistence(remember);
  try {
    const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
    await ensureUserProfile(cred.user);
    return cred.user;
  } catch (error) {
    throw new Error(getAccountErrorMessage(error));
  }
}

/** Members may create their own account (role: member) — no admin needed. */
export async function signUpEmailAccount(email, password, displayName, remember = true) {
  if (!isFirebaseConfigured) throw new Error('ยังไม่ได้ตั้งค่า Firebase');
  if (!email || !email.includes('@')) throw new Error('กรุณากรอกอีเมลที่ถูกต้อง');
  if (!password || password.length < 6) throw new Error('รหัสผ่านต้องอย่างน้อย 6 ตัวอักษร');
  await prepareAuthPersistence(remember);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    if (displayName) {
      try { await updateProfile(cred.user, { displayName }); } catch {}
    }
    await ensureUserProfile(cred.user, { displayName });
    return cred.user;
  } catch (error) {
    throw new Error(getAccountErrorMessage(error));
  }
}

export async function sendAccountPasswordReset(email) {
  if (!email || !email.includes('@')) throw new Error('กรุณากรอกอีเมลที่ถูกต้อง');
  try {
    await sendPasswordResetEmail(auth, email.trim());
    return true;
  } catch (error) {
    throw new Error(getAccountErrorMessage(error));
  }
}

export async function signOutAccount() {
  try { await signOut(auth); } catch (e) { console.warn('signOut failed', e?.message); }
}

/** Exact email lookup used by "Add member by email" (trip admins only). */
export async function findProfileByEmail(email, tripId) {
  if (!db || !email) return null;
  if (!tripId) throw new Error('ต้องระบุทริปก่อนค้นหาสมาชิก');
  if (!functions) throw new Error('ค้นหาด้วยอีเมลต้อง deploy Cloud Functions ก่อน');
  const target = String(email).trim().toLowerCase();
  try {
    const call = httpsCallable(functions, 'findMemberProfileByEmail');
    const res = await call({ email: target, tripId });
    return res?.data?.profile || null;
  } catch (e) {
    console.warn('findProfileByEmail failed', e?.code, e?.message);
    if (String(e?.code || '').includes('permission-denied')) {
      throw new Error('ค้นหาอีเมลได้เฉพาะผู้ดูแลสมาชิกของทริปนี้');
    }
    throw new Error('ค้นหาอีเมลไม่ได้ — ตรวจว่าได้ deploy Cloud Functions และ Firestore Rules ล่าสุดแล้ว');
  }
}

export { signInWithCustomToken };
