# Push: FCM + GitHub Actions — Firebase Spark

ตัวส่งอยู่ใน `tools/push-actions/` และ workflow **Send FCM Push (Spark)**
ไม่ใช้ Cloudflare, Firebase Cloud Functions, Blaze หรือ Artifact Registry
เว็บไม่มี GitHub token, service-account private key หรือตัวส่ง HTTP endpoint

> **ส่งเป็นรอบ ไม่ใช่ทันที:** ค่าเริ่มต้นทุก **30 นาที** ที่นาที 7 และ 37 ของทุกชั่วโมง
> GitHub อาจเริ่มช้า/ข้ามรอบ โดยเฉพาะช่วงโหลดสูง จึงไม่รับประกันว่าจะถึงภายใน 30 นาที
> กระดิ่งในแอปยังอัปเดตผ่าน Firestore ตามเดิมโดยไม่ต้องรอรอบส่ง Push

## ใช้ฟรีอย่างไร

- Firebase อยู่ **Spark** ต่อไป; FCM ไม่มีค่าบริการส่งข้อความ แต่ Firestore มีโควตาฟรี
- ใช้ standard GitHub-hosted `ubuntu-latest` runner ไม่ใช้ larger/paid runner
- public repositories ใช้ standard Actions runners ได้โดยไม่คิดนาทีแบบ private repositories
  ส่วน private repositories มีนาทีรวมตามแผนบัญชีและต้องแชร์กับ workflow อื่น
- ทุก 30 นาทีคิดเป็นประมาณ **1,440–1,488 job runs/เดือน** และอาจใช้นาทีมากกว่านั้น
  (แต่ละ job มีการปัดเวลาตาม billing และอาจรันนานเกิน 1 นาที)
  จึง **ไม่รับประกันว่า private repo จะอยู่ในโควตาฟรี** อย่าอัปเกรดแผน/เปิดการใช้จ่ายเพิ่ม
- ตรวจ GitHub Settings → Billing/Usage ของบัญชีเจ้าของ repo และตั้งงบ/การใช้งานแบบจ่ายเงินเป็นศูนย์
  หรือไม่อนุญาต overage ตามตัวเลือกที่บัญชีมี หากใกล้หมดให้ปิดตัวส่งหรือลดรอบเป็นรายชั่วโมง
- มี opt-in `PUSH_ACTIONS_ENABLED=true` ก่อนเริ่มรัน และ timeout 5 นาทีต่อ job
  เป็นเพียง safety cap ไม่ใช่การรับประกันโควตาของ GitHub/Firestore

## 1. เปิด Firebase ที่จำเป็น (ยังคง Spark)

1. Authentication → เปิด Google/Email+Password; เพิ่มโดเมนเว็บใน Authorized domains
2. Google Cloud Console → APIs & Services → เปิด **Firebase Cloud Messaging API (HTTP v1)**
   (`fcm.googleapis.com`) ถ้ายังไม่เปิด ไม่ต้องเปิด Cloud Functions/Artifact Registry
3. Firebase Console → Project settings → Cloud Messaging → Web Push certificates → Generate key pair
   เก็บ **public VAPID key** ใน GitHub Actions secret `FCM_VAPID_KEY` สำหรับ deploy เว็บ
4. Deploy กฎและ index ล่าสุด:

```bash
firebase deploy --project trip-manager-93b22 --only firestore:rules,firestore:indexes
```

หรือใช้ workflow **Deploy Firestore rules & indexes (Spark)** ตาม [DEPLOY.md](DEPLOY.md)
รอ composite index ของ collection group `notifications` สร้างเสร็จก่อนเริ่มตัวส่ง
index คือ `pushDelivery.state ASC, createdAt ASC` แบบ **COLLECTION_GROUP**

## 2. Service account เฉพาะตัวส่ง

ใน Google Cloud Console → IAM & Admin → Service Accounts ของโปรเจกต์เดิม:

- สร้างบัญชี เช่น `trip-push-actions` ไม่ใช้ Owner/Editor
- ให้ roles:
  - **Cloud Datastore User** (`roles/datastore.user`): อ่านคิว/membership/prefs/tokens,
    transaction เพื่อ claim และเขียนผล, ลบ token ที่หมดอายุ
  - **Firebase Cloud Messaging API Admin** (`roles/firebasecloudmessaging.admin`): ส่ง FCM
