# Expense entry and THB reporting

- All persisted amounts (`*Minor`) use the source currency's smallest unit:
  JPY/KRW/VND use whole units; THB uses satang. Exchange rates mean **THB per one
  major source unit**. For example, JPY 1,000 at 0.24 is THB 240.00 = 24,000 satang.
- Reports normalize copies to THB before summing expenses or computing balances.
  This avoids adding incompatible minor units. Expense rate snapshots take
  priority over the trip's rate. Missing rates are reported rather than rendered
  as zero. Original expenses are not rewritten during reporting; old cached
  `thbMinor` values are not trusted for these totals.
- `payments: [{ memberId, amountMinor }]` records each payer's contribution.
  Payments must be non-negative integer minor units, have unique members and sum
  exactly to `netTotalMinor`. A single payer automatically pays the total.
  Legacy records without `payments` use `payerId` (or `paidBy`) for the full total.
  `payerId` remains the first payer for legacy compatibility, not an extra payment.
- `allocations` remains the final amount owed by each participant, independent of
  who paid. Custom splitting persists `splitMethod`, `splitIncludesVatSc`, and
  `splitInputs` so editing restores the input mode and pre-adjustment amounts.
- In pre-adjustment mode, empty participants share the remaining subtotal.
  Discount, service and VAT are apportioned separately in integer minor units
  using largest remainder rounding. Each displayed component and final amount
  sums exactly to the bill. Invalid totals cannot be silently charged to the
  first participant. Final-amount mode does not apply the adjustments again.
- Baht is primary on dashboard, itinerary, expenses and settlement. The source or
  configured trip currency is secondary. Budget fields use the selected trip
  currency and its minor-unit precision. Editable amounts group thousands without
  replacing the focused input. The ledger continues to store numeric integers.
- Deploy the updated Cloud Functions together with the frontend if using the
  callable settlement endpoint; saved settlements now explicitly carry
  `currency: 'THB'`. This change does not migrate existing expense documents.

## Checks

```sh
node tests/node-runner.mjs
node tests/smoke/run.mjs
node tests/browser/mobile-check.mjs 375x667
```

The Node runner skips CDN-dependent scheduling tests; the smoke suite exercises
those through its CDN stubs. The browser harness uses Firebase stubs (no production
writes) and checks custom-input focus/grouping, row overflow and portrait-image
16:9 sizing, as well as the existing page-layout checks. Generated builds and
screenshots are ignored by Git.
