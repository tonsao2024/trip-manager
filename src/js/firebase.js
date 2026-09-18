// Firebase initialization - Modular v9+
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, setPersistence, browserLocalPersistence, browserSessionPersistence, onAuthStateChanged, signInWithEmailAndPassword, signInWithCustomToken, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, enableIndexedDbPersistence, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';

// Placeholder config - user must fill in from Firebase console
// See firebase.config.template.js for instructions
const firebaseConfig = {
  apiKey: "__FIREBASE_API_KEY__",
  authDomain: "__FIREBASE_AUTH_DOMAIN__",
  projectId: "__FIREBASE_PROJECT_ID__",
  storageBucket: "__FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__FIREBASE_APP_ID__"
};

// Allow override via window.__FIREBASE_CONFIG__ for GitHub Pages
const finalConfig = window.__FIREBASE_CONFIG__ || firebaseConfig;

// Robust check
function checkConfigured(cfg) {
  if (!cfg) return false;
  const required = ['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'];
  for (const k of required) {
    const v = cfg[k];
    if (!v || typeof v !== 'string' || v.trim() === '' || v.startsWith('__')) return false;
  }
  return true;
}
export const isFirebaseConfigured = checkConfigured(finalConfig);
export const firebaseConfigStatus = {
  configured: isFirebaseConfigured,
  hasOverride: !!window.__FIREBASE_CONFIG__,
  missing: (() => {
    const required = ['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'];
    return required.filter(k => !finalConfig[k] || String(finalConfig[k]).startsWith('__'));
  })()
};

if (typeof window !== 'undefined') {
  console.log('[Firebase] Configured:', isFirebaseConfigured, 'Override:', !!window.__FIREBASE_CONFIG__, 'Missing:', firebaseConfigStatus.missing);
  if (!isFirebaseConfigured) console.warn('[Firebase] Not configured - showing config screen. Set localStorage fuji_firebase_config');
}

let app, auth, db, storage, functions;

try {
  app = initializeApp(finalConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  storage = getStorage(app);
  functions = getFunctions(app, 'asia-southeast1'); // Change region as needed

  // Enable offline persistence (basic, not PWA)
  if (typeof window !== 'undefined') {
    enableIndexedDbPersistence(db).catch(err => {
      console.warn('Persistence failed:', err.code);
    });
  }
} catch (e) {
  console.warn('Firebase init failed (likely placeholder config):', e.message);
  // Create mock objects to prevent crashes in dev
  app = null; auth = null; db = null; storage = null; functions = null;
}

export { app, auth, db, storage, functions, serverTimestamp };
export { onAuthStateChanged, signInWithEmailAndPassword, signInWithCustomToken, signOut, setPersistence, browserLocalPersistence, browserSessionPersistence, httpsCallable };

// Sync status helper
export const syncState = {
  status: 'online', // online, offline, syncing, failed
  lastSync: null,
  listeners: new Set(),
  set(s) {
    this.status = s;
    if (s === 'online') this.lastSync = new Date();
    this.listeners.forEach(fn => fn(s));
  },
  subscribe(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => syncState.set('online'));
  window.addEventListener('offline', () => syncState.set('offline'));
}
