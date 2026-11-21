/**
 * Browser-environment checks for the Google sign-in flow.
 *
 * Why this file exists
 * --------------------
 * Firebase's `signInWithRedirect()` keeps the pending sign-in in
 * `sessionStorage`. When the page runs inside a chat app's embedded webview
 * (Messenger, LINE, Instagram, Facebook, TikTok, …) — Messenger is the one users
 * report most — that storage is blocked or partitioned, so it is empty when the
 * OAuth redirect comes back and the Firebase auth handler answers:
 *
 *   “Unable to process request due to missing initial state. This may happen if
 *    browser sessionStorage is inaccessible or accidentally cleared…”
 *
 * Google also refuses OAuth inside embedded webviews (`disallowed_useragent`),
 * so retrying inside the webview can never work. The app therefore never starts
 * a redirect in those browsers: it explains the situation and offers “open in a
 * real browser” instead (see `showAuthBrowserHelp` in app.js).
 *
 * Everything here is pure — the user agent, referrer and storage objects are
 * parameters — so the rules are unit tested in Node
 * (`tests/unit/browserEnv.test.js`).
 */

/** Embedded webviews of chat / social apps, most specific first. */
export const IN_APP_BROWSERS = [
  { app: 'messenger', label: 'Messenger', re: /Messenger|FBAN\/Messenger|Orca-Android|Orca-iOS/i },
  { app: 'instagram', label: 'Instagram', re: /Instagram|FBAN\/Instagram/i },
  { app: 'facebook', label: 'Facebook', re: /\bFBAN\b|\bFBAV\b|FB_IAB|FB4A|FBIOS/i },
  { app: 'line', label: 'LINE', re: /\bLine\/[\d.]+|LineApp|LIFF/i },
  { app: 'tiktok', label: 'TikTok', re: /TikTok|musical_ly|BytedanceWebview|trill_/i },
  { app: 'twitter', label: 'X', re: /\bTwitter\b|Twitter for|TwitterAndroid/i },
  { app: 'linkedin', label: 'LinkedIn', re: /LinkedInApp|LinkedIn\/[\d.]+/i },
  { app: 'snapchat', label: 'Snapchat', re: /Snapchat/i },
  { app: 'wechat', label: 'WeChat', re: /MicroMessenger/i },
  { app: 'kakaotalk', label: 'KakaoTalk', re: /KAKAOTALK/i },
  { app: 'pinterest', label: 'Pinterest', re: /Pinterest/i },
  { app: 'google-app', label: 'Google', re: /\bGSA\//i }
];

/** Reasons the redirect flow cannot complete (exported for the UI + tests). */
export const REDIRECT_REASON = {
  inAppBrowser: 'in-app-browser',
  storage: 'storage-unavailable',
  missingState: 'missing-initial-state'
};

const IOS_RE = /iPhone|iPad|iPod/i;

/**
 * Which browser is this? Returns the embedded app when there is one.
 * @param {string} ua navigator.userAgent
 * @param {{referrer?: string, standalone?: boolean}} [options]
 * @returns {{inApp: boolean, app: string|null, label: string|null, platform: 'ios'|'android'|'other', standalone: boolean}}
 */
export function detectInAppBrowser(ua = '', { referrer = '', standalone = false } = {}) {
  const s = String(ua || '');
  const platform = /Android/i.test(s) ? 'android' : IOS_RE.test(s) ? 'ios' : 'other';
  const base = { inApp: false, app: null, label: null, platform, standalone: !!standalone };

  for (const entry of IN_APP_BROWSERS) {
    if (entry.re.test(s)) return { ...base, inApp: true, app: entry.app, label: entry.label };
  }

  // A plain webview: Android marks it with "; wv)", iOS WKWebView has no
  // "Safari/" token (Safari, Chrome, Firefox and Edge on iOS all keep it).
  if (platform === 'android' && /;\s*wv\)/i.test(s)) {
    return { ...base, inApp: true, app: 'android-webview', label: 'Android WebView' };
  }
  if (platform === 'ios' && /AppleWebKit/i.test(s) && !/Safari\//i.test(s)) {
    return { ...base, inApp: true, app: 'ios-webview', label: 'iOS WebView' };
  }

  // Apps that hand links to a webview through an android-app:// intent.
  if (/^android-app:\/\//i.test(String(referrer || ''))) {
    return { ...base, inApp: true, app: 'android-app', label: 'Android app' };
  }

  return base;
}