- สร้าง JSON key และเก็บใน **repository Actions secret** ชื่อ `FIREBASE_PUSH_SERVICE_ACCOUNT`
  ค่าเป็น JSON ทั้งไฟล์ ไม่ใช่แค่ private_key
- Secret นี้แยกจาก `FIREBASE_SERVICE_ACCOUNT` ที่ใช้ deploy กฎ ซึ่งไม่จำเป็นต้องมีสิทธิ์ส่ง/แก้ข้อมูล

Service account ฝั่ง Admin SDK ข้าม Firestore Security Rules และ role นี้เขียนข้อมูลทั้งฐานได้
จึงต้องจำกัดผู้แก้ไข workflow/repository และเก็บ key เฉพาะใน Secrets ของ repo ที่เชื่อถือได้
ไม่ให้ secret กับโค้ด pull request จากคนภายนอก; workflow ทดสอบไม่ได้ใช้ secret นี้
ห้ามวาง JSON/key ในแชท, Git, เว็บ หรือ Pages artifact ถ้ารั่วให้ revoke key ทันที

## 3. ตั้งค่า Actions และ deploy เว็บ

Repository → Settings → Secrets and variables → Actions:

| ชนิด | ชื่อ | ค่า |
| --- | --- | --- |
| Secret | `FIREBASE_PUSH_SERVICE_ACCOUNT` | JSON key ของบัญชีตัวส่ง |
| Secret | `FCM_VAPID_KEY` | public Web Push key สำหรับ Pages |
| Repository variable | `PUSH_ACTIONS_ENABLED` | `true` (ตัวพิมพ์เล็ก) เพื่อเปิด job |
| Repository variable (optional) | `FIREBASE_PROJECT_ID` | ค่าเริ่มต้น `trip-manager-93b22` ต้องตรงกับ JSON key |
| Repository variable (optional) | `PUSH_APP_URL` | ค่าเริ่มต้น `https://tonsao2024.github.io/trip-manager/` |

`PUSH_APP_URL` ต้องเป็น URL HTTPS ที่เชื่อถือได้ **พร้อม base path ของเว็บ** ใช้เปิดเมื่อแตะ Push
ไม่ต้องใส่ secret key หรือ token ใน URL

นำโค้ดเข้า default branch (`main`) แล้ว:

1. Run workflow **Deploy GitHub Pages** เพื่อเผยแพร่ client ที่สร้างคิว
2. เข้า **Actions → Send FCM Push (Spark) → Run workflow** เพื่อทดสอบทันที
3. ดู summary จะมีจำนวน scanned/completed/skipped/expired/sent/failed/errors
4. หลังจากนั้น schedule จะรันบน default branch; กด Re-run เก่าไม่ได้ทำให้โค้ดเก่ากลายเป็นรุ่นใหม่

ถ้า enable variable ยังไม่ใช่ `true` job จะถูกข้าม (รวมการกด Run workflow ด้วย)
`FCM_VAPID_KEY` ที่ใช้กับ Pages environment อยู่แล้วใช้ต่อได้ แต่ Secret ตัวส่งควรเป็น **repository secret**
เพราะ sender job ไม่ได้อยู่ใน environment `github-pages`

## เปลี่ยนจาก Cloudflare ชุดก่อน

โค้ด Cloudflare/Worker URL ถูกนำออกจากเส้นทางใช้งานแล้ว ไม่ต้องตั้ง `PUSH_WORKER_URL`,
`GOOGLE_CLIENT_EMAIL` หรือ `GOOGLE_PRIVATE_KEY` ในเว็บ/Cloudflare สำหรับเวอร์ชันนี้
หากเคย deploy Cloudflare Worker จริง ให้ปิด/ลบ Worker และ Secrets ที่เลิกใช้ใน dashboard ด้วยตัวคุณเอง
หากไม่ใช้ service-account key เดิมที่นั่นแล้วให้ revoke key; ใช้บัญชี/Secret ตัวส่งใหม่ตามข้อ 2
การแก้ repository ไม่ได้ปิดบริการ Cloudflare ที่คุณสร้างไว้ให้อัตโนมัติ

## 4. ทดสอบจริงสองอุปกรณ์

