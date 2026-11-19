# กวาดสถานะสมาชิกค้าง / เชื่อมต่อสมาชิกใหม่ (19 Nov 2026)

ตามรายงานของเจ้าของโปรเจกต์: *“แอดมินเห็นว่าเป็นสมาชิก แต่พอบัญชีสมาชิกเข้าดูกลับไม่พบทริปนี้
และบางคนขึ้นสถานะรออนุมัติ แต่แอดมินกลับมองไม่เห็นรีเควส … อาจจะสร้างปุ่มสำหรับกวาดสถานะค้าง
หรือรีการเชื่อมต่อสมาชิกในหน้าเว็บฝั่งแอดมินดีไหม”*

**คำตอบสั้น: ดีมาก และจำเป็นต้องทำ — แต่ต้องทำ 2 ปุ่มคู่กัน** (ฝั่งแอดมิน + ฝั่งสมาชิก)
เพราะกฎความเป็นส่วนตัวของ Firestore ห้ามแอดมินอ่าน `users/{uid}/joinRequests` ของคนอื่น
(ดู `firestore.rules` → `match /users/{uid}/joinRequests/{tripId}: allow read, write: if request.auth.uid == uid`).
กวาดฝั่งแอดมินอย่างเดียวจึงแก้คำขอที่ค้างใน mirror ไม่ได้.

---

## 1) ทำไมถึงเกิดอาการนี้ (3 ชั้นทับกัน)

| อาการ | ข้อมูลที่ไม่ตรงกัน | สาเหตุ |
|---|---|---|
| แอดมินเห็นสมาชิกครบ แต่สมาชิกไม่เห็นทริป | `trips/{tripId}/members/{id}` (หน้าแอดมินอ่าน) vs `trips/{tripId}.memberUids` (รายการทริป/กฎ list อ่าน) | array เพี้ยน (ทริปเก่า, ทำสำเนา, เขียน array ล้มเหลวแล้วถูก `console.warn` กลืน, บัญชี `mb…` ที่ภายหลังลิงก์กับ Google) — รายละเอียดเดิมใน [MEMBER-TRIP-VISIBILITY.md](MEMBER-TRIP-VISIBILITY.md) |
| สมาชิกเห็น “รอแอดมินอนุมัติ” แต่แอดมินไม่มีคำขอในคิว | `trips/{id}/joinRequests/{uid}` (คิวแอดมิน) vs `users/{uid}/joinRequests/{tripId}` (mirror ของสมาชิก) | `requestToJoin()` เขียน 2 ที่ ถ้า primary ถูกปฏิเสธ (Rules เก่า/ออฟไลน์) แต่ mirror เขียนสำเร็จ โค้ดเดิม `throw permission-denied` พร้อมเก็บคำขอไว้ใน mirror → สมาชิกเห็นสถานะ pending คนเดียว แอดมินอ่านคิวว่าง |
| เป็นสมาชิกแล้วแต่ยังขึ้น “รออนุมัติ” | mirror ค้างหลังอนุมัติ | `approveJoinRequest()` ลบ primary สำเร็จ แต่ `deleteDoc(users/{uid}/joinRequests/{tripId})` ของคนอื่นอาจถูกปฏิเสธ → ถูก catch เงียบ ๆ (ตั้งใจให้ไม่บล็อกการอนุมัติ) และ `renderMyJoinRequests()` เดิมเชื่อ `tripsCache` เพื่อซ่อน badge — พอ `memberUids` เพี้ยน ทริปไม่โผล่ → badge ก็ไม่หายด้วย |
| เอกสารสมาชิกทุกคนเป็น `pending` | `members/{id}.status` | `pending` เป็น **สถานะของคำขอ** ไม่ใช่สถานะสมาชิก ข้อมูลเก่า/migrate ที่หลุดเข้ามาทำให้หน้าสมาชิกดูเหมือน “ยังรออนุมัติ” ทั้งที่เป็นสมาชิกจริง |
| แอดมินมองไม่เห็นรีเควสทั้งที่กดรีเฟรช | กฎ/ดัชนีที่ deploy อยู่ | โค้ดเว็บใหม่ต้องการ `joinRequests` allow `list` + collection-group `members.uid/authUid` ถ้าเซิร์ฟเวอร์ยังเป็น Rules/Indexes เก่า การอ่านจะ `permission-denied`/`failed-precondition` แบบเงียบ ๆ (UI เดิมโชว์แค่ข้อความแดง) |

> **สรุป:** ไม่ใช่ “ฐานข้อมูลเสีย” แต่เป็น **ข้อมูล 3 ที่ที่ไม่ได้เขียนเป็น transaction เดียวกัน** +
> **กฎ/ดัชนียังไม่ได้ deploy** + **ไม่มีทางให้ผู้ใช้กดซ่อมซ้ำ** (auto-reconcile เดิมรันครั้งเดียวตอนเปิดหน้า และถ้าถูก deny จะจบในข้อความ status เล็ก ๆ).

---

## 2) สิ่งที่เพิ่ม

