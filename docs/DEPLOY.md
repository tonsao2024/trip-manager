# Deploy Guide

## GitHub Pages

1. Push repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: *GitHub Actions***
   (not “Deploy from a branch” — see the warning below).
3. Add the repository secret `FCM_VAPID_KEY` — Settings → Secrets and variables → Actions →
   New repository secret (value from Firebase Console → Project settings → Cloud Messaging →
   Web Push certificates → *Key pair*). Optional for the rest of the app, required for Web Push.
4. Push to `main` (or run **Actions → Deploy GitHub Pages → Run workflow**).
   URL: `https://<user>.github.io/<repo>/`
5. First visit shows the Firebase config screen if no config is in localStorage.
6. Open the browser console: `localStorage.setItem('fuji_firebase_config', JSON.stringify({apiKey:"...",authDomain:"...",projectId:"...",storageBucket:"...",messagingSenderId:"...",appId:"..."}))` then reload.

No build step. `.github/workflows/deploy-pages.yml` only injects the VAPID key into
`fcm-vapid.js` and uploads the repo as-is; `index.html` + `src/` are served directly.

> **Source must be “GitHub Actions”.** With *Deploy from a branch* GitHub runs its own Jekyll build
> on `main` and serves that, so the artifact this workflow produces — including the injected
> `fcm-vapid.js` — never reaches the browser. The symptom is a live site that still shows
> **“Web Push ยังไม่พร้อม — ผู้ดูแลเว็บไซต์ต้องตั้งค่า FCM_VAPID_KEY…”** even though the secret is set
> and every workflow run is green. The workflow now checks `build_type` up front and fails with the
> exact setting to change instead of deploying silently (see *Web Push troubleshooting* below).

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

**VAPID key (required for Web Push).** Generate it once in Firebase Console → Project settings →
Cloud Messaging → Web Push certificates → *Generate key pair*. For GitHub Pages, store the public
key as the repository Actions secret `FCM_VAPID_KEY` (Settings → Secrets and variables → Actions).
**Pages must be set to “Deploy from **GitHub Actions**” as the source.** `.github/workflows/deploy-pages.yml`
validates the secret and injects it into `fcm-vapid.js` in the Pages artifact as
`window.__FCM_VAPID_KEY__`; `push.js` reads it automatically. The committed `fcm-vapid.js` remains an
empty placeholder. There is no VAPID-key field in the app — users do not need to paste anything.
After adding or rotating the secret, run the workflow (or push to `main`) to redeploy. If the secret
is absent, the workflow warns, Web Push stays off, and the in-app 🔔 continues to work.

The workflow also accepts an Actions **variable** named `FCM_VAPID_KEY` (secret wins when both
exist), and it runs two guard rails: it fails when Pages is still on *Deploy from a branch* (the key
could not reach the site) and, after deploying, it re-reads the live
`fcm-vapid.js` with a cache-busting query string and fails when the key is not actually served. The
run summary says which of the guards fired and how to fix it.

**Web Push troubleshooting** — live site shows “Web Push ยังไม่พร้อม” (admin-side causes only):

| Symptom | Cause & fix |
| --- | --- |
| Workflow is red at *Check that Pages deploys from GitHub Actions* | Pages is still *Deploy from a branch*. Settings → Pages → Build and deployment → **Source: GitHub Actions**, then *Re-run all jobs*. |
| Workflow green but the site shows the old (empty) `fcm-vapid.js` | Same as above — a branch build is being served, so nothing this workflow uploads is live. |
| *Inject VAPID key* step warns “No `FCM_VAPID_KEY` secret/variable is set” | Add the secret (or variable) with exactly that name, then re-run the workflow. Users’ devices keep the in-app 🔔 meanwhile. |
| *Inject VAPID key* step fails with “does not look like a Web Push key” | The value is not the *Key pair* (87 chars, starts with `B`) — it is probably the server key or the VAPID **private** key. Paste the key-pair value with no quotes/spaces. |
| *Verify the live site serves the VAPID key* fails | The deploy landed but the browser-visible file has no key: check the secret value, then re-run; the Pages CDN needs a minute after a fresh deploy. |
| Everything green, one device still shows the strip | Per-device: the user must press “เปิด Push บนอุปกรณ์นี้”; on iPhone/iPad the app must be added to the Home Screen (iOS 16.4+) and the page opened over `https://`. |

The Firebase Web Push VAPID value is a **public key** (usually 87 characters, starts with `B`) and
has to be exposed to the browser so it can register for push. Storing it as a GitHub Secret keeps it
out of source control; the workflow deliberately places that public key in the deployed client file.
Never put a Firebase service-account private key or other server credential in client code. For a
non-GitHub-Pages deployment, supply the public key through `fcmVapidKey` in `src/js/firebase.config.js`
or add equivalent secret injection to that deployment's build workflow.

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
- [ ] Pages **Source = GitHub Actions** (not *Deploy from a branch* — the branch build never gets the injected key)
- [ ] Firebase config set in localStorage on Pages site
- [ ] v30: rules + functions deployed; Pages workflow injects `FCM_VAPID_KEY` and verifies it on the live site; test push received on one device
- [ ] v30: member switches (แก้ไขแผน/ค่าใช้จ่าย/จัดการสมาชิก) reviewed in สมาชิก → แก้ไข