1. ผู้รับ B ล็อกอินด้วย Google/Email และได้รับอนุมัติเป็นสมาชิกทริป
2. Settings → การแจ้งเตือน → เปิด Push บนอุปกรณ์นี้ → อนุญาตเบราว์เซอร์
3. กดส่งการแจ้งเตือนทดสอบ จะเพิ่ม `pushDelivery: {state: 'pending'}` ใน notification
   **จะไม่สร้าง popup จำลองในเครื่อง** เพราะอาจทำให้เข้าใจว่าตัวส่งทำงานทั้งที่ยังไม่ได้ส่ง
4. กด Run workflow **Send FCM Push (Spark)** แล้วตรวจ Push บนอุปกรณ์ B
   ข้อความประเภท test ส่งเฉพาะบัญชีผู้ทดสอบ ไม่ broadcast ทุกคน
5. ทดสอบจริง: B ปิดแท็บเว็บ; A บันทึกค่าใช้จ่ายใหม่ แล้วรอรอบ Actions หรือรัน workflow เอง
6. แตะ Push ต้องเปิดเว็บที่ path ของโปรเจกต์และรายการที่เกี่ยวข้อง

บน iPhone/iPad ต้อง Add to Home Screen แล้วเปิดจากไอคอนนั้น พร้อมระบบ/เบราว์เซอร์ที่รองรับ
OS permissions, โหมดประหยัดแบตเตอรี่, Force Quit และ Do Not Disturb อาจหยุดหรือซ่อน Push ได้
แม้ FCM ตอบรับแล้วก็ไม่ใช่หลักฐานว่า OS แสดงข้อความบนเครื่องเรียบร้อย

## คิวและการป้องกันส่งซ้ำ

- Client เขียน notification พร้อม `pushDelivery.state=pending` และ `createdAt=serverTimestamp()`
  Rules อนุญาตให้ client สร้างได้เฉพาะ state นี้ ไม่มี runId/counts/receipt ปลอม
  หลังสร้าง client แก้ได้แค่ readBy ของตัวเอง ไม่สามารถ reset/claim/ปลอมผลส่ง
- Query เฉพาะ pending ที่สร้างใน **24 ชั่วโมงล่าสุด** เรียงเก่าไปใหม่ สูงสุด **20 รายการ/run**
  และ expire รายการเก่าอีกไม่เกิน 20 รายการ/run ไม่สแกนประวัติทั้งหมดทุกครั้ง
- ตรวจสมาชิกปัจจุบัน, inactive, author และ intersect recipients ก่อนส่ง
  เคารพ `push`, `enabled`, category flags, token enabled และ tripIds
- จำกัด **30 บัญชีผู้รับ/รายการ**, **5 token documents/บัญชี** และ **200 member documents/ทริป**
  ถ้าเกินจะ skipped ทั้งรายการก่อนเริ่มส่ง ไม่ส่งบางคนแบบเงียบ ๆ
  จำนวน token รวมเอกสารเก่าด้วย ให้ผู้ใช้ปิด Push บนอุปกรณ์เก่าหรือลบเอกสารที่เลิกใช้
- Workflow concurrency ไม่ยกเลิกงานที่กำลังส่ง; Firestore transaction เปลี่ยน pending → claimed
  ก่อนส่งจริง ทำให้ re-run/concurrent jobs ไม่ส่งคิวเดียวกันซ้ำ
- ผลสุดท้ายเป็น `complete`, `partial`, `skipped` หรือ `expired`; ถ้า runner หยุดระหว่างส่งจะค้าง `claimed`
- **ไม่ reset/retry หลังเริ่มส่ง** เพราะ network timeout อาจเกิดหลัง FCM รับไปแล้ว
  เป็น at-most-once send attempts ไม่ใช่ exactly-once delivery และอาจส่งไม่ครบ/ไม่ถึงได้
  FCM/SDK เองยังอาจส่งซ้ำได้ จึงไม่ได้รับประกันว่าผู้ใช้จะไม่เห็นข้อความซ้ำทุกกรณี
- preflight read/network error ก่อน claim จะยัง pending และลองได้ในรอบถัดไป
  อ่านกระดิ่งหรือเปิดหน้าเว็บใหม่ไม่ reset การส่ง สถานะอยู่ใน Firestore ไม่ใช่ runner disk/cache
