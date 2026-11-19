# รายงานการทดสอบทั้งระบบ — trip-manager

- **วันที่ทดสอบ:** 19 พฤศจิกายน 2026
- **branch:** `arena/8a260163-trip-manager` (ต่อจาก `main` @ `648129a`)
- **PR:** #71
- **เครื่องที่รัน:** sandbox Linux (Node.js, ไม่มีจอ/ไม่มีสิทธิ์ root) — ข้อจำกัดของ environment ระบุไว้ใน §5

## 1. สรุปผลรวม

| # | ชุดทดสอบ | คำสั่ง | ผลจริง |
|---|---|---|---|
| 1 | ตรรกะทั้งหมดของแอป (unit/pure) | `npm test` | ✅ **272/272 ผ่าน** |
| 2 | สิทธิ์สมาชิก + Firestore index | `npm run test:membership` | ✅ **26/26 ผ่าน** (index 2 + membership 24) |
| 3 | การ deploy แบบ Spark / CI guard | `node --test tests/deploy-spark.test.mjs` | ✅ **6/6 ผ่าน** |
| 4 | Cloud Functions | `npm --prefix functions test` (+ `run lint`) | ✅ **3/3 ผ่าน**, lint 0 error |
| 5 | ตัวส่ง push (GitHub Actions) | `npm test --prefix tools/push-actions` | ✅ **12/12 ผ่าน** |
| 6 | E2E ใน jsdom (ทั้งแอป) | `npm run test:smoke` | ✅ **941 ผ่าน / 0 ตก / 23 ต้องเบราว์เซอร์จริง** (85 section) |
| 7 | Firestore Rules (emulator) | `firebase emulators:exec --only firestore "npm run test:rules"` | ⊘ **รันไม่ได้ใน sandbox** (14 เคส) |
| 8 | เบราว์เซอร์จริง 9 ชุด (puppeteer) | `npm run test:browser:*` | ⊘ **รันไม่ได้ใน sandbox** (9 ชุด) |

**รวมข้อที่รันจริงและผ่าน: 1,260 ข้อ / ตก 0 ข้อ** (941 + 272 + 26 + 6 + 3 + 12)
เหลือ 2 กลุ่มที่ sandbox นี้รันไม่ได้ (rules 14 เคส, browser 9 ชุด) — วิธีรันบนเครื่องคุณอยู่ใน §5

## 2. เทสเคสที่เกี่ยวกับ “สิทธิ์การเข้าถึงของสมาชิก” (หัวข้อที่แจ้งปัญหา)

### 2.1 เดินเรื่องจริงใน jsdom (smoke) — ผ่านทุกข้อ

**section 47 · v7: member joins with a Google account + invite code (ไม่มี Cloud Functions)** — 17 ข้อ
- ล็อกอิน Google → เห็นหน้าแรก, สร้างเอกสาร profile + directory
- ใส่รหัสเชิญ (ตัวพิมพ์เล็ก/ใหญ่/มีขีด ก็หาเจอ) → เก็บ join request
- สมาชิกเห็นสถานะคำขอของตัวเอง = “รออนุมัติ”
- แอดมินเห็นคำขอ → อนุมัติ → สร้าง member doc ที่ key = uid
- **อนุมัติแล้ว uid ถูกเขียนลง `memberUids`** + ล้าง join request
- สมาชิกเห็นทริปในลิสต์, badge “รออนุมัติ” หายไป

**section 50 · membership repair: admin sweep + member-side request sync** — 4 ข้อ (ปุ่ม sweep + รายงานที่อ่านรู้เรื่อง + รีเฟรชคิว + ปุ่ม sync ฝั่งสมาชิก)

**section 81 · memberUids drift: member document อย่างเดียวต้องพาทริปขึ้นมา** — 5 ข้อ
- เจอทริปผ่าน member doc (`drift1`), member ที่ inactive ไม่พาทริปขึ้นมา
- เขียน `memberUids` คืนให้ตอนล็อกอินครั้งถัดไป, inactive ไม่ถูกเติมคืน
- reconcile ฝั่งแอดมินเติมสมาชิก active ที่หายไป

