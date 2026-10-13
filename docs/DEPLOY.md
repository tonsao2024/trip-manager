# Deploy Guide

## GitHub Pages

1. Push repo to GitHub.
2. Settings > Pages > Branch: main, Folder: / (root)
3. Wait for Pages to deploy. URL: https://<user>.github.io/<repo>/
4. First visit shows Firebase config screen if no config in localStorage.
5. Open browser console: `localStorage.setItem('fuji_firebase_config', JSON.stringify({apiKey:"...",authDomain:"...",projectId:"...",storageBucket:"...",messagingSenderId:"...",appId:"..."}))` then reload.

No build step. `index.html` + `src/` served directly.

## Firebase

```bash
npm install -g firebase-tools
firebase login
firebase use --add  # select project
firebase deploy --only firestore:rules
firebase deploy --only firestore:indexes
firebase deploy --only storage
cd functions
npm install
firebase deploy --only functions
```

### Enable APIs
- Firestore, Auth, Storage, Functions, Secret Manager (for step-up secrets if used)

### Publishing rules matters for the app (v18.2)
`firebase deploy --only firestore:rules` is **not** optional bookkeeping: when the
published rules are older than the app, Firestore answers every write with
“Missing or insufficient permissions”. The app detects that (Settings → System
check, and inline banners such as the ideas board) and keeps the data on the
device until the rules are published, but the write only reaches the cloud once
the rules below are live:

- `trips/{tripId}/ideas/{id}` — the ideas board (any signed-in user may add/edit;
  delete stays with the author or a trip admin)
- `trips/{tripId}/memberGroups/{id}` — trip sub-groups (“กลุ่ม A”, “กลับก่อน”)

### Notifications + Web Push (v30)

Three deploys, in this order:

```bash
firebase deploy --only firestore:rules   # 1) the permission switches + the notification feed
firebase deploy --only functions         # 2) pushTripNotification + dailyExpenseSummary
firebase deploy --only hosting           # 3) the client (bell, settings tab, SW, manifest)
```

1. **Rules** — the member document's `permissions{}` map (`canEditItinerary`, `canEditExpense`,
   `canManageMembers`) and the `viewer` role are enforced by `firestore.rules`; the new
   `trips/{tripId}/notifications` collection and `users/{uid}/pushTokens|pushPrefs` are covered.
   Old member documents (no `permissions` map) keep their historical rights, so publishing the
   rules first cannot lock anybody out. See [`PERMISSIONS.md`](PERMISSIONS.md).
2. **Functions** — `pushTripNotification` (onDocumentCreated: pushes every new notification to the
   recipients' devices, drops dead tokens) and `dailyExpenseSummary` (hourly tick: writes the
   trip-local daily summary once per day and prunes the feed to the newest 120 items).
   `cd functions && npm install` before the first deploy. Both run in `asia-southeast1` with the
   project's `runtime: nodejs20`.
3. **Hosting / Pages** — `firebase-messaging-sw.js` and `manifest.webmanifest` must be served from
   the **app root**. Firebase Hosting serves real files before the `**` → `/index.html` rewrite, so
   the deploy needs no extra config; on GitHub Pages the two files sit in the repo root next to
   `index.html`, so the sub-path (`/trip-manager/`) works too. The worker is registered with
   `scope: './'` and receives the Firebase config as query parameters (`push.js`).

**VAPID key (required for Web Push).** Firebase Console → Project settings → Cloud Messaging →
Web Push certificates → *Generate key pair* → paste the public key either into
Settings → การแจ้งเตือน → VAPID key (stored per device in `fuji_fcm_vapid`) or into
`src/js/firebase.config.js` (`fcmVapidKey`). The compiled bundle ships with an empty key, so
without this step the in-app 🔔 keeps working but no push is ever sent.

**Verify after deploying**

```bash
node tests/node-runner.mjs                 # 167 unit tests (notification logic + permission model)
npm i --no-save jsdom dayjs xlsx
node tests/smoke/run.mjs                   # whole app in jsdom, incl. the v30 notification block
```

Then, on the live site: Settings → การแจ้งเตือน → “ส่งการแจ้งเตือนทดสอบ” (the in-app layer) and
“เปิด Push บนอุปกรณ์นี้” (asks for permission, registers the device — the card shows the token).
On iPhone/iPad the app must be added to the Home Screen first (iOS 16.4+) and the page served over
`https://`, otherwise Web Push is impossible (the card says so).

### Create Super Admin
1. Firebase Console > Auth > Add user email/pass
2. Firestore > users/{uid} doc:
```json
{
  "role": "super_admin",
  "displayName": "Super Admin",
  "email": "admin@example.com"
}
```

### Test Rules
```bash
firebase emulators:start --only firestore,auth,storage
# In another terminal
firebase emulators:exec --only firestore "npm run test:rules"
```

## Cloud Functions Env
If using secrets, set via:
```bash
firebase functions:secrets:set STEPUP_SECRET
```
But current implementation uses bcrypt without extra secret.

## Checklist
- [ ] Rules deployed
- [ ] Indexes deployed
- [ ] Functions deployed in asia-southeast1
- [ ] Super admin created
- [ ] GitHub Pages enabled
- [ ] Firebase config set in localStorage on Pages site
- [ ] v30: rules + functions + hosting deployed, VAPID key pasted, test push received on one device
- [ ] v30: member switches (แก้ไขแผน/ค่าใช้จ่าย/จัดการสมาชิก) reviewed in สมาชิก → แก้ไข