- ลบ token อัตโนมัติเฉพาะ FCM ตอบ `registration-token-not-registered` ไม่ลบเมื่อ IAM/network error
- รายการก่อนเปลี่ยนเวอร์ชันที่ไม่มี pending marker จะ **ไม่ส่งย้อนหลัง**
- อ่าน/transaction/ลบ token ใช้ Firestore quota ร่วมกับแอป ควรตรวจ usage แม้มี batch cap

### สิ่งที่ยังไม่ใช่งานตั้งเวลา

สรุปรายวันยังสร้างโดย client แรกที่เปิดทริปหลังเวลาสรุป จากนั้น Actions ส่งคิวนั้น
ไม่มีการสร้างสรุปอัตโนมัติเมื่อทุกคนปิดแอปอยู่ ตัวส่งนี้ทำหน้าที่ส่งรายการที่มีแล้วเท่านั้น

## Troubleshooting

| อาการ | ตรวจ / วิธีแก้ |
| --- | --- |
| Job skipped | ตั้ง repository variable `PUSH_ACTIONS_ENABLED=true` และตรวจว่า workflow เปิดใช้งาน |
| Schedule ไม่รัน | workflow ต้องอยู่ default branch; Actions ต้องเปิด; public repo ที่ไม่มีกิจกรรมเป็นเวลานานอาจถูกปิด schedule อัตโนมัติ ให้เปิดใหม่ใน Actions |
| Push ช้า | รอรอบ 30 นาที + queue delay ของ GitHub หรือกด Run workflow; ไม่ใช่ sender แบบ realtime |
| configuration-or-service-error | ตรวจ JSON secret, project ID และ URL โดยไม่พิมพ์ key ลง logs |
| Permission denied / FCM failed | ตรวจ Datastore User, Firebase Cloud Messaging API Admin และเปิด FCM HTTP v1 API |
| Query/index error | Publish `firestore.indexes.json` แล้วรอ collection-group index พร้อม |
| scanned=0 | ยังไม่มีคิวใหม่, คิวส่งแล้ว/claimed/หมดอายุ หรือ client ยังเป็นรุ่นที่ไม่มี pending marker |
| sent=0 failed=0 | ไม่มีผู้รับที่เข้าเงื่อนไข/prefs.push=true/token ปัจจุบัน |
| partial / claimed | อาจส่งแล้วบางเครื่อง ห้าม reset pending แบบอัตโนมัติ ให้ตรวจและสร้าง test ใหม่ |
| skipped | ดู `pushDelivery.reason` ใน Firestore: author-not-a-member/invalid-notification/recipient-limit/device-limit/member-limit |
| workflow แดง | ส่งบางเครื่องไม่สำเร็จหรือ preflight/receipt error ดู aggregate summary; กฎ/concurrency ป้องกัน replay หลังเริ่มส่ง |
| มีแต่กระดิ่ง | ตรวจ pending marker, enable flag/secret, Actions quota และสิทธิ์ browser/OS |

## ปรับรอบ / ปิดใช้งาน

แก้ cron ใน `.github/workflows/send-push.yml` เช่น `'7 * * * *'` สำหรับรายชั่วโมง
ค่าเริ่มต้น `'7,37 * * * *'` คือทุกครึ่งชั่วโมง หลีกเลี่ยงนาที 0 ที่มักมีโหลดสูง
ถ้าเปลี่ยนรอบต้องแก้คำอธิบายใน UI/คู่มือให้ตรงด้วย
ตั้ง `PUSH_ACTIONS_ENABLED=false` หรือ disable workflow เพื่อหยุด sender โดยไม่กระทบกระดิ่ง
รายการเกิน 24 ชั่วโมงจะหมดอายุเมื่อเปิด sender อีกครั้ง ไม่ replay ประวัติทั้งหมด

## ตรวจโค้ดในเครื่อง (ไม่ใช้บัญชีจริง)

```bash
npm ci --prefix tools/push-actions
npm test --prefix tools/push-actions
node --test tests/deploy-spark.test.mjs
# App regression tests require local dayjs/xlsx/jsdom:
node tests/node-runner.mjs
node tests/smoke/run.mjs
```

Tests ใช้ Firestore/FCM จำลองสำหรับ sender ไม่ได้ยืนยัน IAM หรือการส่งด้วย credentials จริง
ต้องทดสอบบนสองอุปกรณ์หลังตั้งค่าและรัน workflow จริงอีกครั้ง