**section 79 · v36: สองบัญชีไม่เห็นลิสต์ทริปของกันและกัน** — 3 ข้อ (รวมถึง cache ที่ประทับ uid อื่นต้องไม่ถูกใช้)

**section 85 · v37: ระงับสมาชิก = ตัดสิทธิ์ทันที (ฟอร์มจริง → ผลจริง)** — 9 ข้อ **(เพิ่มใหม่รอบนี้)**
1. ฟอร์มแก้ไขสมาชิกมีช่องสถานะ
2. แอดมินทริปเปลี่ยนได้ (ไม่ disabled)
3. มีสองตัวเลือกเท่านั้น และค่าที่เขียนคือ `active` / `inactive` (ค่าที่ rules ใช้ตัดสิทธิ์)
4. ตัวเลือกเขียนชัดว่า “ระงับการใช้งาน” (ตัดสิทธิ์เข้าถึงทริป)
5. เลือก “ระงับ” → บันทึก `status=inactive`
6. **uid ออกจาก `memberUids` ในครั้งเดียวกัน** (สิ่งที่ rules ตรวจ)
7. รายชื่อสมาชิกขึ้นว่า “ระงับการใช้งาน”
8. เปิดใช้งานอีกครั้ง → `status=active`
9. **uid กลับเข้าทริปลิสต์**

**section 25 · v5: Settings > system check อธิบายการล็อกอินสมาชิกที่พัง** — 8 ข้อ (ตรวจ 15 probe, แยก warning/error, คัดลอกรายงานได้, `fujiDiagnose()`)

**section 48 · v8: ยังไม่ publish rules → ขึ้นคำแนะนำที่ทำตามได้ ไม่ใช่ error ดิบ** — 8 ข้อ

### 2.2 ระดับโมดูล (`npm run test:membership`) — 26/26

| # | เคส | ผล |
|---|---|---|
| 1 | Firestore composite index fields use supported Firebase CLI modes |
| 2 | memberUids composite index is an array-contains index |
| 3 | admin repair re-reads the trip and member, even when the displayed list is stale |
| 4 | member discovery finds an existing active member and skips inactive members |
| 5 | a failed discovery is not silently presented as an empty membership |
| 6 | a partial list remains visible, is flagged, and is not cached as complete |
| 7 | a failed uid query does not prevent finding a linked account via authUid |
| 8 | a failed membership query is not masked by a successful empty creator query |
| 9 | member sync republishes a mirror-only pending request into the admin queue |
| 10 | member sync clears a stale mirror for a joined trip without re-creating a request |
| 11 | member sync drops the mirror of an approved request and copies a rejection |
| 12 | a denied trip-side read is reported, never guessed at or silently discarded |
| 13 | admin sweep fixes pending members, drifted uids and stale requests together |
| 14 | admin sweep is idempotent — a second pass changes nothing |
| 15 | an unreadable request queue does not block the membership half of the sweep |
| 16 | approval always lands the uid in memberUids — never skipped because a cached trip looked right |
| 17 | approving twice does not duplicate the memberUids entry |
| 18 | an approved member gets in through their join mirror when the list query and discovery both fail |
| 19 | a trip remembered on the device is re-checked even after the mirror is gone |
| 20 | a request the admin has not approved yet stays pending — no trip and no scary error |
| 21 | a failed lookup reports which source failed instead of one generic sentence |
| 22 | deleting a member always drops the uid from the trip listing (no lingering access) |
| 23 | deleting a member whose uid was never listed still succeeds |
| 24 | suspending a member revokes access in one write (member document + trip listing) |
| 25 | re-activating a member puts the listing back |
| 26 | editing a member without touching the status keeps the listing untouched |

