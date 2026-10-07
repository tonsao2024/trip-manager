# Trip Manager (Fuji Trip Planner & Group Expense Manager)

Modern, production-ready trip planner with group expense splitting, smart scheduling, and settlement — built for GitHub Pages + Firebase.

> **v23 — 7 Oct 2026, มุมมองกระทัดรัดในแผนการเดินทาง.** The plan toolbar now has a
> **มุมมองกระทัดรัด / Compact view** toggle next to “ดูทั้งหมด” (remembered per device in
> `localStorage`). Compact keeps only what you need to move through the day — ลำดับ, ช่วงเวลา,
> ชื่อสถานที่, หมวด (icon), สถานะ, ประมาณการ/ค่าใช้จ่าย, ปุ่มนำทาง — and folds the photo, the
> address, the duration line, team chips, check-in/out, the expense-link button, the “ดูเพิ่มเติม”
> toggle and the travel legs (a real “ไม่พอเวลา” warning still shows). The photo thumbnail becomes a
> small **⋯** action so แก้ไข / สถานะ / ลบ stay reachable, and the category/navigation labels
> collapse to icons. One place card goes from **283 px to 131 px** on an iPhone 16 Pro (≈2.2× more
> places per screen); the navigate link moved into the meta row on the card so compact stays one
> line. `mobile-check` measures the denser card and that everything else really folded, on every
> device size. Screenshots: [`docs/preview/`](docs/preview/index.html).
>
> **v22 — 7 Oct 2026, three reported fixes.** **(1) แผนการเดินทาง on a phone:** every place
> card (and the day bar, the sticky notes and the map) was sized to its *max-content* width, so on
> an iPhone 16 Pro the plan grew to ~811 px on a 402 px screen — the page could be dragged
> sideways and the right half of every row was off-screen (“แสดงไม่สมบูรณ์เลยอ่านไม่ได้”). The
> ≤1023 px itinerary layout is a flex column that inherited the grid's `align-items: start`; it now
> stretches (`items stretch` + `width:100% / min-width:0` on every child), so the plan fits the
> screen exactly. **(2) ค่าใช้จ่าย:** tapping a row or its pencil opens the expense form in a
> **popup over the list** instead of jumping to the editor page (`#/trip/:id/expenses/add?id=…` is
> still there — “เปิดหน้าเต็ม” links to it); saving or deleting refreshes the list, the day groups
> and the KPIs in place. **(3) เพิ่มค่าใช้จ่าย:** the **save bar floats** — the form's action row is
> sticky, parked above the bottom navigation on phones (and at the sheet's edge inside the popup),
> with `scroll-padding-bottom` so a focused field is never hidden behind it. The corner “+” FAB
> hides on the editor page (it sat on top of the bar). `tests/browser/mobile-check.mjs` now checks
> iPhone 16 Pro / iPhone 16 too and **fails on any element that sticks out of the screen**.
> Screenshots: [`docs/preview/`](docs/preview/index.html).

> **7 Oct 2026 — mobile plan rework.** Phones no longer open the plan page mid-scroll (the day-chip strip
> never scrolls the page anymore), and the single-column layout puts the **map above sticky notes and the
> day plan**. Plan cards are **compact on phones** — the place title gets the available width, status stays
> in a small top-right tag, and extra details sit behind a compact **“ดูเพิ่มเติม”** button; desktop still
> shows everything. Sticky notes start folded on small screens, and status pills no longer wrap mid-word.

> **v19 “Vivid & Clear” — updated 6 Oct 2026.** Five planner requests landed: **drag-to-reorder only in edit
> mode**, a **ทีม (team) panel on the dashboard** with cost-per-person + team total, the expenses KPI reading
> **เฉลี่ยต่อกลุ่ม → ต่อคน** with the **5 summary cards in one row at every width**, and four plan-page changes —
> “รายละเอียดสถานที่” removed, **per-place team picker**, **one category for the whole app**, and a linked
> expense that opens the **same form as ค่าใช้จ่าย** in an in-page sheet. Status colours are fully saturated and
> the canvas is brand-tinted.
> The v18 work (rename, colour themes back, swipeable receipts, Mt-Fuji buddy, travel legs, footer) and the
> v17 work (guides, month **calendar**, **share/invite**, **booking import**, **offline strip**) all stay.
> Live: <https://tonsao2024.github.io/trip-manager/> •
> screenshots: [`docs/preview/`](docs/preview/index.html).
> The app shows the same build date (from `src/js/utils/buildInfo.js`) on the sign-in screen, the More
> page and Settings → About.

**Stack:** HTML5, CSS3, ES Modules, Tailwind CDN, Firebase (Auth, Firestore, Storage, Functions), Leaflet, Chart.js, Day.js, html2canvas+jsPDF (lazy), SheetJS (lazy), Lucide Icons.

**No PWA:** No manifest, no service worker. Only Firestore offline persistence for resilience.

---

## Architecture Summary

- **Frontend:** Static SPA with hash routing (`#/login`, `#/trips`, `#/trip/:id/dashboard` etc). No build step required; deploy `index.html` + `src/` directly to GitHub Pages.
- **Backend:** Firebase Firestore (data), Auth (admin email/pass + member username/PIN via custom token), Storage (receipts, avatars), Functions (auth verification, settlement, scheduling).
- **Security:** Rules enforce trip isolation via `tripId`, role checks, no PIN hash readable client-side, audit logs for sensitive actions, step-up PIN verification with short session (10 min).
- **Design:** Modern minimal + soft depth, bento-grid dashboard, CSS variables for light/dark, Fuji gradient accent, Inter + Noto Sans Thai, transform/opacity animations only.

## Database Schema

```
users/{uid} { role: super_admin|trip_admin|member, displayName, email, pinHash? (for step-up) }

loginAccounts/{normalizedUsername} { pinHash (bcrypt), memberUid, tripId, failedAttempts }

trips/{tripId} { name, description, country, city, startDate, endDate, timezone, baseCurrency, coverImage, status, memberUids[], createdAt, updatedBy, themeColor? (legacy — the brand colour is fixed now) }

trips/{tripId}/members/{memberId} { uid, displayName, username, role, color, avatar, status, permissions: { canEditItinerary, canEditExpense, canManageMembers }, order }

trips/{tripId}/itineraryItems/{itemId} { title, description, date (YYYY-MM-DD), startAt (Timestamp), endAt, durationMinutes, travelToNextMinutes, order, category, address, coordinates (lat,lng), googleMapsUrl, imageUrl, notes, status, expenseId, createdBy, updatedBy, version }

trips/{tripId}/expenses/{expenseId} { title, description, date, category, payerId, allocations: [{memberId, amountMinor}], subtotalMinor, discountMinor, serviceMinor, taxMinor, cardFeeMinor, cardFeePercent, netTotalMinor, currency, exchangeRate, baseCurrency, convertedMinor, paymentMethod, cardId, itineraryItemId, receiptUrl, status: active|voided, createdBy, updatedBy }

trips/{tripId}/expenses/{expenseId}/lineItems/{lineItemId} { name, quantity, unitPriceMinor, memberIds, splitMethod }

trips/{tripId}/settlements/{settlementId} { balances, transactions: [{from,to,amountMinor}], status, createdBy, createdAt }

trips/{tripId}/categories/{categoryId} { name, icon, color, order, active }

trips/{tripId}/cards/{cardId} { nickname, bank, holder, last4, color, currency, fee, active }

trips/{tripId}/exchangeRates/{rateId} { from, to, rate, updatedAt, updatedBy }

trips/{tripId}/settings/{settingId} { key, value }

trips/{tripId}/activityLogs/{logId} { action, target, by, before, after, timestamp }

trips/{tripId}/imports/{importId} { filename, rows, errors, status, createdBy }

trips/{tripId}/checklists/{listId} { title, kind: packing|todo, icon, color, order, items: [{ id, text, done, assignee, doneBy, doneAt }], createdBy, updatedBy }
trips/{tripId}/ideas/{ideaId} { title, description, address, coordinates, imageUrl, link, status: idea|planned|in_plan|dropped, votes: { memberId: true }, estimatedCostMinor, currency, createdBy, createdAt }
trips/{tripId}/reservations/{reservationId} { type: flight|train|bus|hotel|restaurant|car|activity|other, title, provider, confirmation, date, startTime, endTime, checkIn, checkOut, address, coordinates, seat, costMinor, currency, notes, url, createdBy, createdAt }
```

Money stored as minor units (satang/cent) to avoid float errors.

## Firestore Indexes

See `firestore.indexes.json` — composite for itinerary by date+order, expenses by status+date, etc.

## Security Rules

- `firestore.rules`: Auth required, trip membership check via `memberUids` array + subcollection, role escalation prevented, version increment required for itinerary, amount validation, no PIN hash readable.
- `storage.rules`: Auth required, trip member check via Firestore, size limits (2-5MB), content-type checks.

## Cloud Functions (asia-southeast1)

- `createMemberAccount`: Admin only, bcrypt hash PIN, create auth user + loginAccounts + member doc, audit log.
- `loginWithUsernamePin`: Rate limited, bcrypt compare, check active, return custom token.
- `resetMemberPin`, `disableMemberAccount`, `revokeMemberSessions`: Admin only.
- `verifySensitiveActionPin`: Rate limited, verify PIN, create 10-min step-up session.
- `recalculateItinerarySchedule`: Server-side recalc, batch update, overlap detection.
- `validateExpenseAllocations`: Ensure sum == total, no negative.
- `recalculateSettlement`: Minimize transactions (creditor/debtor matching).
- `writeAuditLog`: Log sensitive actions.

- `healthCheck`: Diagnostics endpoint for Settings > **ตรวจสอบระบบ** (returns region, project, Firestore write test).

All functions validate auth, trip membership, input, rate limit, never return hash.

## วิธีที่แนะนำ: สมาชิกใช้บัญชี Google/อีเมล + รหัสเชิญ (ใช้ได้บนแผนฟรี)

Cloud Functions ต้องใช้แผน **Blaze** (เสียเงิน) — แต่การล็อกอินด้วย **Google** หรือ
**อีเมล/รหัสผ่าน** เป็นฟีเจอร์ของ Firebase Authentication ที่ใช้ฟรี และให้ `uid` จริงมาใช้กับ
Firestore Rules ได้ทันที จึงเป็นวิธีที่แนะนำบนแผนฟรี:

1. สมาชิกกด **“เข้าสู่ระบบด้วยบัญชี Google”** (หรือสมัครด้วยอีเมล/รหัสผ่าน) — ระบบสร้าง
   `users/{uid}` (role = member, กันการตั้งสิทธิ์ตัวเอง) และ `publicProfiles/{uid}` (ชื่อ/อีเมล/รูป เท่านั้น)
2. แอดมินแชร์ **รหัสเชิญ 6 ตัว** ของทริป (หน้าตั้งค่า > รหัสเชิญเข้าร่วมทริป)
3. สมาชิกกรอกรหัสที่หน้า “ทริปของฉัน” → ระบบสร้างคำขอที่
   `trips/{tripId}/joinRequests/{uid}` (+ สำเนาที่ `users/{uid}/joinRequests/{tripId}` ให้สมาชิกดูสถานะ)
4. แอดมินเปิด **หน้าสมาชิก > สมาชิกที่ล็อกอินด้วยบัญชี** กด **อนุมัติ** → ระบบสร้าง
   `trips/{tripId}/members/{uid}` และเพิ่ม uid ใน `memberUids` → กฎ Firestore เปิดให้สมาชิกเข้าถึงทริปนั้น
5. แอดมินยัง **เพิ่มด้วยอีเมล** ได้โดยตรง (ค้นหาจาก `publicProfiles`) หรือกำหนดบทบาท/สิทธิ์รายคนได้เหมือนเดิม

สิ่งที่ต้องตั้งค่าครั้งเดียวใน Firebase Console (ฟรีทั้งหมด):

| ตั้งค่า | ที่ไหน |
|---------|--------|
| เปิด Google + Email/Password | Authentication > Sign-in method |
| เพิ่มโดเมนเว็บ (เช่น `tonsao2024.github.io`) | Authentication > Settings > Authorized domains |
| Publish กฎใหม่ (`publicProfiles`, `joinRequests`, `trips/{tripId}/categories`) | Firestore > Rules (หรือ `firebase deploy --only firestore:rules`) |

> ไม่ต้องใช้ Cloud Functions เลย — ตรวจสอบได้ที่ **ตั้งค่า > ตรวจสอบระบบ**

## ทางเลือกเดิม (เลิกใช้แล้วใน v9): username + PIN

> **v9 ลบหน้าล็อกอิน username + PIN ออกแล้ว** — เหลือหน้าเดียวคือ Google หรืออีเมล/รหัสผ่าน
> เซสชันเก่าที่ค้างอยู่ในเครื่อง (`fuji_member_session`) ยังกู้คืนได้ ใครที่ยังไม่เคยตั้งบัญชี
> ให้กด **“เข้าสู่ระบบด้วยบัญชี Google”** แล้วเข้าร่วมทริปด้วยรหัสเชิญ (ดูหัวข้อด้านบน)
> ส่วนด้านล่างนี้เก็บไว้เป็นข้อมูลอ้างอิงของระบบเดิม/ฟังก์ชันที่ต้องใช้แผน Blaze เท่านั้น

การล็อกอินสมาชิกเคยมี 2 โหมด:

| โหมด | ต้องมี | ผลลัพธ์ |
|------|--------|---------|
| ในเครื่อง (ค่าเริ่มต้น) | ไม่มี | สมาชิกตั้งชื่อผู้ใช้ + PIN ได้ตอนเพิ่มสมาชิก (แฮช PBKDF2-SHA256 100k เก็บใน `members/{id}`) แล้วล็อกอินได้เลยบนอุปกรณ์นั้น |
| เต็มรูปแบบ | Blaze plan + deploy functions + rules | สมาชิกได้ Firebase Auth จริง (custom token) ซิงก์ข้อมูลข้ามเครื่อง/ทุกที่ |

### ขั้นตอนเปิดโหมดเต็มรูปแบบ

1. อัปเกรดโปรเจกต์ `trip-manager-93b22` เป็นแผน **Blaze** (Cloud Functions ใช้ Spark ไม่ได้)
2. ติดตั้ง CLI แล้วชี้โปรเจกต์
   ```bash
   npm i -g firebase-tools
   firebase login
   firebase use trip-manager-93b22
   ```
3. Deploy ฟังก์ชัน + กฎ + index
   ```bash
   firebase deploy --only functions,firestore:rules,firestore:indexes
   ```
4. ถ้าเรียกแล้วได้ 403 จาก Cloud Run ให้เปิดสิทธิ์ผู้เรียก (ทำกับ `loginwithusernamepin`, `creatememberaccount`, `healthcheck`)
   ```bash
   gcloud run services add-iam-policy-binding loginwithusernamepin \
     --region=asia-southeast1 --member=allUsers --role=roles/run.invoker
   ```
5. เปิด provider: Firebase Console > Authentication > Sign-in method (Email/Password)
6. ตรวจในแอป: **ตั้งค่า > ตรวจสอบระบบ** หรือสั่ง `await fujiDiagnose()` ใน console — ต้องขึ้น ✅ ทุกบรรทัด

### เจอ `Missing or insufficient permissions` ตอนกรอกรหัสเชิญ

แปลว่า **ยังไม่ได้ Publish กฎใหม่** (คอลเลกชัน `joinRequests` / `publicProfiles` / `users/{uid}/joinRequests`
/ `trips/{tripId}/categories` ยังไม่มีในกฎที่ใช้งานอยู่) — ไม่ใช่บั๊กของแอป (อาการเดียวกันนี้จะเกิดตอน
บันทึก **กลุ่มค่าใช้จ่าย** ของทริปด้วย):

1. ในแอปจะขึ้นกล่อง **"ยังไม่ได้ Publish Firestore Rules"** พร้อมปุ่ม
   **คัดลอกกฎทั้งหมด** (ดึงไฟล์ `firestore.rules` จากเว็บ/raw GitHub ให้) และ
   **เปิด Firebase Console** (ลิงก์ตรงไปหน้า Rules ของโปรเจกต์)
2. วางกฎทั้งหมดแทนของเดิม แล้วกด **Publish**
3. กลับมากด "ขอเข้าร่วม" อีกครั้ง (ถ้ายังไม่ได้ให้รีเฟรชหน้าเว็บ) — หรือเช็กที่ **ตั้งค่า > ตรวจสอบระบบ**
   บรรทัด *Rules สำหรับคำขอเข้าร่วมทริป* ต้องขึ้น ✅

ถ้าสมาชิกเป็นคนเจอ error นี้ ให้กดปุ่ม **"คัดลอกข้อความส่งให้แอดมินทริป"** แล้วส่งในแชทได้ทันที

### ทำไมขึ้น `functions/internal: internal`

| สาเหตุ | วิธีแก้ |
|--------|--------|
| ยังไม่ได้ deploy functions | `firebase deploy --only functions` |
| Deploy คนละ region (แอปเรียก `asia-southeast1` เท่านั้น) | deploy ใหม่ตาม `firebase.json` |
| โปรเจกต์อยู่แผน Spark | อัปเกรดเป็น Blaze |
| Cloud Run ไม่ได้เปิด `allUsers` (403 → SDK รายงานเป็น internal) | คำสั่ง `gcloud run services add-iam-policy-binding` ด้านบน |
| ฟังก์ชัน throw เอง | ดู Console > Functions > Logs (ตั้งแต่ v5 ฟังก์ชันส่งข้อความจริงกลับมาแทนคำว่า internal เฉย ๆ) |

ถ้าสมาชิกยังไม่ได้รับสิทธิ์เต็มรูปแบบ แอปจะแสดงแถบ “โหมดสมาชิก (ไม่ใช้ Cloud Functions)” และอ่านข้อมูลจากแคชในเครื่องแทนการขึ้น error

## Folder Structure

```
/
├── index.html (SPA entry, GitHub Pages ready)
├── login.html (redirect)
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── storage.rules
├── src/
│   ├── css/tokens.css, components.css, animations.css
│   ├── js/
│   │   ├── app.js (router + views)
│   │   ├── firebase.js (init, config placeholder)
│   │   ├── firebase.config.template.js
│   │   ├── router.js
│   │   ├── auth/
│   │   ├── trips/
│   │   ├── itinerary/
│   │   ├── expenses/
│   │   ├── settlement/
│   │   ├── maps/
│   │   ├── exports/
│   │   ├── imports/
│   │   ├── components/toast.js, fuji.js, modal.js
│   │   └── utils/date.js, currency.js, split.js, settlement.js, scheduling.js, sanitize.js, helpers.js
│   └── assets/illustrations/fuji.svg
├── functions/src/index.js
├── public/templates/itinerary_template.csv
└── tests/unit/, tests/rules/
```

## Setup Firebase

1. Create project at https://console.firebase.google.com
2. Enable:
   - Auth: Email/Password
   - Firestore: Start in production mode, deploy `firestore.rules` + `firestore.indexes.json`
   - Storage: Deploy `storage.rules`
   - Functions: `asia-southeast1`, Node 20, `firebase deploy --only functions`
3. Get Web config: Project Settings > Your apps > Web > Config
4. For local dev: create `src/js/firebase.local.js` or set `localStorage.setItem('fuji_firebase_config', JSON.stringify(config))` then reload
5. For GitHub Pages: same localStorage method OR edit `src/js/firebase.js` placeholder and commit (not recommended for public repo, use localStorage)

## Deploy GitHub Pages

- Push this repo to GitHub, enable Pages: Settings > Pages > Source: main branch / root
- No build step needed. `index.html` is entry.
- First load will show config screen if no Firebase config — paste JSON and reload.

## Deploy Functions

```bash
cd functions
npm install
firebase login
firebase use YOUR_PROJECT
firebase deploy --only functions,firestore,storage
```

## Emulator Guide

```bash
firebase emulators:start --only firestore,auth,functions,storage
# In another terminal, run tests that need emulator
```

## Admin Setup

1. Create first super_admin manually:
   - Sign up via Firebase Console Auth with email/pass
   - In Firestore, create `users/{uid}` doc with `{ role: 'super_admin', displayName: 'Admin', email: '...' }`
2. Login as admin, create trips, create member accounts via UI (username+PIN)
3. Members login via Member tab with username+PIN

## Security Checklist

- [ ] No PIN/password in client source
- [ ] Firestore rules deny reading `loginAccounts`
- [ ] Storage rules check trip membership
- [ ] Functions use bcrypt, rate limit, don't log secrets
- [ ] `serverTimestamp()` for critical times
- [ ] Allocation sum validation both client+server
- [ ] Audit logs for sensitive actions
- [ ] No manifest/service worker (check no PWA files)
- [ ] Money stored as minor units

## Acceptance Checklist

- Admin/Member login with persistence, no raw PIN stored
- Multi-trip isolation via tripId; trips can be **edited (dates/details) and deleted** by admins
- Every record is editable + deletable: itinerary places, expenses, members, documents, trips
- Itinerary add/edit form with coordinates, photo, notes and an optional **estimated cost**
  (amount, currency, category, who paid, who shares) that is **auto-aggregated into the expense book**
- Place photos render as a **fixed 16:9 rounded thumbnail on the right** of each itinerary card
- Map never re-inits a live container (`LoadedMap` WeakMap registry) — adding coordinates keeps the map alive
- **Animated countdown**: a runner sprints towards Mt. Fuji, getting closer (and faster) as the start date nears
- Single-page **dashboard**: hero, countdown scene, 4 KPI tiles, today/up-next, spend by category
  (every category in the system, even ones with no spending yet), estimate-vs-actual, member paid/share board, recent expenses
- Smart scheduling recalc, overlap warning, drag-drop reorder in edit mode
- Timezone correct BKK/TYO/Trip
- Map with numbered day-coloured markers + polyline, CARTO→OSM→Esri tile fallback, dark mode tile;
  **tapping an itinerary card always pans the map to that place's pin** (CARTO raster key embedded → no watermark)
- **Multi-currency trips**: Settings → "สกุลเงินที่ใช้ในทริป" adds each extra currency the trip spends in
  with its own rate to THB; totals, budgets, estimates and expense forms pick the rate up automatically
- Expense from itinerary, service/card fee, net preview
- Split equal/unequal/percent/shares/itemized, sum matches, remainder distributed
- Settlement minimal transactions, copy LINE, export PNG/PDF
- **Excel import/export for itinerary + expenses (templates, bilingual headers) — trip admins only**
- Import template CSV/XLSX/JSON with validation
- Dark/Light/Auto mode persisted; **colour themes** (v18) — `src/js/utils/themes.js` holds 13 presets
  (`sky` is the “Sky light” default: sky blue `#1f6bfb` → amber `#ffb02e`), each of which can be overridden by
  the per-user custom colours + vividness slider. Everything else in the app reads the active theme through
  `src/js/utils/brand.js` (`brandPalette()`, `memberColorAt()`, `dayHues()`, `confettiColors()`), so the map
  pins, avatars, charts and exports follow the palette. Saved under `fuji_color_theme`.
  `#64a1da`, amber `#f0ae52`, sage mist `#abc1bf`, steel `#639cb5`, slate ink `#374656` on airy
  `#f5f8fc` surfaces (v17 repaint; the v16 blue/yellow “True tone” values are gone). The old ชุดสี
  picker (12 themes + gradients, per-trip colours) no longer exists, so every screen shares one look
- Security rules block cross-trip access
- No PWA elements
- **Prep checklists** (packing + to-do, ready-made templates, per-item assignee, shared progress)
- **Ideas board** — anyone suggests a place, everyone votes, winners are added to the day plan in one tap
- **Booking tracker** — flights / hotels / trains / restaurants / cars with confirmation codes, seats,
  cost, “next booking” countdown, copy-code button and `.ics` export
- **Weather at a glance** — Open-Meteo forecast chips on the dashboard and on each itinerary day header
  (best-effort: hidden when the trip is out of the forecast window or the network is offline)
- **Route optimiser** — “จัดลำดับเส้นทาง” reorders a day's places (nearest-neighbour, timed stops keep
  their slot), previews *before → after km* and saves real distance
