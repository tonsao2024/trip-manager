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

No application build step. `.github/workflows/deploy-pages.yml` injects the public VAPID key, then stages only browser assets (not server tooling).
`index.html` + `src/` are served directly. For background Push, deploy the
[GitHub Actions sender](PUSH-ACTIONS.md) with its dedicated secret and enable flag.

> **Source must be “GitHub Actions”.** With *Deploy from a branch* GitHub runs its own Jekyll build
> on `main` and serves that, so the artifact this workflow produces — including the injected
> `fcm-vapid.js` — never reaches the browser. The symptom is a live site that still shows
> **“Web Push ยังไม่พร้อม — ผู้ดูแลเว็บไซต์ต้องตั้งค่า FCM_VAPID_KEY…”** even though the secret is set
> and every workflow run is green. The workflow now checks `build_type` up front and fails with the
> exact setting to change instead of deploying silently (see [Actions Push troubleshooting](PUSH-ACTIONS.md#troubleshooting)).

## Firebase — Spark (free plan only)

โปรเจกต์นี้ใช้ **Spark เสมอ** ไม่ต้องผูก billing หรืออัปเกรดเป็น Blaze
`artifactregistry.googleapis.com` ถูกเรียกโดยการ deploy Cloud Functions ไม่ใช่ Firestore rules
จึงแก้ด้วยการไม่ deploy Functions ไม่ใช่เปิด API หรือเพิ่มสิทธิ์ billing

```bash
npm install -g firebase-tools@13
firebase login
firebase deploy --project trip-manager-93b22 --only firestore:rules,firestore:indexes
```

`firebase.json` มีเฉพาะ Firestore และ static Hosting ไม่มี Functions หรือ Storage
เพื่อไม่ให้คำสั่ง deploy ปกติพยายามเปิดบริการที่ต้องใช้ Blaze
ใช้ GitHub Pages สำหรับเว็บตามขั้นตอนข้างบน หรือ Firebase static Hosting:

```bash
firebase deploy --project trip-manager-93b22 --only hosting
```

เปิด Firestore Database และ Authentication (Google / Email+Password) ใน Firebase Console
และเพิ่มโดเมนเว็บใน Authentication → Settings → Authorized domains
ไม่ต้องเปิด Artifact Registry, Cloud Build, Cloud Functions, Secret Manager หรือ Cloud Storage
Firestore/Hosting/Auth ยังมีโควตาและข้อจำกัดของแผนฟรี ไม่ใช่ใช้งานไม่จำกัด

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

### Notifications on Spark

- กระดิ่ง 🔔 และรายการแจ้งเตือนในแอปใช้ Firestore; ต้อง publish กฎล่าสุดและเข้าสู่ระบบ
  ด้วย Google/Email ที่เป็นสมาชิกทริป ไม่ต้องมี Cloud Functions
- สรุปค่าใช้จ่ายรายวันสร้างโดยอุปกรณ์แรกที่เปิดทริปหลังเวลาสรุป ไม่ใช่ scheduled job
  หากไม่มีใครเปิดแอป ก็ไม่มีงานทำงานเบื้องหลัง
- **Push ตอนปิดเว็บใช้ FCM + GitHub Actions** แอปเพิ่มคิว `pushDelivery.state=pending`
  ใน Firestore แล้ว workflow ส่งปกติทุก 30 นาที (GitHub อาจเริ่มช้าหรือข้ามรอบ)
  ทำตาม [PUSH-ACTIONS.md](PUSH-ACTIONS.md) ไม่ต้องใช้ Cloudflare หรือ Blaze
  ต้องมี VAPID key, Secret สำหรับ sender, enable flag และการอนุญาตของอุปกรณ์
  หากยังไม่เปิด workflow จะมีเฉพาะกระดิ่งในแอป; VAPID key อย่างเดียวไม่ได้สร้างตัวส่ง
- โค้ดเก่าใน `functions/` เก็บไว้เป็นอ้างอิงเท่านั้น ไม่อยู่ใน config หรือ workflow deploy
- Cloud Storage ไม่อยู่ในเส้นทาง deploy ฟรี ใช้ fallback รูปแบบ inline ของฟีเจอร์ที่รองรับ
  แทนการรับประกันว่าการอัปโหลดไฟล์ทุกชนิดจะใช้ได้

### Deploy rules & indexes from GitHub Actions

Workflow: **Deploy Firestore rules & indexes (Spark)** (`.github/workflows/deploy-firebase.yml`)

ตั้งค่าครั้งเดียวใน Settings → Secrets and variables → Actions (เลือกอย่างใดอย่างหนึ่ง):

- `FIREBASE_SERVICE_ACCOUNT`: JSON ของ service account ที่มี Firebase Rules Admin,
  Cloud Datastore Index Admin และ Service Usage Viewer; หรือ
- `FIREBASE_TOKEN`: ค่าจาก `firebase login:ci` (เป็นวิธีเก่า แนะนำ service account)

ห้ามใส่ credentials เหล่านี้ใน client code หรือ commit ลง repository
ตัวแปร `FIREBASE_PROJECT_ID` ใช้เปลี่ยน project ได้; ค่าเริ่มต้นคือ `trip-manager-93b22`

เมื่อ push เข้า `main` ที่แก้ rules/indexes/config/workflow จะ deploy **เฉพาะ rules และ indexes**
ไม่ติดตั้ง dependencies ใน `functions/` และไม่ deploy Functions หรือ Storage
สำหรับโค้ดชุดนี้ ให้ใช้ **Run workflow หลังการเปลี่ยนแปลงเข้า main แล้ว** หรือ push เข้า main
การกด Re-run ของ run เก่าอาจยังใช้ workflow เก่าที่ deploy Functions
หากไม่มี credential จะข้าม deploy พร้อมคำเตือน; summary แสดงผล deploy จริง ไม่อ้างว่าสำเร็จเมื่อ step ล้มเหลว
ในโหมด service account จะพยายามอ่านกฎที่ publish แล้วกลับมาตรวจบล็อก notifications ด้วย

เว็บยังเผยแพร่แยกด้วย **Deploy GitHub Pages** การสำเร็จของ Pages ไม่ได้แปลว่า rules ถูก publish แล้ว

### Verify

```bash
node --test tests/deploy-spark.test.mjs
node tests/node-runner.mjs
```

บนเว็บจริง: เข้าสู่ระบบ Google/Email → เปิดทริป → ทดสอบกระดิ่งใน Settings → การแจ้งเตือน
ถ้าขึ้น `permission-denied` ให้ตรวจ membership และกฎ Firestore ไม่ใช่อัปเกรดเป็น Blaze

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

## Checklist (Spark)
- [ ] Firebase plan remains Spark; no billing account required
- [ ] Firestore rules and indexes deployed to the correct project
- [ ] Google / Email+Password enabled and the site domain authorized
- [ ] Super admin created if needed
- [ ] GitHub Pages enabled, Source = GitHub Actions
- [ ] In-app notification tested with a Firebase-authenticated trip member
- [ ] FIREBASE_PUSH_SERVICE_ACCOUNT and PUSH_ACTIONS_ENABLED configured; Actions quota reviewed
- [ ] Queue rules/index deployed; Send FCM Push (Spark) manually tested with two devices
- [ ] Users understand there is Push is delayed/best-effort and daily summaries still need an open client
