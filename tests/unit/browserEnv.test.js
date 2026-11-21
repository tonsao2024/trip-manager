// Unit tests — the browser checks behind Google sign-in.
// A chat-app webview (or a browser that blocks/partitions storage) can never
// finish Firebase's redirect flow: the pending sign-in lives in sessionStorage
// and the auth handler answers “missing initial state”. These helpers decide,
// before anything is opened, whether this browser may start the flow at all.
import {
  IN_APP_BROWSERS, REDIRECT_REASON,
  detectInAppBrowser, storageProbe, webStorageStatus, redirectSignInSafety,
  externalBrowserUrl, sameSiteAuthDomain
} from '../../src/js/utils/browserEnv.js';

function assert(cond, msg) { if (!cond) throw new Error(msg); }

const UA = {
  safariIOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
  chromeIOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36',
  desktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  messengerIOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/430.0.0.31.114;FBBV/444560899;FB_IAB/MESSENGER;]',
  facebookAndroid: 'Mozilla/5.0 (Linux; Android 13; SM-S901B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/119.0.0.0 Mobile Safari/537.36 [FBAN/EMA;FBLC/th_TH;FBAV/431.0.0.0;]',
  instagramIOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 302.0.0.0.80 (iPhone14,2; iOS 17_0; th_TH; th)',
  lineIOS: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Line/13.16.0',
  tiktokAndroid: 'Mozilla/5.0 (Linux; Android 13; SM-A536B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/118.0.0.0 Mobile Safari/537.36 TikTok 30.1.0',
  iosWebView: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  androidWebView: 'Mozilla/5.0 (Linux; Android 12; Pixel 5; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/112.0.0.0 Mobile Safari/537.36'
};

export function testDetectRealBrowsers() {
  const safari = detectInAppBrowser(UA.safariIOS);
  assert(!safari.inApp && safari.platform === 'ios', 'iOS Safari is a real browser');

  const crios = detectInAppBrowser(UA.chromeIOS);
  assert(!crios.inApp && crios.platform === 'ios', 'Chrome on iOS is a real browser (it keeps the Safari/ token)');

  const android = detectInAppBrowser(UA.chromeAndroid);
  assert(!android.inApp && android.platform === 'android', 'Chrome on Android is a real browser');

  const desktop = detectInAppBrowser(UA.desktop);
  assert(!desktop.inApp && desktop.platform === 'other', 'Desktop Chrome is a real browser');
  console.log('✓ detects real browsers (Safari, Chrome, desktop)');
}

export function testDetectChatAppWebViews() {
  const cases = [
    ['messenger', UA.messengerIOS, 'ios'],
    ['facebook', UA.facebookAndroid, 'android'],
    ['instagram', UA.instagramIOS, 'ios'],
    ['line', UA.lineIOS, 'ios'],
    ['tiktok', UA.tiktokAndroid, 'android']
  ];
  for (const [app, ua, platform] of cases) {
    const env = detectInAppBrowser(ua);
    assert(env.inApp, `${app} is detected as an embedded webview`);
    assert(env.app === app, `expected app=${app}, got ${env.app}`);
    assert(env.platform === platform, `expected platform=${platform}, got ${env.platform}`);
    assert(typeof env.label === 'string' && env.label.length > 0, `${app} has a display label`);
  }
  assert(IN_APP_BROWSERS.length >= 8, 'the chat-app list covers the apps people actually use');
  console.log('✓ detects Messenger / Facebook / Instagram / LINE / TikTok webviews');
}

export function testDetectPlainWebViews() {
  const ios = detectInAppBrowser(UA.iosWebView);
  assert(ios.inApp && ios.app === 'ios-webview', 'an iOS WKWebView without Safari/ is embedded');
  const android = detectInAppBrowser(UA.androidWebView);
  assert(android.inApp && android.app === 'android-webview', 'an Android webview (“; wv)”) is embedded');
  const referrer = detectInAppBrowser(UA.desktop, { referrer: 'android-app://com.google.android.gm/' });
  assert(referrer.inApp && referrer.app === 'android-app', 'an android-app:// referrer means an in-app webview');
  console.log('✓ detects plain iOS/Android webviews and android-app:// handoffs');
}