### 2.3 Firestore Rules — เขียนไว้ 14 เคส แต่ **sandbox รันไม่ได้**

| # | เคส | ผล |
|---|---|---|
| 1 | keeps member PIN hashes and username indexes server-only | ⊘ ไม่ได้รัน |
| 2 | allows a known invite preview but never exposes or lists trips by invite code | ⊘ ไม่ได้รัน |
| 3 | lets a trip admin atomically maintain only a matching minimal invite preview | ⊘ ไม่ได้รัน |
| 4 | makes public profiles owner-readable, non-listable, and schema constrained | ⊘ ไม่ได้รัน |
| 5 | prevents a user from granting their own super-admin role or writing PIN material | ⊘ ไม่ได้รัน |
| 6 | shares the dashboard with all trip members but only admins and managers can change it | ⊘ ไม่ได้รัน |
| 7 | shares cover framing while restricting delegated writes | ⊘ ไม่ได้รัน |
| 8 | accepts a clamped cover zoom and rejects one outside the frame | ⊘ ไม่ได้รัน |
| 9 | limits non-admin trip-document writes to their specific capabilities | ⊘ ไม่ได้รัน |
| 10 | denies inactive members even when an old memberUids entry is still present | ⊘ ไม่ได้รัน |
| 11 | revokes access for a legacy `disabled` status too — the array entry does not help | ⊘ ไม่ได้รัน |
| 12 | lets a drifted member find and restore their own trip listing, and nothing more | ⊘ ไม่ได้รัน |
| 13 | limits co-admin membership changes and prevents role/permission escalation | ⊘ ไม่ได้รัน |
| 14 | lets users create their own join request and limits queue reads/approval to managers | ⊘ ไม่ได้รัน |

สองเคสล่างสุดของกลุ่มนี้คือของรอบ 3: `denies inactive members …` และ `revokes access for a legacy disabled status too` (ยืนยันว่า array ที่ค้างอยู่ไม่ช่วยให้เข้าทริปได้)

## 3. เทสเคสของส่วนอื่นทั้งระบบ

### 3.1 unit / pure logic — 272 ข้อ ใน 55 ไฟล์ (`npm test`)

| ไฟล์ | จำนวนเคส |
|---|---|
| booking-links.test.js | 2 |
| bookingImport.test.js | 8 |
| budget.test.js | 2 |
| buildInfo.test.js | 4 |
| calendarView.test.js | 6 |
| categories.test.js | 1 |
| colors.test.js | 1 |
| countdown.test.js | 4 |
| cover-position.test.js | 7 |
| currency.test.js | 2 |
| dashboard-layout.test.js | 5 |
| dashboard-teams.test.js | 6 |
| dashboard-widgets.test.js | 5 |
| datacache.test.js | 7 |
| debt-map.test.js | 13 |
| designRules.test.js | 10 |
| diagnostics.test.js | 3 |
| excel.test.js | 4 |
| expense-improvements.test.js | 10 |
| explore.test.js | 8 |
| export-layout.test.js | 2 |
| groups.test.js | 5 |
| ics.test.js | 8 |
| ideas.test.js | 6 |
| invite.test.js | 1 |
| jma.test.js | 5 |
| member-uids.test.js | 4 |
| membership-repair.test.js | 2 |
| mobileShell.test.js | 2 |
| navigation.test.js | 1 |
| notifications.test.js | 12 |
| payment-methods.test.js | 3 |
| permissions.test.js | 5 |
| place-categories.test.js | 4 |
| placeDetails.test.js | 5 |
| popups.test.js | 3 |
| prep.test.js | 7 |
| reservations.test.js | 8 |
| route.test.js | 7 |
| rulesHelper.test.js | 1 |
| scheduleRepair.test.js | 11 |
| scheduling.test.js | 1 |
| security.test.js | 5 |
| settle-by-bill.test.js | 5 |
| settlement.test.js | 1 |
| share.test.js | 6 |
| split.test.js | 2 |
| statement.test.js | 1 |
| stays.test.js | 2 |
| thb.test.js | 1 |
| themes.test.js | 6 |
| transfers.test.js | 5 |
| uiStyle.test.js | 7 |
| visits.test.js | 7 |
| weather.test.js | 13 |

