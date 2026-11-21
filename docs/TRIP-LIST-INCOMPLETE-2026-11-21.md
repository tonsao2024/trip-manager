# ทริปโหลดไม่ครบ / สมาชิกใหม่ขึ้น “ตรวจสิทธิ์การเข้าร่วมทริปได้ไม่ครบ” (21 พ.ย. 2026)

รายงานจากเจ้าของโปรเจกต์ (ภาพหน้าจอ 21 พ.ย. 2026 19:37 ICT):

- **ภาพ 1 — หน้าแอดมิน “เลือกทริป”:** แบนเนอร์เหลือง “โหลดรายการทริปได้ไม่ครบ แต่ยังเปิดทริปที่แสดงอยู่ได้”
  (ทริปยังเปิดได้ปกติ — `trips.incomplete === true`)
- **ภาพ 2 — หน้าสมาชิกใหม่ที่ขอเข้ากลุ่ม:** บล็อกใหญ่ “ตรวจสิทธิ์การเข้าร่วมทริปได้ไม่ครบ”
  หัวข้อ “อ่านข้อมูลสมาชิกจากเซิร์ฟเวอร์ไม่ได้” พร้อมรายละเอียดทางเทคนิค
  `permission-denied: Missing or insufficient permissions.`

ทั้งสองภาพคือ **อาการเดียวกัน**: หนึ่งในแหล่งข้อมูลของ `fetchTripsFromServer()` ใน `src/js/trips/index.js`
ถูกปฏิเสธด้วย `permission-denied` (ไม่ใช่ index หายและไม่ใช่เน็ตล่ม — ถ้าเป็น index จะเป็น `failed-precondition`)
แอดมินได้ทริปจาก `createdBy`/`memberUids` เลยเหลือแค่แบนเนอร์ ส่วนสมาชิกใหม่ได้ 0 ทริป + มี failure ≥ 1 → เห็นหน้า error

## สถานะการ deploy (ตรวจจาก GitHub Actions 21 พ.ย. 2026)

