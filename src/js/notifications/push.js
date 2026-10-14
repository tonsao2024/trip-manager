// Web Push (Firebase Cloud Messaging) for the Trip Manager PWA-less app.
//
// Why FCM: the app has no server of its own — the Cloud Functions in
// `functions/src/index.js` are the only place that can sign a Web Push message,
// and FCM hands the browser a standard Web Push endpoint + VAPID key.
//
// The user-facing flow:
//   1. Settings → การแจ้งเตือน → เปิดการแจ้งเตือนแบบ Push
//   2. browser asks for permission, we register `firebase-messaging-sw.js`
//   3. the device token is stored in `users/{uid}/pushTokens/{token}`
//   4. `notifications` documents trigger the `pushTripNotification` function,
//      which sends the message to every recipient's devices.
//
// Everything degrades gracefully: without a VAPID key, without permission or
// without the functions, the in-app bell keeps working.
import { app, resolvedFirebaseConfig } from '../firebase.js';
import { writeNotifyPrefs, registerPushToken, removePushToken, saveServerPrefs } from './index.js';
const MESSAGING_URL = 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js';
const SW_FILE = 'firebase-messaging-sw.js';
const TOKEN_KEY = 'fuji_push_token';

export const NOTIFICATION_ICON = './public/favicon-192.png';

/* -------------------------------------------------------------- support */

/** Is Web Push possible in this browser / context? */
export function pushSupport(lang = 'th') {
  const th = (a, b) => (lang === 'th' ? a : b);
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { supported: false, reason: 'no-window', message: th('ต้องเปิดผ่านเบราว์เซอร์', 'Open the app in a browser') };
  }
  if (!('serviceWorker' in navigator)) {
    return { supported: false, reason: 'no-sw', message: th('เบราว์เซอร์นี้ไม่รองรับ Service Worker', 'This browser has no Service Worker support') };
  }
  if (!('Notification' in window)) {
    return { supported: false, reason: 'no-notification', message: th('เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน', 'This browser has no Notification support') };
  }
  if (!('PushManager' in window)) {
    return { supported: false, reason: 'no-push', message: th('เบราว์เซอร์นี้ไม่รองรับ Web Push', 'This browser has no Web Push support') };
  }
  if (!isSecureContext()) {
    return { supported: false, reason: 'insecure', message: th('Web Push ต้องเปิดผ่าน https:// เท่านั้น', 'Web Push needs an https:// page') };
  }
  return { supported: true, reason: '', message: '' };
}

function isSecureContext() {
  try {
    if (window.isSecureContext) return true;
    const host = location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.localhost');
  } catch { return false; }
}

export function notificationPermission() {
  try { return typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'; } catch { return 'unsupported'; }
}

/* ----------------------------------------------------------- vapid key */

/**
 * The public Web-Push key comes from the deployment artifact (`fcm-vapid.js`),
 * or from Firebase config for non-GitHub-Pages deployments. It is not entered
 * or saved per device in the UI.
 */
export function getVapidKey() {
  try {
    const fromWindow = window.__FCM_VAPID_KEY__;
    if (typeof fromWindow === 'string' && fromWindow.trim()) return fromWindow.trim();
  } catch { /* ignore */ }
  const cfg = resolvedFirebaseConfig || {};
  return (typeof cfg.fcmVapidKey === 'string' && cfg.fcmVapidKey.trim()) ? cfg.fcmVapidKey.trim() : '';
}

export function hasVapidKey() {
  return Boolean(getVapidKey());
}

/* ------------------------------------------------------------ token state */

export function currentPushToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; }
}

function rememberToken(token) {
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ }
}

export function pushEnabled() {
  return Boolean(currentPushToken()) && notificationPermission() === 'granted';
}

/* --------------------------------------------------------------- worker */

function messagingConfig() {
  const cfg = resolvedFirebaseConfig || {};
  return {
    apiKey: cfg.apiKey || '',
    authDomain: cfg.authDomain || '',
    projectId: cfg.projectId || '',
    storageBucket: cfg.storageBucket || '',
    messagingSenderId: cfg.messagingSenderId || '',
    appId: cfg.appId || ''
  };
}

/** Register (or reuse) the messaging worker at the app root scope. */
export async function registerMessagingWorker() {
  if (!('serviceWorker' in navigator)) return null;
  const url = new URL(`./${SW_FILE}`, location.href);
  const cfg = messagingConfig();
  for (const [k, v] of Object.entries(cfg)) if (v) url.searchParams.set(k, v);
  url.searchParams.set('v', '30');
  const reg = await navigator.serviceWorker.register(url.toString(), { scope: './' });
  await navigator.serviceWorker.ready.catch(() => null);
  return reg;
}

async function messagingInstance() {
  const mod = await import(MESSAGING_URL);
  if (typeof mod.isSupported === 'function' && !(await mod.isSupported())) {
    throw new Error('messaging/unsupported');
  }
  return mod.getMessaging(app);
}

/* ---------------------------------------------------------------- enable */