export function testStorageProbe() {
  const working = { _d: {}, setItem(k, v) { this._d[k] = String(v); }, getItem(k) { return this._d[k] ?? null; }, removeItem(k) { delete this._d[k]; } };
  assert(storageProbe(working) === true, 'a writable store passes the probe');
  assert(Object.keys(working._d).length === 0, 'the probe key is removed again');

  const blocked = { setItem() { throw new Error('SecurityError'); }, getItem() { return null; }, removeItem() {} };
  assert(storageProbe(blocked) === false, 'a store that throws is unusable (private mode / blocked cookies)');

  const nullish = { setItem() {}, getItem() { return null; }, removeItem() {} };
  assert(storageProbe(nullish) === false, 'a store that silently drops values is unusable');
  assert(storageProbe(null) === false, 'a missing store is unusable');

  const win = {
    sessionStorage: working,
    localStorage: blocked
  };
  const status = webStorageStatus(win);
  assert(status.session === true && status.local === false, 'session and local storage are probed separately');
  assert(webStorageStatus({}).session === false, 'a window without storage reports false');
  console.log('✓ probes sessionStorage / localStorage writability');
}

export function testRedirectSignInSafety() {
  const chrome = detectInAppBrowser(UA.chromeAndroid);
  const okStorage = { session: true, local: true };
  const safe = redirectSignInSafety(chrome, okStorage);
  assert(safe.safe === true && safe.reason === null, 'a real browser with working storage may use the redirect flow');

  const messenger = detectInAppBrowser(UA.messengerIOS);
  const inApp = redirectSignInSafety(messenger, okStorage);
  assert(inApp.safe === false && inApp.reason === REDIRECT_REASON.inAppBrowser, 'a chat-app webview must never start a redirect');

  const blocked = redirectSignInSafety(chrome, { session: false, local: true });
  assert(blocked.safe === false && blocked.reason === REDIRECT_REASON.storage, 'blocked sessionStorage must never start a redirect');

  // localStorage may be blocked while sessionStorage works — that is fine.
  assert(redirectSignInSafety(chrome, { session: true, local: false }).safe === true, 'only sessionStorage matters for the redirect state');
  console.log('✓ redirect flow is blocked in webviews and when storage is unusable');
}

export function testExternalBrowserUrl() {
  const url = 'https://trip-manager-93b22.firebaseapp.com/index.html#/login';
  const intent = externalBrowserUrl(url, 'android');
  assert(intent.startsWith('intent://trip-manager-93b22.firebaseapp.com/index.html%23/login#Intent;'), `hash is encoded into the intent path (got ${intent})`);
  assert(intent.includes('scheme=https'), 'scheme is carried over');
  assert(intent.includes('package=com.android.chrome'), 'targets Chrome');
  assert(intent.includes(`S.browser_fallback_url=${encodeURIComponent(url)}`), 'falls back to the normal URL when Chrome is missing');
  assert(intent.endsWith('end'), 'intent URL is terminated');

  assert(externalBrowserUrl(url, 'ios') === null, 'iOS has no intent URL — the UI shows Safari steps instead');
  assert(externalBrowserUrl(url, 'other') === null, 'desktop has no intent URL');
  assert(externalBrowserUrl('javascript:alert(1)', 'android') === null, 'only http(s) links become intents');
  assert(externalBrowserUrl('not a url', 'android') === null, 'invalid URLs are ignored');
  console.log('✓ builds the Android intent link for Chrome');
}

export function testSameSiteAuthDomain() {
  const config = { projectId: 'trip-manager-93b22', authDomain: 'trip-manager-93b22.firebaseapp.com' };
  assert(sameSiteAuthDomain(config, 'trip-manager-93b22.web.app') === 'trip-manager-93b22.web.app', 'web.app uses itself as the auth domain');
  assert(sameSiteAuthDomain(config, 'trip-manager-93b22.firebaseapp.com') === 'trip-manager-93b22.firebaseapp.com', 'the default Firebase Hosting domain is same-site');
  assert(sameSiteAuthDomain(config, 'tonsao2024.github.io') === null, 'GitHub Pages is not the project domain');
  assert(sameSiteAuthDomain(config, 'trip.example.com') === null, 'custom domains are left alone');
  assert(sameSiteAuthDomain({ projectId: 'other-project' }, 'trip-manager-93b22.web.app') === null, 'a different project id does not match');
  assert(sameSiteAuthDomain(null, 'x.web.app') === null, 'missing config is safe');
  assert(sameSiteAuthDomain({ projectId: 'Trip-Manager-93b22' }, 'TRIP-MANAGER-93B22.web.app') === 'trip-manager-93b22.web.app', 'matching is case-insensitive');
  console.log('✓ aligns authDomain only for the project\u2019s own Hosting domains');
}