### 3.2 deploy / CI guard — 6/6

| # | เคส | ผล |
|---|---|---|
| 1 | default Firebase config only deploys Spark-compatible services |
| 2 | Firebase Hosting includes the static app source |
| 3 | CI deploy explicitly limits targets to Firestore rules and indexes |
| 4 | Pages uploads only browser assets and never needs a sender credential/URL |
| 5 | Actions sender is explicitly opt-in, scheduled, secret-only and non-overlapping |
| 6 | queue has a collection-group index and clients cannot forge delivery receipts |

### 3.3 Cloud Functions — 3/3 (และ lint ผ่าน)

| # | เคส | ผล |
|---|---|---|
| 1 | verifies the existing PBKDF2-SHA256 member secret format |
| 2 | supports the historical default iteration count and rejects malformed legacy material |
| 3 | verifies bcrypt credentials retained for pre-migration accounts |

### 3.4 ตัวส่ง push (Actions) — 12/12

| # | เคส | ผล |
|---|---|---|
| 1 | sends pending queue once, intersects membership, excludes author and sends data-only FCM |
| 2 | concurrent scheduled/manual jobs atomically claim only once |
| 3 | no replay after FCM failure or a crash before completion receipt is saved |
| 4 | preflight network errors stay pending for safe retry before any sends |
| 5 | sender honors push/category/device/trip preferences and never broadcasts test messages |
| 6 | inactive/removed authors are skipped; duplicate device tokens are sent once |
| 7 | old backlog expires without sending; bounded batches eventually drain |
| 8 | invalid notes and unsafe links cannot leak messages to arbitrary URLs/accounts |
| 9 | only unregistered tokens are deleted; recipient cap rejects before first send |
| 10 | Firestore transaction rejects stale/nonpending snapshots and persists a server-only claim |
| 11 | queue queries use indexed pending state, timestamps and a strict batch limit |
| 12 | completion receipt cannot overwrite a replaced claim or a new pending document |

### 3.5 E2E jsdom — 85 section / 941 ข้อ

คอลัมน์ “⚠” = ข้อที่ต้องใช้ canvas rasterizer จริง (jsdom ทำ PNG ไม่ได้) — ไม่ใช่บั๊กของแอป