- **Calendar export** — itinerary, bookings or the whole trip as an RFC-5545 `.ics` file
- GitHub Pages deployable
- Animated, mobile-first UI: bottom nav, FAB, scroll reveal, confetti, count-up KPIs
- **One login screen only** (v9): Google sign-in or email/password — the old username + PIN screen is gone.
  Legacy local sessions (`fuji_member_session`) still restore so nobody is locked out.
- Member login works with **and** without Cloud Functions: Google/email account + invite code + admin approval (free plan)
- Trip admins can approve join requests, add members by email, and rotate the invite code
- If the Firestore rules are not published yet, the app explains it step by step (copy-rules button,
  console deep link, ready-made message for the admin) instead of a raw `Missing or insufficient permissions`
- Settings > **ตรวจสอบระบบ** runs 9 probes and prints exactly which deploy step is missing
- **Every expense amount shows its baht value** (v9): a `≈ ฿…` line next to the trip-currency figure on
  the dashboard KPIs, category breakdown, member board, estimate-vs-actual, recent expenses and every
  expense card / summary strip (hidden for THB trips, or when no exchange rate is set)
- **Editable expense groups** (v9): add / rename (TH+EN) / re-icon / re-colour / delete the trip's own
  groups in `trips/{tripId}/categories`; they flow into the expense form, filters, itinerary estimates
  and dashboard stats. Built-in groups can be edited but never deleted