/** Read the current browser (safe to call when globals are missing). */
export function currentBrowserEnv(nav, doc) {
  const n = nav || (typeof navigator !== 'undefined' ? navigator : null);
  const d = doc || (typeof document !== 'undefined' ? document : null);
  let standalone = n?.standalone === true;
  try {
    if (!standalone && typeof window !== 'undefined' && window.matchMedia) {
      standalone = !!window.matchMedia('(display-mode: standalone)')?.matches;
    }
  } catch { /* ignore */ }
  return detectInAppBrowser(n?.userAgent || '', { referrer: d?.referrer || '', standalone });
}

/**
 * Can this storage object actually keep a value? Private mode, “block all
 * cookies”, partitioned embeds and full quotas all throw on `setItem`.
 */
export function storageProbe(store) {
  if (!store) return false;
  const key = '__tm_storage_probe__';
  try {
    store.setItem(key, '1');
    const ok = store.getItem(key) === '1';
    store.removeItem(key);
    return ok;
  } catch {
    return false;
  }
}

/** `{ session, local }` — writability of both web storages. */
export function webStorageStatus(win) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  let session = false;
  let local = false;
  try { session = storageProbe(w?.sessionStorage); } catch { session = false; }
  try { local = storageProbe(w?.localStorage); } catch { local = false; }
  return { session, local };
}

/**
 * Is Firebase's redirect sign-in able to finish here?
 * `safe: false` means “do not start a redirect” — the user would land on the
 * auth handler's “missing initial state” page.
 */
export function redirectSignInSafety(env, storage) {
  const e = env || {};
  const s = storage || {};
  if (!s.session) return { safe: false, reason: REDIRECT_REASON.storage };
  if (e.inApp) return { safe: false, reason: REDIRECT_REASON.inAppBrowser };
  return { safe: true, reason: null };
}

/**
 * Android intent: URL that re-opens this page in Chrome (falling back to the
 * default browser when Chrome is missing). iOS has no equivalent, so it returns
 * `null` and the UI shows the ⋯ → “Open in Safari” steps instead.
 */
export function externalBrowserUrl(href, platform) {
  if (platform !== 'android') return null;
  let u;
  try { u = new URL(String(href)); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  // The app is a hash router, and '#' starts the Intent section in an intent://
  // URL, so the fragment travels as %23 inside the path.
  const fragment = u.hash ? `%23${u.hash.slice(1)}` : '';
  const target = `${u.host}${u.pathname}${u.search}${fragment}`;
  const scheme = u.protocol.slice(0, -1);
  return `intent://${target}#Intent;scheme=${scheme};package=com.android.chrome;` +
    `S.browser_fallback_url=${encodeURIComponent(String(href))};end`;
}

/**
 * When the app is served from its own Firebase Hosting domain
 * (`<projectId>.web.app` / `<projectId>.firebaseapp.com`), sign-in can run on the
 * same site as `/__/auth/handler`. That is the only setup that survives
 * storage-partitioned browsers, so `firebase.js` prefers it over the default
 * `firebaseapp.com` auth domain. Returns `null` when the current host is not one
 * of the project's own domains.
 */
export function sameSiteAuthDomain(config, hostname) {
  const host = String(hostname || '').toLowerCase();
  const project = String(config?.projectId || '').toLowerCase();
  if (!host || !project) return null;
  if (host !== `${project}.web.app` && host !== `${project}.firebaseapp.com`) return null;
  return host;
}