| # | section | ผ่าน | ⚠ |
|---|---|---|---|
| 1 | JSON expense import batch boundaries | 14 |  |
| 2 | boot & trip list | 2 |  |
| 3 | dashboard (single page + animated countdown card) | 18 |  |
| 4 | cover crop: the reader chooses what the cover shows (v45) | 20 |  |
| 5 | nav active-state follows the route without needless rebuilds (v33) | 6 |  |
| 6 | itinerary (map, 16:9 image, edit/delete, estimate → expense) | 11 |  |
| 7 | expenses (list + add/edit form) | 8 |  |
| 8 | members (add + edit + delete) | 6 |  |
| 9 | documents (add + edit + delete) | 4 |  |
| 10 | import / export (admin-only Excel) | 5 |  |
| 11 | settings (editable + deletable trip) | 17 |  |
| 12 | settlement & more | 6 |  |
| 13 | itinerary: add a place with coordinates (map must not re-init) | 6 |  |
| 14 | v19 plan → money: one expense form, two screens + teams per place | 18 |  |
| 15 | estimate auto-aggregates into expenses | 5 |  |
| 16 | expense edit + delete | 2 |  |
| 17 | expenses: แก้ไขในป๊อปอัป + ปุ่มบันทึกลอย (v22) | 15 |  |
| 18 | itinerary: มุมมองกระทัดรัด (v23) | 21 |  |
| 19 | v37: ระงับสมาชิก = ตัดสิทธิ์ทันที (ฟอร์มจริง → ผลจริง) | 9 |  |
| 20 | member edit + delete | 2 |  |
| 21 | documents: edit + delete | 2 |  |
| 22 | permissions: Excel buttons hidden from non-admins | 8 |  |
| 23 | Excel round trip (real SheetJS) | 8 |  |
| 24 | UI: import the itinerary workbook (admin) | 6 |  |
| 25 | v5 → v35: every menu page opens with a plain page header (the animated scenes were retired in the calm pass) | 18 |  |
| 26 | v5: Settings > system check explains broken member login | 8 |  |
| 27 | v5: dashboard does not re-render icons every second | 3 |  |
| 28 | v5: map layers (street / satellite / terrain) | 7 |  |
| 29 | v5: Google Maps navigation links | 6 |  |
| 30 | v5: sticky notes board | 7 |  |
| 31 | v5/v12: mobile layout (toolbars, chips, viewport) | 3 |  |
| 32 | v5: PNG export survives color-mix() | 5 |  |
| 33 | v9: THB is shown next to every amount | 7 |  |
| 34 | v9: expense groups can be added, edited and deleted | 15 |  |
| 35 | expense groups keep working before the rules are published | 3 |  |
| 36 | baht amounts appear even when the trip never set a rate | 4 |  |
| 37 | settlement explains where each payment comes from | 3 |  |
| 38 | v9: clear-bill receipts (received / deducted / balance + per-person PNG) | 20 |  |
| 39 | performance: switching menus with a slow connection | 3 |  |
| 40 | PNG export can never be blocked by modern colors | 5 | 15 |
| 41 | v10: receipt photo is optional and never blocks saving | 4 |  |
| 42 | v10: itinerary page (days left, map right) + full-plan PNG | 14 | 3 |
| 43 | v10: dashboard shows the baht amount of the remaining budget | 3 |  |
| 44 | v13: managed card dropdown on an expense + per-card summary | 13 |  |
| 45 | v10: per-person receipts are colour-coded and the overview is the default | 11 |  |
| 46 | v10: sticky notes fold away when empty and can be filed as done | 12 |  |
| 47 | v9: one simple login screen (Google + email only) | 11 |  |
| 48 | v7: member joins with a Google account + invite code (no Cloud Functions) | 17 |  |
| 49 | v8: rules not published yet → actionable help instead of a raw error | 8 |  |
| 50 | v7: admin shares the invite code from Settings | 3 |  |
| 51 | membership repair: admin sweep + member-side request sync | 4 |  |
| 52 | v11: ความเห็น/ทักท้วงบนรายการ + ประวัติการแก้ไข (ใครแก้ล่าสุด) | 13 |  |
| 53 | v11: expense list grouped by day | 10 |  |
| 54 | v11: itin day PNG + แผนที่พอดีจอ | 9 | 5 |
| 55 | v11: ใบเสร็จ — เลือกดูรายคน, ชื่อเด่นชัด, ทักท้วงในใบเสร็จ | 14 |  |
| 56 | v12: จอเล็ก (iPhone) — header ไม่ดันจอ และชื่อยาวไม่ทำจอล้น | 8 |  |
| 57 | grouped expense form, exact custom split, multiple payers | 16 |  |
| 58 | estimates without an assigned payer | 4 |  |
| 59 | compact expenses density and mobile date headings | 9 |  |
| 60 | expense with a receipt photo — must save, and the upload toast must never stick | 3 |  |
| 61 | v16 trip tools — prep checklists | 8 |  |
| 62 | v16 trip tools — ideas board (vote + add to plan) | 8 |  |
| 63 | v18.2 — ไอเดียยังบันทึกได้แม้กฎ Firestore ยังไม่อนุญาต (fix: missing permissions) | 7 |  |
| 64 | v16 trip tools — bookings + calendar export | 7 |  |
| 65 | dashboard widgets — shared drag layout | 13 |  |
| 66 | v18.2 itinerary — clean toolbar + Excel import behind edit mode | 6 |  |
| 67 | v16 exports page — calendar (.ics) | 4 |  |
| 68 | v17 explore — curated place guides (ไกด์ชวนไปที่นี่) | 12 |  |
| 69 | v17 calendar — the plan on a month grid (ปฏิทินทริป) | 10 |  |
| 70 | v17 share — invite link, LINE message & summary | 7 |  |
| 71 | v17 booking import — paste a confirmation e-mail | 9 |  |
| 72 | v18.2 — สรุปการโอน / โหมดกระทัดรัด / แผนที่หนี้ / กลุ่มย่อย / เฉลี่ยต่อคน | 102 |  |
| 73 | v17/v18 offline strip + colour themes | 23 |  |
| 74 | v19 requests: drag only in edit mode, teams every, per-group averages | 15 |  |
| 75 | plan card: a second payer on the linked cost shows on the place | 4 |  |
| 76 | v28 requests: no swipe deck, one debt map, compact footer, header nav + clock city, map labels, big photos | 31 |  |
| 77 | v29 requests: full menu row, countdown fills its card, line colour = receiver | 10 |  |
| 78 | v30: การแจ้งเตือน (🔔 + Web Push) และสิทธิ์ตามที่ออกแบบไว้ | 120 |  |
| 79 | v36: transfers need the same permission as the rules + concurrent pays are serialized | 7 |  |
| 80 | v36: two accounts never share a trip list | 3 |  |
| 81 | v36: the trip list is paged (no silent 30-trip cap) | 2 |  |
| 82 | memberUids drift: a member document alone must surface the trip | 5 |  |
| 83 | v36: reference checks and comments are not capped at 300/200 rows | 3 |  |
| 84 | delete the whole trip (UI) | 2 |  |
| 85 | error log | 1 |  |

