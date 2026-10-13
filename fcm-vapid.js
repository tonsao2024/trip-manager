// Web Push (FCM) VAPID public key — injected at deploy time.
//
// The committed copy intentionally carries NO key. When the site is deployed
// by .github/workflows/deploy-pages.yml, that workflow overwrites this file
// in the Pages artifact with the value of the GitHub Actions repository
// secret `FCM_VAPID_KEY` (Settings → Secrets and variables → Actions).
// The key never has to be committed to this repository.
//
// `src/js/notifications/push.js` reads window.__FCM_VAPID_KEY__ first, so a
// key injected here wins over src/js/firebase.config.js and localStorage.
window.__FCM_VAPID_KEY__ = '';
