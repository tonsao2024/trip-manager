# Fuji Trip Planner & Group Expense Manager

Modern, production-ready trip planner with group expense splitting, smart scheduling, and settlement — built for GitHub Pages + Firebase.

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

trips/{tripId} { name, description, country, city, startDate, endDate, timezone, baseCurrency, coverImage, themeColor, status, memberUids[], createdAt, updatedBy }

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

## เปิดใช้ระบบล็อกอินสมาชิก (username + PIN)

การล็อกอินสมาชิกมี 2 โหมด และ **โหมดในเครื่องใช้ได้ทันทีโดยไม่ต้อง deploy อะไร**:

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
- Single-page **dashboard**: hero, countdown scene, 4 KPI tiles, today/up-next, spend by category,
  estimate-vs-actual, member paid/share board, recent expenses
- Smart scheduling recalc, overlap warning, drag-drop reorder in edit mode
- Timezone correct BKK/TYO/Trip
- Map with numbered day-coloured markers + polyline, CARTO→OSM→Esri tile fallback, dark mode tile
- Expense from itinerary, service/card fee, net preview
- Split equal/unequal/percent/shares/itemized, sum matches, remainder distributed
- Settlement minimal transactions, copy LINE, export PNG/PDF
- **Excel import/export for itinerary + expenses (templates, bilingual headers) — trip admins only**
- Import template CSV/XLSX/JSON with validation
- Dark/Light mode persisted, 12 themes + gradient themes
- Security rules block cross-trip access
- No PWA elements
- GitHub Pages deployable
- Animated, mobile-first UI: bottom nav, FAB, scroll reveal, confetti, count-up KPIs
- Member login works with **and** without Cloud Functions (local PIN auth fallback + Firestore-backed when deployed)
- Settings > **ตรวจสอบระบบ** runs 9 probes and prints exactly which deploy step is missing

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

## Tests

```
# Pure logic suites (no browser, no network):
node tests/node-runner.mjs          # settlement, split, currency, countdown, Excel helpers

# Browser suites:
open tests/runner.html              # same suites + scheduling (needs CDN access)

# Full app smoke test: real DOM (jsdom), stubbed Firebase, every route + CRUD flow
npm install --no-save jsdom dayjs xlsx
node tests/smoke/run.mjs
```

`tests/smoke/` copies `src/js` into `tests/smoke/.build/` and rewrites only the CDN import
specifiers (Firebase → in-memory stub, dayjs/xlsx → npm packages, Leaflet/Sortable → stubs),
so the real application code runs end-to-end: dashboard, countdown, map refresh, estimate →
expense sync, member/document/expense CRUD, Excel round-trip, permissions and trip deletion.

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