- **Clear-bill receipts** (v9): per person รับ / หัก / คงเหลือ with a cash-vs-card breakdown, an
  overview table, and PNG export per person **and** for the whole table
- **Reliable PNG/PDF export** (v9): the receipt is captured in a flat monochrome palette
  (`.export-flat`) with a canvas colour resolver, so `color-mix()` can never break the capture again

### v5 fixes

- **Member accounts work without Cloud Functions**: PINs are hashed in the browser
  (PBKDF2-SHA256, 100k iterations) and published to `publicMemberLogins/{username}`; adding a
  member no longer shows “Cloud Functions ไม่พร้อม”, and members sign in with username + PIN
  using `src/js/auth/memberAuth.js` (30-day local session). The Cloud Function is tried first and
  only mirrored silently, so deploying it later upgrades members to real Firebase Auth sessions.
- **PNG/PDF export**: `src/js/utils/colors.js` rewrites `color-mix()`/`oklch()` into `rgb()/rgba()`
  around the html2canvas capture (`sanitizeColorsForExport`) and restores the DOM afterwards —
  fixes *“Attempting to parse an unsupported color function 'color'”*.
- **No dashboard icon flicker**: the live clock ticks every 30 s and only updates text nodes
  (`[data-live-label]`); the clock icon is static and the Lucide observer only reacts to icons that
  are actually added.