รายละเอียดทุกข้อ (941 บรรทัด) อยู่ใน [`docs/test-cases-smoke.txt`](./test-cases-smoke.txt)

### 3.6 เบราว์เซอร์จริง (puppeteer) — ⊘ รันไม่ได้ใน sandbox

| ชุด | ตรวจอะไร | ผล |
|---|---|---|
| mobile-check.mjs | หน้าจอมือถือ: ระยะขอบ, ปุ่มแตะ, ไม่มีแนวนอนล้น | ⊘ ไม่ได้รัน |
| desktop-check.mjs | หน้าจอเดสก์ท็อป: เลย์เอาต์ 3 คอลัมน์, แถบข้าง | ⊘ ไม่ได้รัน |
| dashboard-responsive-check.mjs | แดชบอร์ดที่ความกว้างต่าง ๆ (responsive) | ⊘ ไม่ได้รัน |
| design-check.mjs | ดีไซน์/ธีม: สี, ระยะ, ไอคอนสม่ำเสมอ | ⊘ ไม่ได้รัน |
| toast-theme-check.mjs | toast แจ้งเตือนอ่านได้ทั้งธีมสว่าง/มืด | ⊘ ไม่ได้รัน |
| expense-selection-check.mjs | การเลือกหลายรายการในหน้าใช้จ่าย + ปุ่มลอย | ⊘ ไม่ได้รัน |
| floating-actions-check.mjs | ปุ่มลอย (FAB) ไม่ทับเนื้อหา | ⊘ ไม่ได้รัน |
| mobile-expenses-navigation-check.mjs | นำทางหน้าย่อยค่าใช้จ่ายบนมือถือ | ⊘ ไม่ได้รัน |
| export-check.mjs | ส่งออก PNG จริงในเบราว์เซอร์ (html2canvas rasterize) | ⊘ ไม่ได้รัน |

## 4. สิ่งที่แก้ไปในรอบนี้ (นอกเหนือจากการทดสอบ)