/**
 * Ask for permission, register the worker and remember this device's token.
 * @returns {Promise<{token:string}>}
 */
export async function enablePush({ uid, tripIds = [], lang = 'th' } = {}) {
  const th = (a, b) => (lang === 'th' ? a : b);
  const support = pushSupport();
  if (!support.supported) throw new Error(support.message);
  if (!uid) throw new Error(th('กรุณาเข้าสู่ระบบก่อน', 'Sign in first'));
  if (!getVapidKey()) {
    // The site owner supplies this public key during deployment; a visitor
    // cannot read GitHub Actions secrets directly from the browser.
    // `code` lets callers route the user to the deployment status in Settings.
    const err = new Error(th(
      'ยังไม่มี VAPID key บนเว็บไซต์ จึงเปิด Push ไม่ได้ — ให้ผู้ดูแลตั้ง GitHub Actions secret ชื่อ FCM_VAPID_KEY แล้ว deploy เว็บไซต์ใหม่',
      'This site has no VAPID key, so Push cannot start. Ask the site owner to set the FCM_VAPID_KEY GitHub Actions secret and redeploy.'
    ));
    err.code = 'vapid/missing';
    throw err;
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(th(
      'ยังไม่ได้อนุญาตการแจ้งเตือน — เปิดสิทธิ์ในตั้งค่าเบราว์เซอร์ (ไอคอน 🔒 ข้างที่อยู่เว็บ) แล้วลองใหม่',
      'Notification permission was not granted — allow it in the browser (🔒 icon in the address bar) and retry'
    ));
  }

  const registration = await registerMessagingWorker();
  const messaging = await messagingInstance();
  const { getToken } = await import(MESSAGING_URL);
  const token = await getToken(messaging, {
    vapidKey: getVapidKey(),
    serviceWorkerRegistration: registration || undefined
  });
  if (!token) throw new Error(th('ขอ token สำหรับ Push ไม่สำเร็จ', 'Could not get a push token'));

  rememberToken(token);
  // A false success is the worst outcome here: the device would look registered
  // while `users/{uid}/pushTokens` stayed empty and the Cloud Function had
  // nothing to send to (the “push ไม่ทำงาน” report). Fail loudly instead.
  const stored = await registerPushToken(uid, token, { platform: 'web', userAgent: navigator.userAgent, tripIds });
  if (!stored) {
    const err = new Error(th(
      'ได้รับสิทธิ์แจ้งเตือนแล้ว แต่บันทึกอุปกรณ์นี้ไม่สำเร็จ — Firestore ปฏิเสธการเขียน users/{uid}/pushTokens (มักเกิดจากกฎที่เผยแพร่ยังเก่ากว่าแอป) ให้ publish firestore.rules ก่อนแล้วลองใหม่',
      'Permission granted, but this device could not be saved — Firestore refused the write to users/{uid}/pushTokens (usually because the published rules are older than the app). Publish firestore.rules and retry.'
    ));
    err.code = 'push/store-failed';
    rememberToken('');
    throw err;
  }
  const prefs = writeNotifyPrefs({ push: true });
  const serverPrefs = await saveServerPrefs(uid, prefs);
  if (!serverPrefs) console.warn('[Push] account preferences were not mirrored — the trip settings still decide what is pushed');
  return { token };
}

/** Turn push off on this device (and forget the token server-side). */
export async function disablePush({ uid, lang = 'th' } = {}) {
  const token = currentPushToken();
  rememberToken('');
  const prefs = writeNotifyPrefs({ push: false });
  if (uid) {
    await saveServerPrefs(uid, prefs);
    if (token) await removePushToken(uid, token);
  }
  return true;
}

/* ------------------------------------------------------------ foreground */

/**
 * Foreground messages: FCM does not display them itself while the tab is
 * focused, so the app shows an in-app toast (and a system notification when the
 * tab is in the background).
 */
export async function listenForeground(handler) {
  if (!app) return () => {};
  try {
    const messaging = await messagingInstance();
    const { onMessage } = await import(MESSAGING_URL);
    const unsub = onMessage(messaging, (payload) => {
      try { handler?.(payload); } catch (e) { console.warn('[Push] handler failed', e?.message); }
    });
    return typeof unsub === 'function' ? unsub : () => {};
  } catch (e) {
    console.warn('[Push] foreground listener unavailable', e?.message);
    return () => {};
  }
}

/** Show a system notification from the page (used when the tab is hidden). */
export async function showDeviceNotification({ title, body = '', url = '', tag = 'trip-manager' } = {}) {
  if (notificationPermission() !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker?.getRegistration?.();
    if (reg?.showNotification) {
      await reg.showNotification(title || 'Trip Manager', {
        body,
        tag,
        icon: NOTIFICATION_ICON,
        badge: NOTIFICATION_ICON,
        data: { url }
      });
      return true;
    }
    // Fallback for browsers without an active worker registration.
    new Notification(title || 'Trip Manager', { body, icon: NOTIFICATION_ICON, tag });
    return true;
  } catch (e) {
    console.warn('[Push] showNotification failed', e?.message);
    return false;
  }
}