- **Animated page scenes** (`src/js/components/scenes.js`): every menu (itinerary, expenses,
  settlement, members, documents, import, settings, trips, map) gets a light CSS illustration in the
  same spirit as the Fuji countdown.
- **Map layers**: street / satellite (Esri World Imagery + place labels) / terrain, remembered in
  `fuji_map_layer`; every place has a Google Maps button and inline “open in maps” link
  (`maps/dir/?api=1&destination=lat,lng` for navigation).
- **Post-it notes on the itinerary**: `src/js/notes/index.js` + `trips/{tripId}/notes` — 6 paper
  colours, pin, edit/delete, stored in Firestore.
- **Mobile sub-menus**: `.btn-row` becomes a 2-column grid and chip rows wrap on ≤640 px screens, so
  nothing scrolls off-screen.

### v9 changes

- **One login screen**: the username + PIN card and its Members-page fields were removed; sign-in is
  Google or email/password only, followed by the invite code + admin approval flow.
- **Always show THB**: `toThbMinor()` / `formatThbLabel()` / `effectiveThbRate()` in
  `src/js/utils/currency.js` power a `≈ ฿…` line (`.thb-equiv`) everywhere an amount is shown —
  dashboard KPIs (`#kpi-total-thb`, `#kpi-balance-thb`), category totals, member board,
  estimate-vs-actual, averages, recent expenses, the expenses summary strip and every expense card.
  Blank on THB trips, hidden when the trip has no rate (rate ≤ 0).
