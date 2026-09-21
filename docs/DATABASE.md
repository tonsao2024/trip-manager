# Database Schema

## Collections

### users/{uid}
```json
{
  "role": "super_admin",
  "displayName": "Admin",
  "email": "admin@example.com",
  "pinHash": "bcrypt hash for step-up",
  "lastStepUp": "timestamp",
  "stepUpExpiry": "ISO string"
}
```

### loginAccounts/{normalizedUsername}
```json
{
  "username": "alice",
  "originalUsername": "Alice",
  "pinHash": "$2a$10$...",
  "memberUid": "uid",
  "tripId": "trip123",
  "failedAttempts": 0,
  "disabled": false
}
```
**Never readable by client.**

### trips/{tripId}
```json
{
  "name": "Fuji 2027",
  "description": "...",
  "country": "Japan",
  "city": "Fujikawaguchiko",
  "startDate": "2027-11-10",
  "endDate": "2027-11-14",
  "timezone": "Asia/Tokyo",
  "baseCurrency": "JPY",
  "coverImage": "https://...",
  "themeColor": "#8b5cf6",
  "status": "active",
  "memberUids": ["uid1","uid2"],
  "budgetTotal": 1000000,
  "budgetPerPerson": 250000,
  "memberBudgets": { "uid1": 300000, "uid2": 250000 },
  "cards": [
    { "id": "c1", "name": "KBank Visa", "holderId": "uid1", "bank": "KBank", "last4": "4321" }
  ],
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp",
  "createdBy": "uid"
}
```

- `budgetTotal` / `budgetPerPerson` / `memberBudgets` / `budgetCurrency` (v13): budgets in **THB minor units (satang)**;
  `memberBudgets` maps memberId → that person's own budget, shown on the dashboard wallet.
- `cards` (v13): the managed credit-card list every member picks from in the expense form
  (add/edit/delete in Settings → cards), so card names can't be free-typed.

### trips/{tripId}/members/{memberId}
```json
{
  "uid": "uid",
  "displayName": "Alice",
  "username": "alice",
  "role": "trip_admin|member|viewer",
  "color": "#6366f1",
  "avatar": "emoji or url",
  "status": "active",
  "permissions": {
    "canEditItinerary": true,
    "canEditExpense": true,
    "canManageMembers": false
  },
  "order": 0
}
```

### trips/{tripId}/itineraryItems/{itemId}
```json
{
  "title": "Lake Kawaguchi",
  "description": "...",
  "date": "2027-11-11",
  "startAt": "Timestamp",
  "endAt": "Timestamp",
  "durationMinutes": 90,
  "travelToNextMinutes": 15,
  "order": 1,
  "category": "sightseeing",
  "address": "...",
  "coordinates": "35.4961,138.7688",
  "googleMapsUrl": "https://...",
  "imageUrl": "https://...",
  "notes": "...",
  "status": "planned|current|completed|skipped|cancelled",
  "expenseId": null,
  "stayCheckIn": "2027-11-10",
  "stayCheckOut": "2027-11-13",
  "estimateAmount": 45000,
  "estimateCurrency": "JPY",
  "estimateCategory": "hotel",
  "estimatePayerId": "",
  "estimatePayerPending": true,
  "estimateShareWith": ["uid1","uid2"],
  "estimateAutoAdd": true,
  "createdBy": "uid",
  "updatedBy": "uid",
  "version": 1
}
```

- `stayCheckIn` / `stayCheckOut` (v13): the item is a hotel stay spanning several nights.
  The plan view repeats it on every night ("กลับเข้าพัก" virtual cards, id `<itemId>@stay-<date>`,
  never persisted) and the ONE entered price is split per night (`splitStayMinor`).
- `estimateAmount` is in **major units** (converted with the trip currency's decimals).
- `estimatePayerPending` (v13): `true` → nobody fronts this estimate yet; the synced expense
  gets `payerId: null`, `payerPending: true` and stays out of every balance until a payer is
  assigned. `estimatePayerId: "__pending"` is the form-side alias for the same state.

### trips/{tripId}/expenses/{expenseId}
```json
{
  "title": "Train",
  "description": "...",
  "date": "2027-11-10",
  "category": "transport",
  "payerId": "uid | null",
  "payerPending": false,
  "allocations": [
    {"memberId": "uid1", "amountMinor": 5000},
    {"memberId": "uid2", "amountMinor": 5000}
  ],
  "subtotalMinor": 10000,
  "discountMinor": 0,
  "serviceMinor": 0,
  "taxMinor": 0,
  "cardFeeMinor": 0,
  "cardFeePercent": 3,
  "netTotalMinor": 10300,
  "currency": "JPY",
  "exchangeRate": 1,
  "baseCurrency": "JPY",
  "convertedMinor": 10300,
  "paymentMethod": "cash|credit|debit|transfer|ewallet|other",
  "cardId": null,
  "itineraryItemId": null,
  "receiptUrl": "https://...",
  "status": "active|voided",
  "createdBy": "uid",
  "updatedBy": "uid"
}
```

- `payerPending` (v13): `true` → the expense has **no host yet** (`payerId: null`, empty
  `payments`). It is listed under "ยังไม่ระบุเจ้าภาพ" on the settlement page and excluded
  from net balances, statements and transactions until a payer is assigned; saving it
  through the expense editor with a real payer clears the flag.

### Expense groups (v9) — `trips/{tripId}/categories/{categoryId}`

User-defined groups shown everywhere a category is picked or summarised. `categoryId` is
`custom-<slug>` for groups the user creates; the built-in groups live in the app and are only
overridden when a doc with the same id exists.

```json
{
  "id": "custom-nuad-spa",
  "th": "นวด/สปา",
  "en": "Massage / Spa",
  "icon": "heart-pulse",
  "color": "#a48fc0",
  "custom": true,
  "order": 500,
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

Rules: members read, trip members create/update/delete (`isTripMember(tripId)`); built-ins are
refused by the app before any write.

### Other subcollections
- `cards`, `exchangeRates`, `settings`, `activityLogs`, `imports`, `settlements`

All money in minor units to avoid float errors.

## Indexes
See `firestore.indexes.json`