- workflow **Deploy Firestore rules & indexes (Spark)** เคยล้มเหลวทุกครั้งระหว่าง 6–20 พ.ย. 2026
  (สาเหตุเดิม: `firestore.indexes.json` ไม่ผ่านการตรวจของ Firebase API — single-field index, `__name__`, `"scope"`
  แก้แล้วใน PR #74)
- รัน **ครั้งเดียวที่สำเร็จ** คือของ merge PR #74 (`a1d50bf…`) เมื่อ **2026-11-20T05:37Z** —
  rules และ indexes ที่ deploy ไปแล้ว **เหมือนกับไฟล์ใน repo ปัจจุบันทุกตัว** (blob ของ `firestore.rules` ตรงกัน)
- GitHub Pages deploy สำเร็จเสมอ; โค้ดเว็บที่ live ตรงกับ repo ปัจจุบัน
- **หมายเหตุ:** step “Verify the live rules contain the notification block” เดิมพังเงียบ ๆ
  (`Cannot find module 'google-auth-library'` แล้ว `::warning` เฉย ๆ จึงขึ้น success ทั้งที่ไม่ได้ตรวจจริง)
  — แก้ให้ติดตั้ง `google-auth-library` แบบ global แล้วใน PR นี้ Step นี้จะตรวจ Rules บนโปรเจกต์จริงได้แล้ว

## ทำไมสมาชิกใหม่ยังโดนอยู่ หลัง deploy กฎไปแล้ว (เรียงตามความเป็นไปได้)

1. **บัญชีไม่ตรงกับตอนขอเข้าร่วม** — Google กับ Email/Password ของอีเมลเดียวกันคือคนละ `uid`
   → รายการ empty และ `getJoinedTrip` ถูกปฏิเสธ (เคสถูกที่สุดจากภาพ: ล็อกอินด้วยบัญชีเดิมที่ใช้กด “ขอเข้าร่วม”)
2. **เอกสารสมาชิกของบัญชีนี้ยังมีฟิลด์ PIN แบบเก่า** (`pinHash`/`pinSalt`/`pinIterations`/`pinAlgo`)
   → กฎ `match /{path=**}/members/{memberId}` ต้องการให้เอกสารไม่มีฟิลด์พวกนี้ จึงปฏิเสธ **query ทั้งชุด**
   (แอดมินเห็นแบนเนอร์ในภาพ 1 จากสาเหตุเดียวกัน) — แก้ด้วยการรัน migration ก่อน publish rules (ดู `docs/DEPLOY.md` หัวข้อ “Migrate legacy PIN fields before publishing Rules”)
3. **เอกสารสมาชิกเป็น PIN/legacy แล้วเชื่อมบัญชี Google ทีหลัง** — id ของเอกสารคือ `mb…` ส่วน rules อ่าน `members/{authUid}`
   → ต้องมี `memberUids` ที่มี Google uid (ปุ่ม “กวาดสถานะค้าง” ในหน้า สมาชิก เพิ่มให้ได้)
4. **บัญชีถูก “ระงับการใช้งาน”** (`status: inactive` / ค่าเก่า `disabled`) → เปิดทริปไม่ได้ตามกฎ
5. **กฎที่ publish ไปจริง ๆ ไม่ใช่ของ repo** — ตรวจได้สองทาง: Firebase Console → Firestore → Rules (ต้องมีบล็อก
   `/notifications/{notificationId}` และ `match /{path=**}/members/{memberId}`) หรือรัน workflow ใหม่ด้วยมือ
   (Actions → Deploy Firestore rules & indexes (Spark) → Run workflow) — รันซ้ำปลอดภัย เป็น idempotent

## ลำดับแก้ที่แนะนำ (เจ้าของโปรเจกต์)

1. Firebase Console → Firestore → Rules / Indexes: ยืนยันว่าตรงกับ repo (หรือกด Run workflow ข้อ 5 ข้างบน)
2. `GOOGLE_CLOUD_PROJECT=trip-manager-93b22 npm --prefix functions run migrate:legacy-pins`
   (เฉพาะถ้ามีสมาชิกแบบ PIN รุ่นเก่า — ต้องมี Admin credentials; อ่านหัวข้อที่อ้างในข้อ 2 ข้างบนก่อน)
3. ทริปที่เกี่ยวข้อง → สมาชิก → กด **“กวาดสถานะค้าง”**
4. สมาชิกที่มีปัญหา: ล็อกอินด้วยบัญชีเดิม → หน้า **ทริปของฉัน** → กด **“ตรวจคำขอและรายการทริป”** แล้วย้ำอีกครั้งด้วย
   **“ตรวจสิทธิ์อีกครั้ง”** บนหน้า error
5. ยังไม่ได้: ลบสมาชิกออกแล้วอนุมัติคำขอใหม่ด้วยบัญชีที่ถูกต้อง (สะอาดที่สุด) — อย่าแก้จาก cache

## สิ่งที่เปลี่ยนใน repo (PR นี้)

- `error.details` ของ `trip-list-incomplete` มี `source` กำกับแหล่งที่ล้มเหลว
  (`trips.memberUids` / `trips.createdBy` / `members discovery (uid|authUid)` / `trip read after discovery (<id>)` / `join targets`)
  และหน้า error พิมพ์มันใน “รายละเอียดทางเทคนิค” — รอบหน้าไม่ต้องเดาว่า permission-denied มาจาก query ไหน
- ถ้า source ที่ล้มเหลวไม่ใช่ query ของรายการทริปเอง (เฉพาะ discovery/join targets) คำแนะนำจะเน้นเรื่องเอกสารสมาชิก
  และบัญชี (กวาดสถานะค้าง / migration / ล็อกอินด้วยบัญชีเดิม) แทนการบอกให้ deploy กฎอย่างเดียว
- `.github/workflows/deploy-firebase.yml`: ติดตั้ง `google-auth-library` แบบ global เพื่อให้ step ตรวจ live rules ตรวจจริง
- `tests/membership-repair.test.mjs`: ตรวจว่า `details` ระบุ source ได้

## ยังไม่ได้ตรวจจากแซนด์บ็อกซ์นี้

- สถานะ rules/indexes บนโปรเจกต์ production แบบ live (Firestore ไม่เปิดให้อ่านกฎแบบ anonymous) — ตรวจตามข้อ 1 ข้างบน
- สถานะ `pinHash` ในเอกสารสมาชิกจริง และการลิงก์ `authUid` ของบัญชีที่แจ้งปัญหา
- `FIREBASE_PROJECT_ID` (ถ้ามี) ชี้ไปโปรเจกต์อื่นหรือไม่ — workflow ใช้ `vars.FIREBASE_PROJECT_ID || 'trip-manager-93b22'`
