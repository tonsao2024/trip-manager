# สิทธิ์ผู้ใช้ — Permissions audit (v30, 13 Oct 2026)

How a **normal user (member)** differs from an **admin (trip admin / super admin)**, what the
UI hides, and — since v30 — what **Firestore Rules actually enforce**. This document is the
answer to the owner's question *“ตรวจสอบสิทธิ์ User แต่ละคนว่ามีการออกแบบเรื่องสิทธิต่างจากแอดมินอย่างไร”*
and the reference for `firestore.rules` (the rules point here for the known risks).

Scope of the audit: `firestore.rules`, `src/js/utils/permissions.js`, `src/js/members/*`,
the UI gate sites in `src/js/app.js`, and the Cloud Functions in `functions/src/index.js`.

---

## 1) Roles

| Role | Where it comes from | ไทย |
| --- | --- | --- |
| `super_admin` | `users/{uid}.role == 'super_admin'` (initial grant in Firebase Console; only an existing super admin may change it) | ผู้ดูแลระบบสูงสุด |
| `trip_admin` | `trips/{tripId}.createdBy == uid` **or** an active `members/{uid}.role == 'trip_admin'` record | ผู้ดูแลทริป (เจ้าของทริป หรือถูกตั้งเป็นแอดมิน) |
| `member` | everything else (default) | สมาชิกทั่วไป |
| `viewer` | `members/{uid}.role == 'viewer'` | ผู้ชม — อ่านอย่างเดียวทุกที่ |

The client resolves one shape for the whole UI (`src/js/utils/permissions.js`):

```js
{ uid, role, isSuperAdmin, isTripAdmin, isAdmin, permissions, member,
  canEditItinerary, canEditExpense, canManageMembers, isViewer, readOnly, can('…') }
```

`isAdmin` is `role === 'trip_admin' || 'super_admin'`; `viewer` is never an admin.
`resolvePermissions()` caches for 60 s per `trip:uid`; the header refresh button clears the cache.

## 2) The three switches (v30)

A member document carries a `permissions` map, edited in **สมาชิก → แก้ไขสมาชิก**
(`src/js/app.js`, member form → `#m-perm-itinerary`, `#m-perm-expense`, `#m-perm-members`):

| Switch | ไทย (บนฟอร์ม) | Opens |
| --- | --- | --- |
| `canEditItinerary` | แก้ไขแผนการเดินทาง | days, `itineraryItems`, sticky `notes` |
| `canEditExpense` | แก้ไขค่าใช้จ่าย | `expenses` (+ `lineItems`), `settlements` (+ `payments`), `categories`, `cards`, `exchangeRates`, `transfers` |
| `canManageMembers` | จัดการสมาชิก | member list, join requests, member PINs, and shared dashboard order/visibility |

Defaults written by `buildMemberDoc()`: `canEditItinerary: true`, `canEditExpense: true`,
`canManageMembers: false` (admins are always `true`).

**Backward compatibility (important):** a member document written *before* v30 has no
`permissions` map. A missing itinerary or expense switch still allows the corresponding edits. An explicit
`false` — or the `viewer` role — blocks the write. For non-admins, `canManageMembers`
must be explicitly `true`.

## 3) Admin vs member vs viewer — the matrix

