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
  auth, db, isFirebaseConfigured,
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

export const USER_ROLES = { member: 'member', superAdmin: 'super_admin' };

async function persistence(remember, rememberFn) {
  if (!rememberFn) return;
  try {
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  } catch (e) {
    console.warn('setPersistence failed (continuing)', e?.message);
  }
}

/** Thai/English message for the Firebase Auth errors users actually hit. */
export function getAccountErrorMessage(error) {
  const code = String(error?.code || '');
  const map = {
    'auth/popup-blocked': 'เบราว์เซอร์บล็อกหน้าต่าง Google — อนุญาต popup แล้วลองใหม่ หรือใช้การล็อกอินแบบเปลี่ยนหน้า',
    'auth/popup-closed-by-user': 'ปิดหน้าต่าง Google ก่อนล็อกอินเสร็จ — ลองใหม่ได้เลย',
    'auth/cancelled-popup-request': 'มีหน้าต่างล็อกอินเปิดอยู่แล้ว — ปิดแล้วลองใหม่',
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
  const profile = {
    uid: user.uid,
    displayName: name,
    email: user.email || null,
    photoURL: user.photoURL || null,
    updatedAt: serverTimestamp()
  };
  const publicProfile = {
    uid: user.uid,
    displayName: name,
    email: user.email || null,
    photoURL: user.photoURL || null,
    updatedAt: serverTimestamp()
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
  }

  // publicProfiles/{uid} — readable by any signed-in user so admins can search.
  try {
    await setDoc(doc(db, 'publicProfiles', user.uid), publicProfile, { merge: true });
  } catch (e) {
    console.warn('ensureUserProfile: public profile failed', e?.code, e?.message);
  }

  return profile;
}

/** Sign in with a Google account (popup, with redirect fallback for mobile). */
export async function signInWithGoogle(remember = true) {
  if (!isFirebaseConfigured) throw new Error('ยังไม่ได้ตั้งค่า Firebase');
  await persistence(remember);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const cred = await signInWithPopup(auth, provider);
    await ensureUserProfile(cred.user);
    return cred.user;
  } catch (error) {
    const code = String(error?.code || '');
    // Popups are blocked or unsupported (iOS in-app browsers) → full redirect.
    if (/popup-blocked|operation-not-supported-in-this-environment|cancelled-popup-request/i.test(code)) {
      await signInWithRedirect(auth, provider);
      return null;
    }
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
    console.warn('redirect sign-in failed', e?.code, e?.message);
    throw new Error(getAccountErrorMessage(e));
  }
  return null;
}

export async function signInEmailAccount(email, password, remember = true) {
  if (!isFirebaseConfigured) throw new Error('ยังไม่ได้ตั้งค่า Firebase');
  if (!email || !email.includes('@')) throw new Error('กรุณากรอกอีเมลที่ถูกต้อง');
  if (!password || password.length < 6) throw new Error('รหัสผ่านต้องอย่างน้อย 6 ตัวอักษร');
  await persistence(remember);
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
  await persistence(remember);
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

/** Exact email lookup used by "Add member by email" (admin side). */
export async function findProfileByEmail(email) {
  if (!db || !email) return null;
  const target = String(email).trim().toLowerCase();
  try {
    const { collection, query, where, limit, getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const snap = await getDocs(query(collection(db, 'publicProfiles'), where('email', '==', target), limit(1)));
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { id: d.id, ...d.data() };
  } catch (e) {
    console.warn('findProfileByEmail failed', e?.code, e?.message);
    throw new Error('ค้นหาอีเมลไม่ได้ — ตรวจว่าได้ deploy firestore.rules แล้ว');
  }
}

export { signInWithCustomToken };
