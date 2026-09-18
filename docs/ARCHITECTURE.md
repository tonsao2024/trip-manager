# Architecture

## Overview
Fuji Trip Planner is a static SPA hosted on GitHub Pages, backed entirely by Firebase. No custom backend server. All sensitive operations go through Cloud Functions.

## Frontend
- **SPA Router**: Hash-based, lightweight, no library. Routes defined in `src/js/app.js` + `router.js`.
- **State**: Current user from Firebase Auth, current trip from localStorage + Firestore doc.
- **UI**: Tailwind CDN + custom tokens.css. Bento-grid for dashboard, card-based elsewhere. Lucide icons.
- **Lazy Loading**: Leaflet, html2canvas, jsPDF, SheetJS loaded via dynamic import only when needed.
- **Offline**: Firestore IndexedDB persistence enabled, but no PWA manifest/SW.

## Firebase Services
- **Auth**: Email/Password for admins, Custom Token for members (username+PIN verified server-side via bcrypt).
- **Firestore**: Trip-isolated collections under `trips/{tripId}/...`. Money in minor units. Indexes defined in `firestore.indexes.json`.
- **Storage**: Receipts, avatars, covers, place images, settlement proofs, segregated by trip.
- **Functions**: Region `asia-southeast1`, Node 20, 10 max instances. See `functions/src/index.js`.

## Security
- Rules check `memberUids` array and `members` subcollection.
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
2. Optimistic UI update via `recalculateSchedule` client-side.
3. Call `recalculateItinerarySchedule` function for server-side authoritative recalc + batch write.
4. Detect overlaps, show warning, keep version for conflict prevention.

## Settlement Flow
- `calculateNetBalances` sums paid - owed.
- `minimizeTransactions` matches largest debtor with largest creditor.
- Transactions stored, can be marked paid with proof.

## Performance
- Lighthouse target >=90 via lazy libs, image compression, pagination, unsub listeners, transform-only animations.
- No PWA cache, so fast first load critical: Tailwind CDN + minimal CSS, ES modules, no heavy bundler.
