// Firebase Cloud Messaging stand-in for the jsdom smoke test.
// FCM needs a real service worker + push service, so the stub reports “supported”
// and hands back a deterministic token — the app code around it (permission,
// token storage, prefs) is what the smoke test really exercises.
let permissionHandler = null;

export function __setToken(token) { __token = token; }
let __token = 'smoke-fcm-token';

export function getMessaging() { return { __messaging: true }; }
export async function isSupported() { return true; }
export async function getToken() { return __token; }
export async function deleteToken() { return true; }
export function onMessage(_messaging, handler) {
  permissionHandler = handler;
  return () => { permissionHandler = null; };
}
export function __emitMessage(payload) { permissionHandler?.(payload); }