- **User-editable expense groups** (`src/js/categories/index.js`): stored in
  `trips/{tripId}/categories/{id}` = `{th,en,icon,color,custom:true,order,…}`; the registry in
  `src/js/utils/categories.js` merges them with the built-ins for the expense form, expense filters,
  itinerary estimate select, dashboard stats and Settings, and `normalizeCategory()` resolves them by
  id, Thai or English label so imports keep working. Built-in groups can be edited but not deleted.
- **Settlement detail** (`buildSettlementStatements()` in `src/js/utils/settlement.js`): one receipt per
  member with รับ (paid, split by cash / card / transfer), หัก (their share, with who paid) and คงเหลือ,
  estimated rows badged, plus an overview table and PNG export per person and for the overview.
- **PNG export fix**: `makeCanvasColorResolver()` / `rewriteColorFunctions()` in
  `src/js/utils/colors.js` + `.export-flat` (monochrome receipt palette) — exports no longer fail with
  *“เบราว์เซอร์ยังไม่รองรับเฉดสีบางแบบ”*.
- Tests: `tests/unit/thb.test.js`, `tests/unit/categories.test.js`, `tests/unit/statement.test.js`
  (now 13 + 1 skipped) and three new smoke blocks (THB everywhere, group CRUD, receipts + exports).