### ปุ่ม **“กวาดสถานะค้าง”** — หน้า `สมาชิก` (เฉพาะเจ้าของทริป / แอดมิน / ผู้จัดการสมาชิก)
`#repair-membership-btn` → `repairTripMembership(tripId)` ใน `src/js/members/repair.js`.
อ่าน **จากเซิร์ฟเวอร์เท่านั้น** (`getDocFromServer` / `getDocsFromServer`) แล้วทำ 5 อย่างตามแผนใน
`src/js/utils/membershipRepair.js` (pure, มี unit test):

1. เติม uid ของสมาชิกที่ยังใช้งานอยู่เข้า `memberUids` (ใช้ `reconcileTripMemberUids` เดิม
   ที่ re-check เอกสารใน transaction กันการชุบชีวิตคนที่เพิ่งถูกลบ)
2. ลบ uid ที่มีเอกสารระบุ `inactive`/`disabled` ออกจาก array — **ไม่ลบ uid ที่ไม่มีเอกสาร**
   (บัญชี PIN/legacy ยังต้องใช้ fallback เดิม)
3. เปลี่ยน `members/{id}.status: 'pending' | 'waiting' | 'review'` → `'active'`
   (เก็บค่าก่อนหน้าไว้ใน `statusRepairedFrom`)
4. ปิดคำขอของคนที่ **เป็นสมาชิกอยู่แล้ว** เป็น `status: 'approved'` (tombstone: เก็บประวัติ,
   ไม่โชว์ปุ่มอนุมัติซ้ำ และบอกฝั่งสมาชิกให้ลบ mirror เก่า)
5. ทำให้คำขอที่สถานะไม่ชัด/ว่างกลับเป็น `pending` เพื่อให้ปุ่ม อนุมัติ/ปฏิเสธ กลับมา

รายงานหลังกดเป็น badge สรุป + คำเตือนแยกตาม step (ไม่เคยอ้างว่าซ่อมสำเร็จถ้าเขียนไม่ได้),
จากนั้น reload ทั้งคิวคำขอและรายชื่อสมาชิกแบบ fresh.

**ไม่ทำ:** ไม่ลบสมาชิก, ไม่เปลี่ยน role/permissions, ไม่อนุมัติคำขอของคนที่ยังไม่เป็นสมาชิก,
ไม่แตะทริปอื่น, ไม่เขียนจาก cache. กดซ้ำครั้งที่สองไม่เปลี่ยนอะไร (idempotent).

### ปุ่ม **“ซิงก์คำขอค้าง”** — หน้า `ทริปของฉัน`
`#sync-join-requests-btn` → `syncMyJoinRequests(uid, { joinedTripIds })` ใน `src/js/members/join.js`.
ทำงานอัตโนมัติตอนเปิดหน้า (หลังโหลดรายการทริป) และกดซ้ำได้:

- คำขอที่อยู่ **แค่ใน mirror** → เขียนกลับเข้าคิว `trips/{id}/joinRequests/{uid}` ให้แอดมินเห็น
  (ไม่ต้องให้สมาชิกกรอกรหัสเชิญใหม่อีกครั้ง)
- คำขอที่แอดมินปฏิเสธ → copy สถานะ `rejected` ลง mirror (เลิกโชว์ “รออนุมัติ” ผิด ๆ)
- คำขอ `approved` หรือทริปที่มองเห็นแล้ว → ลบ mirror และปิด primary ที่ยัง pending ให้เป็น approved
- ถ้าอ่าน/เขียนคิวถูกปฏิเสธ → **ไม่เดาสุ่ม/write ทับ** แต่ขึ้นข้อความ
  “ให้แอดมิน Publish Firestore Rules/Indexes แล้วกดซิงก์อีกครั้ง”

### UI อื่น ๆ ที่ปรับ
- คิวแอดมินแสดงเฉพาะคำขอที่ยังต้องดำเนินการ (`isActionableJoinRequest`) + บอกจำนวนคำขอที่ปิดแล้ว
  แทนที่จะโชว์ปุ่ม “อนุมัติ” ให้คำขอ `approved`/`rejected`
- ตอนส่งคำขอแล้ว primary ล้มเหลว: toast อธิบายว่าคำขอถูกเก็บในบัญชีตัวเอง + ชี้ไปปุ่มซิงก์
  (ยังเปิด Rules help sheet เหมือนเดิม)
- ถ้า auto-reconcile เดิมล้มเหลว ข้อความจะชี้ไปปุ่มกวาดแทน “เปิดหน้าใหม่”
- ถ้าอ่านคิวคำขอไม่ได้: ข้อความอธิบายความสัมพันธ์กับ mirror แทน error ดิบ
- `index.html`: เพิ่ม cache-buster `&membership-repair=1` ให้ `app.js` (hard refresh ครั้งแรกหลัง deploy)

---

## 3) วิธีใช้จริง (ตามลำดับ)

