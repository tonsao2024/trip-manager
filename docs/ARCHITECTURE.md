# Architecture

## Overview
Fuji Trip Planner is a static SPA hosted on GitHub Pages, backed entirely by Firebase. No custom backend server. All sensitive operations go through Cloud Functions.

## Frontend
- **SPA Router**: Hash-based, lightweight, no library. Routes defined in `src/js/app.js` + `router.js`.
- **State**: Current user from Firebase Auth, current trip from localStorage + Firestore doc.
- **UI**: Tailwind CDN + custom `tokens.css` (**v17 “Sky light”** — one fixed palette: sky blue
  `#2f6fe4` → `#64a1da`, amber `#f0ae52`, sage mist `#abc1bf`, steel `#639cb5`, slate ink `#374656`;
  every shade derived with `color-mix()`). `src/css/refresh.css` (loaded after `components.css`)
  restyles the shell and defines the new-page components. Bento-grid for the dashboard, card-based
  elsewhere. Lucide icons. Only Light / Dark / Auto is user-selectable — the old colour-theme (ชุดสี)
  presets and the per-trip colour were removed in v16, and `data-color` / `fuji_color_theme` are
  cleared on boot.
- **Brand colour in JS**: `src/js/utils/brand.js` is the single source (`BRAND`, `BRAND_PRIMARY`,
  `BRAND_GRADIENT*`, `MEMBER_COLORS`, `CATEGORY_COLOR_CHOICES`, `CONFETTI_COLORS`, `DAY_HUES`,
  `memberColorAt()`, `isKnownBrandColor()`). Nothing else hardcodes a brand hex.
- **Build identity**: `src/js/utils/buildInfo.js` holds the version, palette name and the
  “last updated” date rendered on the sign-in screen, the More page and the Settings “About” card
  (`<meta name="app-updated">` in `index.html` mirrors it; `tests/unit/buildInfo.test.js` guards drift).
- **Lazy Loading**: Leaflet, html2canvas, jsPDF, SheetJS loaded via dynamic import only when needed.
- **Feature modules**: `src/js/{prep,ideas,reservations,categories,…}` each own their Firestore
  collection + UI helpers; pure logic lives in `src/js/utils/` (`explore.js` place-guide library,
  `bookingImport.js` confirmation parser, `calendarView.js` month grid, `share.js` invite/summary
  builders, `scheduling.js`, `settlement.js`, `route.js`, `ics.js`, `weather.js`).
- **UI screenshots**: `docs/preview/index.html` contains the public before/after page and historical
  screenshots; it is documentation only and is not an interactive app build.
- **Offline**: Firestore IndexedDB persistence enabled. Since v30 there is a
  `manifest.webmanifest` and one service worker (`firebase-messaging-sw.js`) — they exist **for Web Push
  only** (FCM background messages + click routing); there is no offline app shell/cache.

## Firebase Services
- **Auth**: Email/Password for admins, Custom Token for members (username+PIN verified server-side via bcrypt).
- **Firestore**: Trip-isolated collections under `trips/{tripId}/...`. Money in minor units. Indexes defined in `firestore.indexes.json`.
- **Storage**: Receipts, avatars, covers, place images, settlement proofs, segregated by trip.
- **Functions**: Region `asia-southeast1`, Node 20, 10 max instances. See `functions/src/index.js`.

## Notifications (v30)
- **Feed**: `trips/{tripId}/notifications/{id}` (`type` = `expense|daily_summary|settlement|member|trip|test`,
  `date` in the trip timezone, `recipients[]`, `readBy{}`, `link`). Written by `src/js/notifications/index.js`
  (module `expenses/index.js` calls `notifyExpenseCreated` after every save) and by the Cloud Functions.
- **Daily summary**: one document per trip per trip-local day, id `daily-YYYY-MM-DD` — written by the first
  device that opens the trip after the summary hour (`ensureDailySummary`) **or** by the hourly
  `dailyExpenseSummary` function; both are idempotent, a day without spending stays quiet.
- **Web Push**: `src/js/notifications/push.js` registers `firebase-messaging-sw.js` (root, config passed as
  query params), stores the FCM token in `users/{uid}/pushTokens/{tokenId}` and mirrors the account switches
  to `users/{uid}/pushPrefs/current`. `pushTripNotification` (onDocumentCreated) sends data-only messages to
  every recipient's devices and drops dead tokens. VAPID key: Settings → การแจ้งเตือน or
  `fcmVapidKey` in `firebase.config.js`.
- **UI**: 🔔 in the header (`addHeaderControls`), the sheet (`openNotificationsSheet`), Settings →
  การแจ้งเตือน (`notificationSettingsCardsHtml` / `bindNotificationSettings`). See `docs/PERMISSIONS.md`
  for the notification + push security rules.

## Security
- Rules check `memberUids` array and `members` subcollection.
- Since v30 the member document's `permissions{}` map (`canEditItinerary`, `canEditExpense`,
  `canManageMembers`, or the read-only `viewer` role) is enforced by `firestore.rules` — the UI hides what
  the rules deny. Full audit + known risks: `docs/PERMISSIONS.md`.
- No client can read `loginAccounts`.
- Step-up PIN session stored server-side, expiry 10 min, checked before sensitive actions.
- Audit logs written via function, read only by trip admin / super admin.
- All money validation both client and server.

## Data Flow Example: Add Expense
1. User opens add expense form, selects payer, split method.
2. Client calculates net total preview.
3. On submit, if no step-up session, prompt PIN -> call `verifySensitiveActionPin`.
4. Call `addExpense` which writes to Firestore, validates allocation sum.
5. Optionally call `validateExpenseAllocations` function for server validation.
6. Real-time listeners on dashboard/settlement update via `onSnapshot`.

## Smart Scheduling Flow
1. User drags item or changes duration.
2. Optimistic UI update via `recalculateSchedule` client-side. A day that starts with an untimed
   stop is allowed (the chain simply keeps the times that are already stored instead of failing).
3. Call `recalculateItinerarySchedule` function for server-side authoritative recalc + batch write.
4. Detect overlaps, show warning, keep version for conflict prevention.

### Route optimiser (v16)
`src/js/utils/route.js` — `haversineKm()` / `coordOf()` normalise both `{lat,lng}` and `"lat,lng"`
strings; `optimizeDayOrder()` keeps timed stops (`startAt`) as anchors and re-orders the untimed
stops per day segment with a nearest-neighbour pass, returning the before/after km plus a
never-worse guarantee (it returns the original order when nothing improves). `logger → app.js`
previews the result and writes it through `reorderItinerary()`.

### Trip-tool modules (v16)
`src/js/prep`, `src/js/ideas`, `src/js/reservations` are thin Firestore CRUD layers; the pure logic
(templates, voting, warnings, `.ics`/`weather`/`route` maths) lives in `src/js/utils/*.js` so the
Node unit suites can import it without Firebase. `utils/weather.js` calls Open-Meteo (3 h cache,
never throws) and `utils/ics.js` writes RFC-5545 calendars (escaping + 75-octet folding).

## Settlement Flow
- `calculateNetBalances` sums paid - owed.
- `minimizeTransactions` matches largest debtor with largest creditor.
- Transactions stored, can be marked paid with proof.

## Performance
- Lighthouse target >=90 via lazy libs, image compression, pagination, unsub listeners, transform-only animations.
- No PWA cache, so fast first load critical: Tailwind CDN + minimal CSS, ES modules, no heavy bundler.
