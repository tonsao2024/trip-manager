// Minimal firebase/auth stand-in. The harness calls __emitAuth(user).
export const browserLocalPersistence = 'local';
export const browserSessionPersistence = 'session';
export const indexedDBLocalPersistence = 'indexeddb';
const listeners = new Set();
export function getAuth() { return { __auth: true, currentUser: __currentUser, signOut: () => Promise.resolve() }; }
export let __currentUser = null;
export function onAuthStateChanged(auth, cb) { listeners.add(cb); return () => listeners.delete(cb); }
export function __emitAuth(user) { __currentUser = user; listeners.forEach(cb => cb(user)); }
export function setPersistence() { return Promise.resolve(); }
export function signInWithEmailAndPassword() { return Promise.resolve({ user: __currentUser }); }
export function signInWithCustomToken() { return Promise.resolve({ user: __currentUser }); }
export function signOut() { __currentUser = null; __emitAuth(null); return Promise.resolve(); }
export function updateProfile() { return Promise.resolve(); }
export function sendPasswordResetEmail() { return Promise.resolve(); }

// ---- Google / email account sign-in (member login on the free plan) ----
export let __googleUser = null;
export function __setGoogleUser(user) { __googleUser = user; }
export class GoogleAuthProvider { setCustomParameters() {} }
export function signInWithPopup() {
  if (!__googleUser) {
    const err = new Error('popup blocked'); err.code = 'auth/popup-blocked'; return Promise.reject(err);
  }
  __emitAuth(__googleUser);
  return Promise.resolve({ user: __googleUser });
}
export function signInWithRedirect() { return Promise.resolve(); }
export function getRedirectResult() { return Promise.resolve(null); }
export function createUserWithEmailAndPassword(_auth, email, password) {
  const user = { uid: 'new-' + Math.random().toString(36).slice(2, 8), email, password, displayName: null, photoURL: null, providerData: [{ providerId: 'password' }] };
  __emitAuth(user);
  return Promise.resolve({ user });
}
export default {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  createUserWithEmailAndPassword, sendPasswordResetEmail, updateProfile
};