1. **Deploy ให้ครบ 2 ส่วน** (โค้ดเว็บอย่างเดียวไม่พอ):
   ```bash
   # GitHub Pages: publish ไฟล์จาก branch นี้ (index.html + src/js/**)
   firebase deploy --only firestore:rules,firestore:indexes
   ```
   ถ้า Rules/Indexes ยังเก่า ปุ่มจะรายงาน `permission-denied`/`failed-precondition`
   พร้อมคำแนะนำแทนที่จะเงียบ — นี่คือสาเหตุที่ “แอดมินมองไม่เห็นรีเควส” บน production ส่วนใหญ่
2. **แอดมิน**: เปิดทริป → **สมาชิก** → กด **“กวาดสถานะค้าง”** → อ่านรายงาน
   (เช่น `เติม uid 3 · เปลี่ยนสถานะ pending → ใช้งานอยู่ 2 · ปิดคำขอของคนที่เป็นสมาชิกแล้ว 1`)
3. **สมาชิกทุกคน**: เข้าเว็บ/รีเฟรช → หน้า **ทริปของฉัน** → ระบบซิงก์อัตโนมัติ
   (หรือกด **“ซิงก์คำขอค้าง”**) → ทริปที่หายกลับมา, badge “รออนุมัติ” ที่ค้างหายไป,
   คำขอที่เคยส่งไม่สำเร็จไปโผล่ในคิวแอดมิน
4. ถ้ายังมีคนไม่เห็นทริป: ตรวจว่าล็อกอินด้วย **บัญชีเดิม** (Google/อีเมลคนเดียวกับตอนขอเข้าร่วม)
   และไม่ใช่สมาชิก `inactive`; ดู [MEMBER-TRIP-VISIBILITY.md](MEMBER-TRIP-VISIBILITY.md) ข้อ “ตรวจว่าหายจริง”

---

## 4) ข้อจำกัดที่ตั้งใจไว้ (อ่านก่อนทำต่อ)

- **แอดมินกวาด mirror ของคนอื่นไม่ได้** ตามกฎ `users/{uid}/joinRequests` (owner-only).
  ทางเลือกคือ (a) ให้สมาชิกเปิดเว็บ/กดซิงก์เอง — วิธีที่เลือกเพราะใช้ Spark ได้โดยไม่เพิ่ม Cloud Function,
  หรือ (b) ถ้าต้องการให้แอดมินกวาดได้ทุกกรณี ต้องเพิ่ม Callable Function ที่รันด้วย Admin SDK
  (ต้อง Blaze) — นอกขอบเขตครั้งนี้
- **Co-admin (`canManageMembers: true`) เปลี่ยน `status` ของสมาชิกไม่ได้** เพราะกฎ
  `sameRoleAndPermissions()` ตรึง role/permissions/status ไว้ (กันการยกระดับสิทธิ์).
  ปุ่มจะซ่อม uid/cำขอได้ แต่รายงานจะเตือนให้ **เจ้าของทริป** เป็นคนกดสำหรับข้อ 3
- คำขอ `approved` ถูกเก็บเป็น tombstone ไม่ถูกลบ เพื่อให้ทั้งสองฝ่ายเห็นสถานะเดียวกันและกัน
  การสร้าง primary ใหม่จาก mirror โดยไม่ตั้งใจ (loop)
- uid ใน `memberUids` ที่ **ไม่มีเอกสารสมาชิก** ไม่ถูกลบเด็ดขาด — อาจเป็นบัญชี PIN เดิมที่ยังใช้ล็อกอินอยู่

---

## 5) ไฟล์ที่เกี่ยวข้อง / ตรวจแล้ว

| ไฟล์ | หน้าที่ |
|---|---|
| `src/js/utils/membershipRepair.js` | ตัดสินใจซ่อม (pure) + ตัวช่วยสถานะคำขอ |
| `src/js/members/repair.js` | ปุ่มฝั่งแอดมิน: อ่าน server + เขียน 5 อย่าง + report |
| `src/js/members/join.js` | `syncMyJoinRequests()` สำหรับปุ่มฝั่งสมาชิก |
| `src/js/app.js` | ปุ่ม/รายงานบนหน้า `สมาชิก` และ `ทริปของฉัน`, คิวแสดงเฉพาะ actionable |
| `index.html` | cache-buster `&membership-repair=1` |
| `tests/unit/membership-repair.test.js` | unit: แผนซ่อม, idempotence, แผน sync |
| `tests/membership-repair.test.mjs` | integration กับ Firestore stub: mirror-only, stale mirror, rejected, denied, sweep ครบชุด, sweep ซ้ำ |
| `tests/smoke/run.mjs` | เช็กว่าปุ่ม 2 ฝั่งอยู่บนหน้าจริงและกดแล้วมีรายงาน |

ผลทดสอบบน branch นี้: `npm test` **271 passed / 0 failed**, `npm run test:membership` **15/15**,
`npm run test:smoke` ผ่านทุกเช็กที่เกี่ยวข้อง (join/approve/rules-help/delete trip + ไม่มี uncaught errors);
เหลือเฉพาะเช็ก PNG export ที่ jsdom rasterize ไม่ได้ ซึ่ง **base commit `d592fc7` ก็ล้มเหมือนกัน**
(known limitation เดิมตาม README v46).