### v16 changes — “one app for the whole trip”

The reference product for this round was [Wanderlog](https://wanderlog.com/) (it could not be fetched
from the build sandbox, so the comparison uses its publicly known feature set). Ground already covered
here: collaborative itinerary, day planner with reordering, place photos + map, expense splitting,
document storage, Excel import/export. What was still missing became this release:

| Wanderlog capability | What was added here |
| --- | --- |
| Packing / to-do checklists | `/trip/:id/prep` — `trips/{id}/checklists`, 6 ready-made templates (packing tropical/cold/city/camp, before-you-go, documents, safety), per-item assignee, live progress ring |
| “Places to visit” ideas + voting | `/trip/:id/ideas` — `trips/{id}/ideas`, votes, statuses, trending sort, budget estimate, **“add to plan”** sheet that writes a real itinerary item |
| Reservation / booking tracking | `/trip/:id/bookings` — `trips/{id}/reservations`, 7 booking types, confirmation code + copy button, seat, cost, check-in/out, “next booking” countdown, warnings for missing details |
| Calendar export | `.ics` (RFC 5545, with folding + escaping) for the itinerary, the bookings or everything, on the Export page and on the bookings page |
| Weather while planning | Open-Meteo forecast chips (3 h cache, never throws) on the dashboard and per itinerary day |
| Route optimisation | Nearest-neighbour day reordering with a before/after km preview and a Google Maps deep link; timed stops never move |
| Trip-tools home widgets | Dashboard `#dash-tools`: prep progress, weather strip, next bookings, top-voted ideas |

Design-system notes:

- **Colour themes removed** (v16 decision, reversed again in v18). `--primary-raw #1d4ed8`, `--grad-2 #3b82f6`, `--brand-yellow-raw #ffc81e`,
  `--brand-ink-raw #17203a`; every shade is derived with `color-mix()` so light **and** dark mode stay
  readable from one palette. `data-color` and `fuji_color_theme` are actively cleared on boot, and the
  Appearance sheet now only offers Light / Dark / Auto (`.mode-option`).
- Yellow is an **accent duo** partner: it never carries white body text (`--on-accent #2b2100`), and
  readable yellow-family text uses `--brand-yellow-ink`.
- Legacy colour debt was re-mapped as well: member colour defaults, the category colour picker, day
  hues, map fallbacks, confetti and the image-cropper guides all use the brand family now.
- Firestore rules for the three new collections follow the existing model: every member can read and
  create/update; only an admin (or the author) can delete.

### v19 changes — the five planner requests + “Vivid & Clear”

ของที่เจ้าของแจ้งมา 5 ข้อ (ครบทุกข้อ):

1. **ลากสลับตำแหน่งได้เฉพาะโหมดแก้ไข** — the plan only creates drag handles while edit mode is on and destroys
   every instance on repaint / route change (`destroySortables()` inside `loadItems()`), so a read-only plan can
   never be reordered. In “ดูทั้งหมด” every day is its own drag list (`data-day-group` + `reorderItinerary(tripId, day, …)`),
   so a drag can no longer move a place to another date.
2. **แดชบอร์ดมีส่วนของทีม** — a new `#team-board` card shows each sub-group's **ค่าใช้จ่ายต่อคน** and **รวมทีม**,
   the ▲/▼ delta against the trip average, and how many plan places that team goes to.
3. **ค่าใช้จ่าย: “เฉลี่ยต่อกลุ่ม → แต่ละกลุ่มเฉลี่ยต่อคน”** — the KPI tile headlines the **per-group** average with the
   per-person figure underneath, and `#exp-group-avg` prints one card per team (own total, own per-person number,
   how many places it visits) plus “ทั้งทริป” as the comparison base. **การ์ดสรุป 5 ใบอยู่ในแถวเดียวทุกขนาดจอ**
   (`.kpi-strip` is a 5-column grid with a compact mobile block — it never wraps to a second row).
4. **หน้าแผนการเดินทาง**:
   - **“รายละเอียดสถานที่” ถูกถอดออก** — the map-popup / card-menu Web+Wikipedia look-up is gone from the UI
     (`src/js/utils/placeDetails.js` stays on disk, dormant, for anyone who wants it back behind an option).
   - **เลือกกลุ่ม/ทีมที่ไปในแต่ละสถานที่** — the place form has a team picker (`#it-group-tiles`, “ทุกทีม” = the
     default for a place nobody has classified yet), the plan cards show the chips, and the dashboard /
     expenses analysis counts the places per team (`placesForGroup()` in `src/js/utils/groups.js`, unit-tested).
   - **หมวดหมู่ระบุที่เดียว** — the second “expense group” picker + its lock button are gone: one category in the
     place form drives both the place and the expense group it bills into (`#it-category-group` shows the derived
     group live).
   - **ค่าใช้จ่ายที่ผูกอยู่แก้ในเมนูเดียวกัน** — the plan card's “แก้ไข/ผูกค่าใช้จ่าย” opens an in-page bottom sheet
     that renders the **same expense form the ค่าใช้จ่าย page uses** (same four sections, same split/payer/receipt
     widgets), writes to the same expense document, and syncs the place's estimate + `expenseId` back
     (`syncPlanEstimateFromExpense()`); the linked expense can still be opened as a full page from the sheet.
     Editing an amount no longer collides with a stale hand-made split: a prefilled split is re-fitted
     proportionally until the user touches a row.
5. **ดึงทีมไปวิเคราะห์ต่อ** — the per-place team pick feeds the team board (places per team) and the per-group
   average strip; the per-group *money* stays allocation-based (every baht counted exactly once, straight from the
   expense `allocations`).

Palette (v18 “Bright”, pushed to fully saturated status colours):

