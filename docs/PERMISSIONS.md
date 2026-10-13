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
| `super_admin` | `users/{uid}.role == 'super_admin'` (Firestore console only) | ผู้ดูแลระบบสูงสุด |
| `trip_admin` | `trips/{tripId}.createdBy == uid` **or** `members/{uid}.role == 'trip_admin'` | ผู้ดูแลทริป (เจ้าของทริป หรือถูกตั้งเป็นแอดมิน) |
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
| `canManageMembers` | จัดการสมาชิก | member list, join requests, member PINs — a **co-admin for people only** |

Defaults written by `buildMemberDoc()`: `canEditItinerary: true`, `canEditExpense: true`,
`canManageMembers: false` (admins are always `true`).

**Backward compatibility (important):** a member document written *before* v30 has no
`permissions` map. The rules treat a **missing switch as allowed** (`permissionOn()` only blocks
an explicit `false`), so publishing the new rules cannot lock out existing members on day one.
An explicit `false` — or the `viewer` role — blocks the write.

## 3) Admin vs member vs viewer — the matrix

| Area | trip admin | member (default) | member with the switch off | viewer |
| --- | --- | --- | --- | --- |
| Trip details, budget, theme (`trips/{id}` write) | ✅ | ⚠️ profile-ish fields only — cannot change `createdBy`, `memberUids`, `inviteCode`, `inviteEnabled` | same as member | same as member |
| Invite code / open-closed invites | ✅ rotate & close | ❌ (v30 fix — was open to every member before) | ❌ | ❌ |
| Settings (`settings/*`), Excel import/export (`imports/*`) | ✅ | ❌ (read only) | ❌ | ❌ |
| Members: add / approve / edit roles & switches | ✅ | ❌ (may edit **own profile only**, never `role` / `permissions` / `status`) | ❌ | ❌ |
| Members: with `canManageMembers` (co-admin) | ✅ | ✅ people only — add/edit profiles, approve join requests; **role + the three switches stay trip-admin-only** (`sameRoleAndPermissions`), another admin's doc is protected (`protectsAdminDoc`) | ✅ people only | ❌ |
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
| 5 | any member could change `memberUids` / `createdBy` | frozen for non-admins |
| 6 | a member could grant themselves `permissions` / a new `role` | self-update is **profile-only**; role/permissions/status frozen |
| 7 | `canManageMembers` didn't exist (all-or-nothing admin) | co-admins (people only — `sameRoleAndPermissions()` stops them granting rights to themselves or others), plus `protectsAdminDoc()` so only a real admin touches an admin doc |
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

## 6) Known risks / remaining exposure

These are deliberate, small, and each one has a note in `firestore.rules`:

1. **`publicProfiles/{uid}`** — any signed-in account may `list` name/email/photo (needed to
   search the person you want to invite). No trip data, no permissions, no tokens there.
2. **`publicMemberLogins/{username}`** — `get` is public (the login page resolves
   username → trip before the PIN is checked). `list` is forbidden so usernames cannot be
   enumerated; a *known* username reveals which trip/member it belongs to. Use the
   `loginWithUsernamePin` Cloud Function (and delete the entry) if that matters.
3. **`memberSecrets/{tripId}_{memberId}`** — `get` is open to signed-in accounts for the legacy
   PIN login path; `list` is forbidden and writes require `canManageMembers`. Same mitigation as
   above (the callable verifies the PIN server-side).
4. **Notification spam** — any member can create feed items (with their own uid on them). Size
   caps + hourly pruning + admin delete keep it bounded; the author is visible to everybody.
5. **Client clock** — the daily summary decides “today” from the trip timezone on the client and
   on the server (`dailyExpenseSummary`); the document id `daily-YYYY-MM-DD` makes the write
   idempotent even when several devices race.

## 7) How to verify

```bash
# pure logic + the rules text itself (no emulator needed)
node tests/node-runner.mjs            # 167 unit tests, incl. tests/unit/permissions.test.js

# the whole app in jsdom, incl. the v30 block:
#   🔔 + badge, expense → notification, filters, mark read/all, daily summary,
#   settings tab, Web-Push enable/disable, member/viewer gates, rules text
npm i --no-save jsdom dayjs xlsx && node tests/smoke/run.mjs

# the real rules, against the Firestore emulator (needs Java + firebase-tools)
firebase emulators:exec --only firestore "node tests/rules/firestore.test.js"
```

## 8) Deploy

```bash
firebase deploy --only firestore:rules            # the enforcement — do this first
firebase deploy --only functions                  # pushTripNotification + dailyExpenseSummary
firebase deploy --only hosting                    # the client (bell, settings tab, SW)
```

Order matters: the client writes `trips/{id}/notifications` documents and device tokens, so
publishing the rules first (they allow old member docs) keeps everything working while the
Cloud Functions and the hosting bundle catch up. Web Push additionally needs the VAPID key —
see `docs/DEPLOY.md`.