| Area | trip admin | member (default) | member with the switch off | viewer |
| --- | --- | --- | --- | --- |
| Trip details, dates, budget, currency, status, cover (`trips/{id}`) | ✅ | ❌ | ❌ | ❌ |
| Shared dashboard layout (`dashboardLayout`, `dashboardHidden`) | ✅ | ✅ only if `canManageMembers` | ❌ if `canManageMembers = false` | read only |
| Default map layer (`defaultMapLayer`) | ✅ | ✅ if `canEditItinerary` | ❌ if `canEditItinerary = false` | ❌ |
| Trip payment cards (`cards`) | ✅ | ✅ if `canEditExpense` | ❌ if `canEditExpense = false` | ❌ |
| Invite code / open-closed invites | ✅ rotate & close | ❌ (v30 fix — was open to every member before) | ❌ | ❌ |
| Settings (`settings/*`), Excel import/export (`imports/*`) | ✅ | ❌ (read only) | ❌ | ❌ |
| Members: add / approve / edit roles & switches | ✅ | ❌ (may edit **own profile only**, never `role` / `permissions` / `status`) | ❌ | ❌ |
| Members: with `canManageMembers` (co-admin) | ✅ | ✅ people only — add/remove ordinary members or viewers, edit profiles, approve join requests; membership-list changes are paired with member-document writes. Cannot create/promote a trip admin, grant `canManageMembers`, change role/permissions/status, or edit another admin's doc | ✅ people only | ❌ |
| Itinerary, days, sticky notes | ✅ | ✅ | ❌ if `canEditItinerary = false` | ❌ |
| Expenses, groups, cards, FX rates, transfers, settlement | ✅ | ✅ | ❌ if `canEditExpense = false` | ❌ |
| Documents, checklists, ideas, teams, reservations, comments | ✅ | ✅ | ✅ (content, not money/plan switches) | ❌ |
| Activity log (read/append) | ✅ | ✅ | ✅ | read only |
| Activity log (edit/delete), notification delete | ✅ | ❌ | ❌ | ❌ |
| Delete the trip | ✅ | ❌ (creator only) | ❌ | ❌ |
| Join requests: approve/reject | ✅ | ❌ | ❌ | ❌ |
| Notifications (bell): read | ✅ | ✅ | ✅ | ✅ |
| Notifications: create (expense ping, daily summary) | ✅ | ✅ — `createdBy` must be the caller | ✅ | ✅ (rule allows; the UI will not offer it) |
| Notifications: mark read | ✅ | ✅ — own `readBy` key only | ✅ | ✅ |
| Web Push tokens/prefs (`users/{uid}/push*`) | own account only | own account only | own account only | own account only |

Legend: ✅ allowed, ❌ blocked (UI **and** rules), ⚠️ allowed with field-level restrictions.

## 4) What v30 changed in `firestore.rules`

Before v30 the published rules let **every member** write `itineraryItems`, `expenses`
(+`lineItems`), `days`, `notes`, `documents`, `categories`, `cards` and `exchangeRates`
— the “แก้ไขแผนการเดินทาง / แก้ไขค่าใช้จ่าย / viewer” switches existed in the UI only, and
`hasPermission()` had been written but was never used. Anyone in the trip could also rotate
`inviteCode`, and a member could rewrite `permissions` on their own member document.

| # | Finding (pre-v30 design) | v30 |
| --- | --- | --- |
| 1 | `viewer` could edit everything like a member | reader everywhere (`canWriteContent` false) |
| 2 | “แก้ไขค่าใช้จ่าย” = UI only | `expenses/lineItems/settlements/payments/categories/cards/exchangeRates/transfers` → `canEditExpense(tripId)` |
| 3 | “แก้ไขแผนการเดินทาง” = UI only | `days/itineraryItems/notes` → `canEditItinerary(tripId)` |
| 4 | any member could rotate the invite code / re-open invites | trip-admin only |
| 5 | any member could change `memberUids` / `createdBy` | `createdBy` remains frozen; only trip admins or member managers can change `memberUids`, and co-admin changes are limited to that field and paired with membership operations |
| 6 | a member could grant themselves `permissions` / a new `role` | self-update is **profile-only**; role/permissions/status frozen |
| 7 | `canManageMembers` didn't exist (all-or-nothing admin) | co-admins can manage ordinary members/viewers; they cannot create/promote admins, grant `canManageMembers`, change role/permissions/status, or touch an admin doc (`sameRoleAndPermissions()` + `protectsAdminDoc()`) |
| 8 | no trip-level notification feed existed | `trips/{id}/notifications` — member read/create, update only the caller's own `readBy` key, delete trip admin |
| 9 | no Web-Push device registry existed | `users/{uid}/pushTokens|pushPrefs` — owner only; the Cloud Function reads them with the Admin SDK |

## 5) The notification rules (v30)

* **Read:** any trip member (`isTripMember`).
* **Create:** any member, but `createdBy == request.auth.uid`, `type`/`title` are strings,
  `title ≤ 200` and `body ≤ 600` chars. This is what lets “บันทึกค่าใช้จ่าย” notify everybody.
