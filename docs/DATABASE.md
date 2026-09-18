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
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp",
  "createdBy": "uid"
}
```

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
  "createdBy": "uid",
  "updatedBy": "uid",
  "version": 1
}
```

### trips/{tripId}/expenses/{expenseId}
```json
{
  "title": "Train",
  "description": "...",
  "date": "2027-11-10",
  "category": "transport",
  "payerId": "uid",
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

### Other subcollections
- `cards`, `categories`, `exchangeRates`, `settings`, `activityLogs`, `imports`, `settlements`

All money in minor units to avoid float errors.

## Indexes
See `firestore.indexes.json`