- `src/css/tokens.css`: success `#00a86b`, warning `#ef7d00`, danger `#ef2b3d`, info `#0d8ce0`, a brand-tinted
  canvas `#eaf2ff` so white cards separate, and deeper ink (`--text #182437`, `--text-strong #0b1626`);
  `src/css/refresh.css` makes selected chips/tabs and status badges saturated instead of tinted.

Fixes found while shipping the above:

- **หน้าค่าใช้จ่ายอ่าน “ทีม” ผิดตำแหน่ง** — the `Promise.all` feeding `renderExpenses()` listed expenses before
  groups while the destructuring read position 4 as “groups”, so the per-team strip received expense documents
  (8 empty cards) and the KPI never saw a team. The order now matches the destructuring.
- **ลบทริปไม่ลบทีม** — `TRIP_SUBCOLLECTIONS` (`src/js/trips/index.js`) was missing `memberGroups`, leaving orphan
  team documents behind after a trip delete.
- **แก้ยอดค่าใช้จ่ายที่ผูกกับแผนแล้วบันทึกไม่ได้** (“ยอดแบ่งไม่ตรง”) — a prefilled split that is really equal is
  now recognised as an equal split, and until the user types, the entered shares are re-fitted proportionally when
  the total changes.

### v18 changes — renamed app, themes back, swipeable receipts

Naming / shell:

- **“Fuji Planner” → “Trip Manager by TonSkywalker”** (`src/js/utils/buildInfo.js` is the single source:
  `APP_NAME`, `APP_AUTHOR`, `APP_NAME_BY`, `APP_TITLE`). The header wordmark keeps `by TonSkywalker` small,
  the sign-in page, ICS calendar name, PNG receipt footer, diagnostics report and `<title>` all use it, and the
  browser tab gets a themed icon: `public/favicon.svg` (+ generated `favicon-32/192/512.png`,
  `apple-touch-icon.png`, `tools/make-favicon.mjs` regenerates them without ImageMagick).
- **Always-visible footer** (`#app-footer` in `index.html`): version, last-updated date, the live palette name
  and the copyright line. `paintAppFooter()` fills it from `buildInfo.js` after boot, on language change and on
  every palette change — so the numbers can never drift from the code.
- Menu tidied: the desktop nav, the mobile “เพิ่มเติม” page and the itinerary header no longer offer
  ชวนไปที่นี่ / การจอง / เตรียมตัว / ปฏิทินทริป (the pages and routes still exist and are reachable from
  where they are used). **Settings is reachable in exactly one way: tapping the profile avatar.**

Colour themes (the v17 “no themes” decision is reversed — the muted single palette read as dull):

- `src/js/utils/themes.js` — 13 presets (Sky light, LINE, Facebook, Instagram, WhatsApp, Kakao, Zapier orange,
  sakura, matcha, ocean, sunset, lavender, mono) + a `custom` theme with its own primary/accent/ink colours and a
  **vividness slider**; stored per device under `fuji_color_theme`. Themes emit **raw hex values**
  (`--primary-raw`, `--grad-1/2`, `--brand-*-raw`, `--page-bg`) instead of driving `color-mix()` percentages from
  custom properties, because Safari does not invalidate those declarations.
- The picker lives in Settings → Appearance (swatch grid + preview + reset) and in the avatar sheet; the map
  tiles, day hues, member avatars, category swatches and confetti all follow it via `src/js/utils/brand.js`.

เคลียร์บิล:

- **Per-person receipts are a Tinder-style deck** now: one card per person (headline balance, THB equivalent,
  who paid what, top items, flag count). Drag or use ← → to switch people, **tap a card for that person’s full
  receipt** in a sheet, and the person strip above the deck jumps straight to anybody. The long list is still one
  tap away (“แบบรายการยาว”), printing/export still render every receipt (`ensureExportTarget()` covers big groups).
  The pure deck maths is in `src/js/utils/deck.js` and unit-tested.

Itinerary:

- Tapping a place card always moves the map to that pin (and dims the others); a place **without** coordinates
  now frames that day instead of doing nothing (`focusItineraryItem()` + `setItemFocus()` in `src/js/maps/index.js`).
- **Travel legs** between consecutive places show the drive from the previous item’s `travelToNextMinutes`,
  the haversine distance, the expected arrival and a warning when the next start time does not fit.
- **One merged category list** for place categories and expense groups (`categoryChoices()` in
  `src/js/utils/categories.js`): picking a place category decides which expense group its estimate bills into.
  (v19 removed the second picker + lock button completely — one category, one place.)
- Optional **“รายละเอียดสถานที่เพิ่มเติม”** on cards, in the item menu and inside map popups: key-less
  OpenStreetMap (Overpass) + Wikipedia REST lookup (`src/js/utils/placeDetails.js`) for opening hours, phone,
  website, address, a short blurb and the maps links. Cached per session, 6.5 s timeout, silently skipped offline.
  — **removed from the UI in v19** (the module stays on disk, dormant).

Dashboard + misc:

- An animated **Mt-Fuji buddy** (`src/js/components/mascot.js`) lives next to the countdown: fluffy, blinking,
  bobbing, with six moods read from the trip (over budget → worried, unsettled bills → wallet-watch, trip about
  to start → cheering, late night → sleepy) and a wiggle + encouragement when tapped.
- ค่าใช้จ่าย: the flat “เรียงรายการ” list now also shows the trip total, like the “แยกตามวัน” view does.
- **ไอเดียสถานที่ saving was denied by the rules** (“Missing or insufficient permissions”): `ideas`,
  `checklists` and `reservations` no longer require `isTripMember()` for writes (same contract as
  notes/documents/cards, delete stays author-or-admin), `createdBy` is always resolved from the live auth session,
  and a denied write opens the rules-help sheet instead of a bare toast.

### v17 changes — “Sky light” repaint + the last Wanderlog gaps

Design system (mobile **and** desktop share it):