* **Update:** only `readBy`, and only the caller's own key may be added/removed/changed:
  `affectedKeys().hasOnly(['readBy'])` + `addedKeys()/removedKeys()/changedKeys().hasOnly([uid])`.
  Nobody can mark somebody else's item read, and nobody can rewrite a message after the fact.
* **Delete:** trip admin. The hourly `dailyExpenseSummary` function prunes everything older than
  the newest 120 items (daily summaries are kept forever).
* **Push counters** (`pushSent`, `pushCount`, `pushSentAt`) are written by the Admin SDK only —
  the update rule above makes that explicit.

## 6) Current privacy boundaries / remaining exposure

The old v30 notes below describe the rules as they stood at that release. The current rules and
callables apply these tighter boundaries:

1. **`publicProfiles/{uid}`** — owner `get` only; client `list` is denied. Exact email search goes
   through `findMemberProfileByEmail`, which requires the caller to manage the specified trip and
   returns only `id`, display name, email, and photo URL.
2. **`publicMemberLogins/{username}`, `loginAccounts/{username}`, `memberSecrets/{tripId}_{memberId}`,
   and `userSecrets/{uid}`** — all client reads/writes are denied. Legacy PIN/step-up fields are
   migrated out of readable user/member profile docs before the new Rules are published. Callable
   Functions retain existing PBKDF2-SHA256 secrets (100,000 iterations, 16-byte salt) and bcrypt
   compatibility; PIN hashes never appear in callable responses.
3. **`publicTripInvites/{code}`** — authenticated users may `get` a known, enabled code, but may not
   list the collection or list trips by invite code. Only trip member managers maintain previews;
   Rules require the preview to match the trip's current code, name, and dates. The minimal preview
   contains only `tripId`, name, and start/end dates; the full trip is readable only after membership.
4. **Inactive/removed members** — a member document with `status: 'inactive'` no longer grants trip reads, even if a stale `memberUids` entry exists. Trip-list queries also check the member status; client deactivation/deletion updates the member record and trip UID list atomically.
5. **Shared trip fields** — non-admin writes to the trip document are limited to dashboard layout/visibility
   for delegated member managers, the default map layer when `canEditItinerary` is on, and payment cards
   when `canEditExpense` is on. All trip members read the same saved dashboard. Trip details, budgets,
   currency, status, cover, and invite settings are admin-only; `createdBy` is immutable through client
   writes. Delegated managers change `memberUids` through member operations.
6. **Notification spam** — any member can create feed items (with their own uid on them). Size
   caps + hourly pruning + admin delete keep it bounded; the author is visible to everybody.
7. **Client clock** — the daily summary decides “today” from the trip timezone on the client and
   on the server (`dailyExpenseSummary`); the document id `daily-YYYY-MM-DD` makes the write
   idempotent even when several devices race.

The callable-backed PIN, email-search, and legacy invite fallback features require Cloud Functions
on Blaze; Spark can continue with the visible Google sign-in and Firestore join-request flow. See
`docs/DEPLOY.md` before changing the deployed client or rules.

## 7) How to verify

```bash
npm test
npm run test:smoke
npm --prefix functions test       # PBKDF2/bcrypt PIN verification

# Real Firestore Rules (requires Java + Firebase CLI)
npx firebase-tools@13 emulators:exec --project demo-trip-manager-rules --only firestore "npm run test:rules"
```

The emulator suite exercises private member/user credential paths, legacy profile-field read denial,
trip isolation, enabled invite previews, profile privacy, self-role protection, and join-request permissions.

## 8) Deploy

Deployment is plan-dependent and must follow the rollout in [`docs/DEPLOY.md`](DEPLOY.md):

- Run the Admin SDK legacy PIN-field migration before publishing Rules, then publish `firestore.rules`
  and `firestore.indexes.json`; static Hosting/Pages is separate.
- Blaze: deploy the selected member-security callables and run the invite-preview backfill.
- Ask users to refresh after the new client/rules are live; old clients that directly handled PINs are
  intentionally incompatible with the server-only credential rules.

The in-app notification feed and GitHub Actions Web Push path do not require Cloud Functions.
