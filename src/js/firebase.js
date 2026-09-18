// Firebase initialization - Modular v9+ - Optimized v2.3 with hardcoded config support
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, setPersistence, browserLocalPersistence, browserSessionPersistence, onAuthStateChanged, signInWithEmailAndPassword, signInWithCustomToken, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, enableIndexedDbPersistence, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js';
import { firebaseConfig as hardcodedConfig, isConfigHardcoded } from './firebase.config.js';

// Placeholder config
const placeholderConfig = {
  apiKey: "__FIREBASE_API_KEY__",
  authDomain: "__FIREBASE_AUTH_DOMAIN__",
  projectId: "__FIREBASE_PROJECT_ID__",
  storageBucket: "__FIREBASE_STORAGE_BUCKET__",
  messagingSenderId: "__FIREBASE_MESSAGING_SENDER_ID__",
  appId: "__FIREBASE_APP_ID__"
};

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

// Try multiple sources in priority order:
// 1. window.__FIREBASE_CONFIG__ (for testing / URL param)
// 2. Hardcoded config from firebase.config.js (if isConfigHardcoded true and valid)
// 3. localStorage fuji_firebase_config (legacy)
// 4. Placeholder (will fail check)
let finalConfig = placeholderConfig;
let configSource = 'placeholder';

try {
  // Source 1: window override
  if (window.__FIREBASE_CONFIG__ && checkConfigured(window.__FIREBASE_CONFIG__)) {
    finalConfig = window.__FIREBASE_CONFIG__;
    configSource = 'window';
  }
  // Source 2: Hardcoded file
  else if (isConfigHardcoded && checkConfigured(hardcodedConfig)) {
    finalConfig = hardcodedConfig;
    configSource = 'hardcoded';
  }
  // Source 3: localStorage
  else {
    const saved = localStorage.getItem('fuji_firebase_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (checkConfigured(parsed)) {
          finalConfig = parsed;
          configSource = 'localStorage';
        }
      } catch {}
    }
  }
} catch (e) {
  console.warn('Config loading error:', e);
}

export const isFirebaseConfigured = checkConfigured(finalConfig);
export const firebaseConfigStatus = {
  configured: isFirebaseConfigured,
  source: configSource,
  hasOverride: !!window.__FIREBASE_CONFIG__,
  isHardcoded: configSource === 'hardcoded',
  missing: (() => {
    const required = ['apiKey','authDomain','projectId','storageBucket','messagingSenderId','appId'];
    return required.filter(k => !finalConfig[k] || String(finalConfig[k]).startsWith('__') || !String(finalConfig[k]).trim());
  })()
};

if (typeof window !== 'undefined') {
  console.log('[Firebase] Configured:', isFirebaseConfigured, 'Source:', configSource, 'Missing:', firebaseConfigStatus.missing);
  if (!isFirebaseConfigured) {
    console.warn('[Firebase] Not configured - will show config screen. To fix: edit src/js/firebase.config.js with real config and push');
  } else {
    console.log(`[Firebase] Using config from ${configSource} - login will work directly without browser storage prompt`);
  }
}

let app = null, auth = null, db = null, storage = null, functions = null;

if (isFirebaseConfigured) {
  try {
    app = initializeApp(finalConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    storage = getStorage(app);
    functions = getFunctions(app, 'asia-southeast1');

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
    console.log('[Firebase] Initialized OK from', configSource);
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

export function getAuthErrorMessage(error) {
  const code = error?.code || '';
  const msg = error?.message || '';
  
  if (code.includes('network-request-failed') || msg.includes('network')) {
    return `🌐 เชื่อมต่อ Firebase ไม่ได้ (network-request-failed)\n\nวิธีแก้:\n1. ตรวจสอบ Internet\n2. ตรวจสอบ Firebase Config ถูกต้องไหม\n3. Firebase Console > Authentication > Settings > Authorized domains > เพิ่ม ${location.hostname}\n4. เปิด Email/Password provider\n5. ปิด AdBlock/VPN\n\nError: ${code} ${msg}`;
  }
  if (code.includes('invalid-api-key')) {
    return `🔑 API Key ไม่ถูกต้อง\n${code}`;
  }
  if (code.includes('user-not-found')) return '❌ ไม่พบผู้ใช้นี้';
  if (code.includes('wrong-password') || code.includes('invalid-credential')) return '❌ อีเมลหรือรหัสผ่านไม่ถูกต้อง';
  if (code.includes('too-many-requests')) return '⏳ ลองมากเกินไป กรุณารอสักครู่';
  if (code.includes('invalid-email')) return '❌ อีเมลไม่ถูกต้อง';
  if (code.includes('permission-denied') || code.includes('PERMISSION_DENIED')) {
    return `🔒 ไม่มีสิทธิ์ - ตรวจสอบ Firestore Rules\nต้อง deploy rules ใหม่\n\n${code} ${msg}`;
  }
  if (code.includes('auth-domain-config-required') || code.includes('unauthorized-domain')) {
    return `🔒 Domain ไม่ได้รับอนุญาต\nเพิ่ม ${location.hostname} ใน Firebase Console > Auth > Authorized domains\n\n${code}`;
  }
  return `❌ ${code ? code + ': ' : ''}${msg || 'Login failed'}`;
}
