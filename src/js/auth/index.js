import { auth, db, functions, isFirebaseConfigured, signInWithEmailAndPassword, signInWithCustomToken, signOut, setPersistence, browserLocalPersistence, browserSessionPersistence, httpsCallable } from '../firebase.js';
import { toast } from '../components/toast.js';

export async function loginAdmin(email, password, remember = true) {
  if (!isFirebaseConfigured) throw new Error('Firebase not configured');
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function loginMember(username, pin, tripId, remember = true) {
  if (!isFirebaseConfigured) throw new Error('Firebase not configured');
  const fn = httpsCallable(functions, 'loginWithUsernamePin');
  const res = await fn({ username, pin, tripId });
  const { token } = res.data;
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  const cred = await signInWithCustomToken(auth, token);
  return cred.user;
}

export async function logout() {
  if (auth) await signOut(auth);
  localStorage.removeItem('fuji_current_trip');
  localStorage.removeItem('fuji_stepup_until');
}

export async function verifySensitiveAction(pin, action) {
  if (!isFirebaseConfigured) throw new Error('Firebase not configured');
  const fn = httpsCallable(functions, 'verifySensitiveActionPin');
  const res = await fn({ pin, action });
  const { sessionExpiry } = res.data;
  localStorage.setItem('fuji_stepup_until', sessionExpiry);
  return true;
}

export function hasStepUpSession() {
  const until = localStorage.getItem('fuji_stepup_until');
  if (!until) return false;
  return new Date(until) > new Date();
}

export function getCurrentUser() {
  return auth?.currentUser || null;
}

export function requireAuth() {
  return new Promise((resolve, reject) => {
    if (!auth) return reject(new Error('Auth not init'));
    const unsub = auth.onAuthStateChanged(user => {
      unsub();
      if (user) resolve(user);
      else reject(new Error('Not authenticated'));
    });
  });
}
