/* Trip Manager — Web Push service worker (Firebase Cloud Messaging).
 *
 * This file MUST stay in the app root: a service worker may only control pages
 * inside its own folder, and the whole app (index.html + src/) lives here.
 *
 * The Firebase config arrives as query parameters from
 * `src/js/notifications/push.js` (the config itself lives in
 * src/js/firebase.config.js and is public by design), so nothing has to be
 * duplicated by hand.
 *
 * Messages are sent by the GitHub Actions job in tools/push-actions/ after
 * the app queues a Firestore notification. Data-only FCM messages avoid duplicate system alerts.
 */
/* eslint-env serviceworker */

const params = new URL(location).searchParams;
const config = {
  apiKey: params.get('apiKey') || '',
  authDomain: params.get('authDomain') || '',
  projectId: params.get('projectId') || '',
  storageBucket: params.get('storageBucket') || '',
  messagingSenderId: params.get('messagingSenderId') || '',
  appId: params.get('appId') || ''
};

const ICON = './public/favicon-192.png';
const BADGE = './public/favicon-32.png';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

let messagingReady = false;
try {
  if (config.apiKey && config.projectId && config.appId) {
    importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
    importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');
    firebase.initializeApp(config);
    const messaging = firebase.messaging();

    messaging.onBackgroundMessage((payload) => {
      const note = payload.notification || {};
      const data = payload.data || {};
      const title = note.title || data.title || 'Trip Manager';
      const body = note.body || data.body || '';
      return self.registration.showNotification(title, {
        body,
        icon: data.icon || ICON,
        badge: BADGE,
        tag: data.tag || data.notificationId || 'trip-manager',
        data: { url: data.url || data.link || './' }
      });
    });
    messagingReady = true;
  }
} catch (e) {
  // gstatic unreachable (offline / blocked). The raw `push` handler below still
  // draws a notification when the message carries its own title and body.
  messagingReady = false;
}

/* Fallback: messages that do not go through the FCM SDK. */
self.addEventListener('push', (event) => {
  if (messagingReady) return; // the FCM SDK is already showing them
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = { body: event.data?.text?.() || '' }; }
  const title = payload.title || payload.notification?.title || 'Trip Manager';
  const body = payload.body || payload.notification?.body || '';
  if (!title && !body) return;
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: ICON,
    badge: BADGE,
    data: { url: payload.url || payload.data?.url || './' }
  }));
});

/* Tapping the notification opens (or focuses) the app on the right page. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url || './';
  const url = new URL(target, self.registration.scope).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of all) {
      if (client.url.startsWith(self.registration.scope)) {
        await client.focus();
        if ('navigate' in client && client.url !== url) client.navigate(url).catch(() => {});
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
