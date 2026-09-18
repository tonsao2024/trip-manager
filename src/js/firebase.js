// Firebase initialization - Modular v9+ - Optimized v2.2
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, setPersistence, browserLocalPersistence, browserSessionPersistence, onAuthStateChanged, signInWithEmailAndPassword, signInWithCustomToken, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, enableIndexedDbPersistence, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';

// Placeholder config
const firebaseConfig = {
  apiKey: "__FIREBASE_API_KEY__",
  authDomain: "__FIREBASE_AUTH_DOMAIN__",
  projectId: "__FIREBASE_PROJECT_ID__",
  storageBucket: "__FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__FIREBASE_APP_ID__"
};

const finalConfig = window.__FIREBASE_CONFIG__ || firebaseConfig;

function checkConfigured(cfg) {
  if (!cfg) return false;
  const required = ['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'];
  for (const k of required) {
    const v = cfg[k];
    if (!v || typeof v !== 'string' || v.trim() === '' || v.startsWith('__')) return false;
    if (k === 'apiKey' && !v.startsWith('AIza')) return false;
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
  if (!isFirebaseConfigured) console.warn('[Firebase] Not configured - showing config screen');
}

let app = null, auth = null, db = null, storage = null, functions = null;

if (isFirebaseConfigured) {
  try {
    app = initializeApp(finalConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    functions = getFunctions(app, 'asia-southeast1');

    // Persistence - non-blocking, use requestIdleCallback if available
    const enablePersistence = () => {
      enableIndexedDbPersistence(db).catch(err => {
        if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
          console.warn('Persistence failed:', err.code, err.message);
        }
      });
    };
    if (typeof window !== 'undefined') {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(enablePersistence, { timeout: 2000 });
      } else {
        setTimeout(enablePersistence, 1000);
      }
    }
    console.log('[Firebase] Initialized OK');
  } catch (e) {
    console.error('Firebase init failed:', e.message, e.code);
    app = null; auth = null; db = null; storage = null; functions = null;
  }
} else {
  console.log('[Firebase] Skipping init - not configured');
}

export { app, auth, db, storage, functions, serverTimestamp };
export { onAuthStateChanged, signInWithEmailAndPassword, signInWithCustomToken, signOut, setPersistence, browserLocalPersistence, browserSessionPersistence, httpsCallable };

export const syncState = {
  status: 'online',
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

// Helper to get user-friendly auth error
export function getAuthErrorMessage(error) {
  const code = error?.code || '';
  const msg = error?.message || '';
  
  if (code.includes('network-request-failed') || msg.includes('network')) {
    return `🌐 เชื่อมต่อ Firebase ไม่ได้ (network-request-failed)\n\nวิธีแก้:\n1. ตรวจสอบ Internet\n2. ตรวจสอบ Firebase Config ถูกต้องไหม (apiKey ต้องขึ้นต้น AIza...)\n3. ไป Firebase Console > Authentication > Settings > Authorized domains > เพิ่ม ${location.hostname}\n4. เปิด Authentication > Email/Password ให้ Enabled\n5. ลองปิด AdBlock / VPN\n\nError: ${code} ${msg}`;
  }
  if (code.includes('invalid-api-key')) {
    return `🔑 API Key ไม่ถูกต้อง\nตรวจสอบ Firebase Config ใน localStorage ว่า apiKey ถูกต้อง\n\n${code}`;
  }
  if (code.includes('user-not-found')) return '❌ ไม่พบผู้ใช้นี้';
  if (code.includes('wrong-password') || code.includes('invalid-credential')) return '❌ อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if (code.includes('too-many-requests')) return '⏳ ลองมากเกินไป กรุณารอสักครู่';
  if (code.includes('invalid-email')) return '❌ อีเมลไม่ถูกต้อง';
  if (code.includes('auth-domain-config-required') || code.includes('unauthorized-domain')) {
    return `🔒 Domain นี้ไม่ได้รับอนุญาต\nไปที่ Firebase Console > Authentication > Settings > Authorized domains\nเพิ่ม: ${location.hostname}\n\n${code}`;
  }
  return `❌ ${code ? code + ': ' : ''}${msg || 'Login failed'}`;
}
