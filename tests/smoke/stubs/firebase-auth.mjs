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
export default { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, setPersistence };
