---
name: money-rules
description: The exact money, currency, rounding, transaction and allocation rules of HisobAI CRM — sale confirmation sequence, reversal model, installment schedule, payment allocation, cash book sources. Load before writing or auditing any code that moves money.
---

These rules come from `DECISIONS.md` (authoritative), `ARCHITECTURE.md` §4/§6
and `API.md` §2.1. When in doubt, grep the `§` cited here and read that window.

## Representation

| Rule          | Form                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Currency      | `Currency` enum: `UZS`, `USD`. Base currency is always `UZS` (§1.1)                                                                                           |
| Amount        | `numeric(18,2)`, `Prisma.Decimal`. **JS `float` never touches money**                                                                                         |
| Rate          | `numeric(12,4)` — how many UZS per 1 USD                                                                                                                      |
| Rounding      | USD 2 decimals, UZS whole units (§1.10). Rounded **before writing**, never at display                                                                         |
| Rounding mode | `Decimal` + `ROUND_HALF_UP` (§17.14). `Number()` + `toFixed()` is forbidden — it introduces float error and makes distributed parts stop summing to the total |
| JSON          | money is a **string** (`"12500000.00"`), never a number (`API.md` §2.1)                                                                                       |
| Pairing       | every money column carries its own currency column. No naked amount column                                                                                    |
| Snapshot      | wherever a conversion happens, the rate is snapshotted and **never recomputed** (§1.7)                                                                        |

Helpers live in `packages/contracts/src`: `roundMoney`, `sumMoney`,
`multiplyMoney`, `markupFromPercent`, `principalOf`. Grep before writing maths.

Consequences:

- A sale is single-currency (§1.9). A product in another currency is converted
  at the **sale's rate** and stored converted in `sale_items`.
- Debt stays in the contract currency (§1.3). A payment in another currency
  stores all three: amount paid + its currency, the rate at that moment, the
  amount deducted + the debt currency (§10.5).
- A return uses the **original sale's rate** (§1.8, §8.1) — `sales.exchange_rate`
  is copied to the reversal row. Today's rate is not fetched.
- Inventory is valued at **today's** shop rate (§5.9); profit stays at the
  sale-time snapshot rate — past reports never change.

## Sale confirmation transaction (`ARCHITECTURE.md` §6)

Precondition: `Idempotency-Key` header (§17.6). The sale already exists as
`DRAFT`; the transaction **updates** it, it does not insert a new row (§17.1).
Order is deliberate — do not reorder.

1. **Claim stock with a conditional UPDATE** (§17.5):
   ```sql
   UPDATE inventory_items SET status='SOLD' WHERE id=$1 AND status='AVAILABLE';
   UPDATE inventory_batches SET quantity_remaining = quantity_remaining - $n
    WHERE id=$1 AND quantity_remaining >= $n;
   ```
   `rowCount = 0` → error. `SELECT` then `UPDATE` is forbidden: under
   `READ COMMITTED` it lets two transactions sell the same unit.
2. Allocate the sale number from `sale_counters` (§7.6, §17.1) —
   `UPDATE … SET last_seq = last_seq + 1 … RETURNING last_seq`, scoped by
   `shop_id AND year`.
3. Update `sales`, freeze `sale_items` with the **rate snapshot** (the shop
   rate at the sale date, §17.11), **cost snapshot** and
   **suggested-price snapshot**.
4. Write `stock_movements`.
5. Create `payments` for the basket: cash and card → `CONFIRMED` immediately,
   transfer → `PENDING_VERIFICATION` (§17.2). For `kind = CASH`, payments must
   sum exactly to `sales.total` (§17.10).
6. **Only for `CONFIRMED` payments** create the `cash_entries` inflow —
   `source_type = PAYMENT`, into the account matching the currency (§11.1).
   A sale **never** writes to the cash book directly (§17.2).
7. If installment: contract + schedule; the schedule must sum to the debt
   (§9.6), and the rounding remainder lands on the **last row** (§17.15).
8. `audit_logs` entry — via `AuditService.record(tx, …)`, inside this same
   transaction.

If any step fails, none of it is saved.

## Payment allocation

Allocate from the **oldest unpaid schedule row** forward (§10.1). Each split is
its own `payment_allocations` row, so a reversal can be undone exactly.

```
applied_amount = min(round(paid_amount / rate, scale), outstanding)
```

Overpayment is **rejected** (§10.2, §16.11): the API returns
`PAYMENT_EXCEEDS_OUTSTANDING` and the UI caps the input at the outstanding
balance. Excess cash is handed back as change and creates no record — otherwise
it would become a customer balance held in the till, which this system forbids.

A residue below the currency's smallest unit (< 0.01 USD / < 1 UZS)
auto-closes the last schedule row as `PAID` (§16.11).

## Reversal model

The reversal is a **separate `sales` row** and the single source of truth
(§17.4): `reverses_sale_id` set, `status = REVERSAL`, `total` negative,
`number` = original + `-R1` / `-R2`.

- `sale_items.returned_quantity` and the `PARTIALLY_RETURNED` / `RETURNED`
  statuses on the original are a **derived cache**, updated only inside that
  transaction.
- **Return** is dated to its own date (§8.7); the item comes back as `RETURNED`
  and only becomes `AVAILABLE` via "Sotuvga qaytarish", with the reason kept
  (§16.4).
- **Cancel** is dated to the original sale date and only applies within 7 days
  (§16.5); the item goes straight back to `AVAILABLE`.
- Reversing or cancelling an installment sets the contract to `CANCELLED`
  (§17.18). On a partial return the debt shrinks per the §16.12 formula, taken
  only from `UNPAID` schedule rows, starting from the last.

## Not stored, always computed

Customer debt (§6.12) · `outstanding_amount` (§9) · "overdue" status (§9.8).
`payment_schedules.status` is only `UNPAID` · `PARTIAL` · `PAID`; overdue is
derived from `due_date < today` plus a remaining balance. Storing it would
require a job to keep it fresh, and a stopped job would display a lie.

## Cash book

`source_type`: `PAYMENT` · `MANUAL` · `OPENING_BALANCE` · `EXCHANGE` ·
`REVERSAL`. There is deliberately **no `SALE`** — money reaches the till only
through a payment (§17.2) — and **no `PERSONAL_USE`**: personal use takes no
cash out (§17.12), it writes `stock_movements(PERSONAL_USE)` and appears as a
separate cost line at cost value in reports.

Non-`MANUAL` entries are never hand-edited (§11.7); a `MANUAL` entry is
editable/deletable only on the same day (§11.8). Opening balance and currency
exchange are not income (§11.4, §11.6).

## Test expectations

Assert the exact Decimal as a string. `expect(x.toString()).toBe('12500000.00')`
— never `toBeCloseTo`. Cover: the rounding remainder on the last schedule row,
overpayment rejection, the sub-minor-unit residue, an unavailable unit, a stale
rate, and the reversal path.