1. **`tests/smoke/run.mjs` — ทำให้ harness ทนต่อ environment**: ก่อนหน้านี้ smoke ตายที่ PNG ข้อแรก (บรรทัด ~1412) ทำให้ทุก section หลังจากนั้นไม่ได้รันเลย ตอนนี้เพิ่ม `envCheck` / `waitForDownload` / `needsDownload`
   → PNG ที่ทำไม่ได้ใน jsdom รายงานเป็น ⚠ และ **section ที่เหลือรันจนจบ**: 324 ข้อ (เดิม) → **941 ข้อ, 85 section, 0 ตก**
2. **เพิ่ม smoke section v37** (9 ข้อ) ยืนยันเส้นทาง “ระงับ → ตัดสิทธิ์ → เปิดคืน → ได้สิทธิ์คืน” ผ่าน UI จริง ไม่ใช่แค่ระดับฟังก์ชัน
3. **ข้อความไทยในรายชื่อสมาชิก**: `memberStateLabel('inactive')` เดิมขึ้นว่า “ปิดใช้งาน” ซึ่งกำกวม (อ่านเหมือนปิดฟีเจอร์) → เปลี่ยนเป็น **“ระงับการใช้งาน”** ให้ตรงกับที่ฟอร์มเขียน

## 5. ข้อจำกัดของ environment นี้ + วิธีรันให้ครบบนเครื่องคุณ

### 5.1 Firestore Rules (14 เคส) — ไม่ได้รันจริง

- สาเหตุ: firebase-tools ต้องโหลด `cloud-firestore-emulator-v1.19.8.jar` จาก `storage.googleapis.com` ซึ่ง sandbox นี้บล็อก (ลองทั้ง firebase-tools 13 และ 15, ไม่มี npm package ไหนพา jar มาให้)
- Java พร้อมใช้แล้ว (`pip download jdk4py`) แต่ไม่มี jar
- **รันบนเครื่องคุณ:**
  ```bash
  npm install -g firebase-tools@13     # หรือ 15
  firebase emulators:exec --only firestore "npm run test:rules"
  ```
  ต้องมี JDK 11+ (`java -version`) — ถ้า error เรื่อง jar ให้ลบ cache: `rm -rf ~/.cache/firebase/emulators`

### 5.2 เบราว์เซอร์จริง (9 ชุด) — ไม่ได้รันจริง

- สาเหตุ: `@sparticuz/chromium` ต้องใช้ `libnss3.so` ซึ่งไม่มีใน sandbox และติดตั้งไม่ได้ (ไม่มี root/apt)
- **รันบนเครื่องคุณ:** `npx puppeteer browsers install chrome` แล้ว `npm run test:browser:mobile` ฯลฯ
- สำคัญสุดคือ `npm run test:browser:export` เพราะเป็นชุดเดียวที่ rasterize PNG จริง (23 ข้อ ⚠ ใน smoke จะถูกยืนยันที่นี่)

## 6. สถานะการนำขึ้นใช้งาน

- PR #71: https://github.com/tonsao2024/trip-manager/pull/71 — เปิดอยู่, MERGEABLE, CI เขียว (run `44550701671` บน commit `d36810e`; commit ของรอบนี้จะรัน CI ใหม่)
- หลัง merge: GitHub Pages อัปเดตเอง (ไฟล์เว็บ) — ถ้ามีเอกสารสมาชิกเก่าที่ใช้ `status: 'disabled'` ให้รัน `firebase deploy --only firestore:rules` หนึ่งครั้ง เพื่อใช้ helper `revokedMemberStatus` ตัวใหม่
- ตรวจด้วยมือเร็ว ๆ หลัง deploy: ล็อกอินแอดมิน → สมาชิก → แก้ไข “นุ่น” → เลือก “ระงับการใช้งาน” → บันทึก → เปิดด้วยบัญชีนั้นต้องเข้าไม่ได้ → เปิดคืน → เข้าได้ทันที
