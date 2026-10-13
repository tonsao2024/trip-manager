// Notification preferences of THIS device (localStorage) + the tiny store the
// Settings card and the bell use. Kept separate from utils/notifications.js so
// the pure logic stays importable without a browser.
import { NOTIFY_PREFS_KEY, NOTIFY_PREFS_DEFAULTS, normalizePrefs } from '../utils/notifications.js';

function safeStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

export const notifyPrefsStore = {
  read() {
    const store = safeStorage();
    if (!store) return { ...NOTIFY_PREFS_DEFAULTS };
    try {
      const raw = store.getItem(NOTIFY_PREFS_KEY);
      return normalizePrefs(raw ? JSON.parse(raw) : {});
    } catch {
      return { ...NOTIFY_PREFS_DEFAULTS };
    }
  },

  write(patch = {}) {
    const next = normalizePrefs({ ...notifyPrefsStore.read(), ...patch });
    const store = safeStorage();
    try { store?.setItem(NOTIFY_PREFS_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    return next;
  },

  clear() {
    const store = safeStorage();
    try { store?.removeItem(NOTIFY_PREFS_KEY); } catch { /* ignore */ }
    return { ...NOTIFY_PREFS_DEFAULTS };
  },

  /** Hide one notification on this device only (no write to Firestore). */
  hide(id) {
    if (!id) return notifyPrefsStore.read();
    return notifyPrefsStore.write({ hidden: [...new Set([...notifyPrefsStore.read().hidden, id])].slice(-200) });
  },

  unhideAll() {
    return notifyPrefsStore.write({ hidden: [] });
  }
};
