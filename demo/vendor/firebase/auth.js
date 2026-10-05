/** Dev-only firebase/auth stand-in for the offline demo — always signed in. */
const listeners = new Set();
export const browserLocalPersistence = 'local';
export const browserSessionPersistence = 'session';
export const indexedDBLocalPersistence = 'indexeddb';

export const DEMO_USER = { uid: 'demo-user', email: 'demo@fuji.app', displayName: 'สมชาย (demo)', photoURL: null };
export let __currentUser = DEMO_USER;

export function getAuth() { return { __auth: true, get currentUser() { return __currentUser; }, signOut: () => Promise.resolve() }; }
export function onAuthStateChanged(_auth, cb) {
  listeners.add(cb);
  setTimeout(() => cb(__currentUser), 0);   // fire like the real SDK does
  return () => listeners.delete(cb);
}
export function __emitAuth(user) { __currentUser = user; listeners.forEach(cb => cb(user)); }
export function __updateLocalUser(profile) { __currentUser = { ...(__currentUser || {}), ...profile }; __emitAuth(__currentUser); }
export function setPersistence() { return Promise.resolve(); }
export function signInWithEmailAndPassword() { __emitAuth(DEMO_USER); return Promise.resolve({ user: DEMO_USER }); }
export function signInWithCustomToken() { __emitAuth(DEMO_USER); return Promise.resolve({ user: DEMO_USER }); }
export function signOut() { return Promise.resolve(); }   // demo stays usable — never really signs out
export function updateProfile(_u, profile) { __updateLocalUser(profile); return Promise.resolve(); }
export function sendPasswordResetEmail() { return Promise.resolve(); }
export class GoogleAuthProvider { setCustomParameters() {} }
export function signInWithPopup() { __emitAuth(DEMO_USER); return Promise.resolve({ user: DEMO_USER }); }
export function signInWithRedirect() { __emitAuth(DEMO_USER); return Promise.resolve(); }
export function getRedirectResult() { return Promise.resolve(null); }
export function createUserWithEmailAndPassword(_auth, email) {
  const user = { ...DEMO_USER, email };
  __emitAuth(user);
  return Promise.resolve({ user });
}
export default {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signInWithCustomToken, signOut, setPersistence,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult,
  createUserWithEmailAndPassword, sendPasswordResetEmail, updateProfile
};