- **No colour themes at all** (reversed in v18 — see above). `src/css/tokens.css` was the single palette: sky blue `#2f6fe4` →
  `#64a1da`, amber `#f0ae52`, sage mist `#abc1bf`, steel `#639cb5`, slate ink `#374656` on airy
  `#f5f8fc` surfaces; dark mode is ink `#0d0f14`. `initTheme()` keeps clearing `data-color` and
  `fuji_color_theme`, and the Appearance sheet only offers Light / Dark / Auto.
- **`src/css/refresh.css`** — a new layer loaded after `components.css` that restyles the shell
  (header, nav, FAB, cards, sheets, toasts) and defines the new page components.
- **`src/js/utils/brand.js`** is the only place brand colour exists in JS; every module imports from it
  (member colours, category swatches, day hues, confetti, canvas/export fallbacks).
- `docs/preview/index.html` is the public before/after page with v17 screenshots.

Feature parity with the Wanderlog list (2026 review):

| Wanderlog capability | v17 implementation |
| --- | --- |
| Inspiration guides you can add from in one tap | `#/trip/:id/explore` — `utils/explore.js` ships a curated library (13 cities / 81 places) with category filters, free-text search, “near your plan” recommendations and one-tap **add to plan / save as idea** |
| Month calendar of the whole trip | `#/trip/:id/calendar` — `utils/calendarView.js` builds a 6×7 grid, highlights trip days + today, shows per-day pills, day detail, print/PDF (`?print=1`) and “add a stop on this day” |
| Invite & share | `openShareSheet()` — invite link + readable code (`ABC-123`), LINE/WhatsApp/Telegram, copy trip summary, copy day-by-day plan, native share, print |
| Import reservations from e-mail | `openBookingImport()` on the Bookings page — `utils/bookingImport.js` parses Thai/English confirmations (dates incl. Buddhist years, times, flight numbers, PNR, airports, price) and shows a confidence score before saving a real reservation |
| Offline access | `#offline-strip-wrap` strip with online/offline + Firestore-cache state and a retry button (Firestore persistence stays on) |
| Unlimited attachments | documents + receipt uploads already existed |

Housekeeping:

- Desktop nav now carries 13 entries (adds **ชวนไปที่นี่** and **ปฏิทิน**); the Settings “About” card
  shows the version, palette and **last-updated date**.
- Tests: `tests/node-runner.mjs` runs **118 checks** (including unassigned-estimate payer validation) and
  `tests/smoke/run.mjs` exercises the live UI flows, including dashboard layout sync, default basemaps,
  compact expenses, payer-TBD estimates, and the existing guide/calendar/share/import features.

## Tests

```
# Pure logic suites (no browser, no network):
node tests/node-runner.mjs          # settlement, split, currency, THB, groups, statements, countdown,
                                    # scheduling, Excel, colors, invite codes, diagnostics,
                                    # + v16: prep checklists, ideas, reservations, weather, route, .ics
                                    # + v17: explore guides, booking import, calendar grid, share, build info
                                    # (tests/cdn-loader.mjs maps the CDN dayjs/xlsx imports to node_modules)

# Browser suites:
open tests/runner.html              # same suites + scheduling (needs CDN access)

# Full app smoke test: real DOM (jsdom), stubbed Firebase, every route + CRUD flow
npm install --no-save jsdom dayjs xlsx
node tests/smoke/run.mjs

# Real Chromium checks (PNG export + phone layout)
npm install --no-save puppeteer-core @sparticuz/chromium tailwindcss@3 html2canvas jspdf dayjs
node tests/browser/export-check.mjs     # export pipeline renders the real PNGs
node tests/browser/mobile-check.mjs     # iPhone 16 Pro Max / 16 Pro / 16 / 14 Pro Max / SE + desktop
MOBILE_MODE=dark node tests/browser/mobile-check.mjs   # same screens in dark mode (own screenshot folder)
```

The Chromium runs need the browser's shared libraries; when `@sparticuz/chromium` is used on a
minimal image, unpack `node_modules/@sparticuz/chromium/bin/al2023.tar.br` and export
`LD_LIBRARY_PATH=/tmp/al2023/lib` (the script passes the same path to the browser process).

`tests/browser/mobile-check.mjs` renders every route (and a few overlays) at phone sizes and
fails when a screen is wider than the phone — on mobile that makes the browser zoom the whole
page out, which is what "หน้าจอแสดงผลไม่สมบูรณ์" looks like — **when any element sticks out of the
viewport** (the “ตกขอบด้านขวา” report), when a toolbar grows into several rows, or when a long
name/email spills out of its card. It also walks the expense form top → middle → bottom to prove
the sticky save bar stays on screen (page **and** popup). Screenshots land in
`tests/browser/out/mobile/` so the result can be eyeballed.

`tools/preview/ux-shots.mjs` regenerates the pictures used by `docs/preview/index.html`
(v22 before/after + the v23 comfortable-vs-compact pair). It renders the real app at iPhone 16 Pro
size; the “before” shot is the same page with the phone-layout fix disabled through injected CSS:
`node tools/preview/ux-shots.mjs`.

`tests/smoke/` copies `src/js` into `tests/smoke/.build/` and rewrites only the CDN import
specifiers (Firebase → in-memory stub, dayjs/xlsx → npm packages, Leaflet/Sortable → stubs),
so the real application code runs end-to-end: dashboard, countdown, map refresh, estimate →
expense sync, member/document/expense CRUD, Excel round-trip, permissions, trip deletion and the
v16 blocks (prep checklists, ideas + add-to-plan, bookings + `.ics`, shared dashboard ordering, and
route optimisation writing a new order through `reorderItinerary`), plus estimate payer-pending and
compact-expenses flows.

## Performance

- Lazy load Leaflet, html2canvas, jsPDF, SheetJS via dynamic import
- Image compression client-side before upload
- Pagination for expenses
- Unsubscribe listeners on route change
- Debounce search, throttle map

## Seed Data

See `public/templates/` and create sample trip via UI or use Firestore import.

## License

MIT
