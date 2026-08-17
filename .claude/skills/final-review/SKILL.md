---
name: final-review
description: HisobAI final code-review checklist — the project-specific defects worth hunting, in priority order, with the greps that reveal them and the severity bar for each. Load before a final review.
---

Review the diff against the written design, not against personal taste.
Section line numbers: see the `repo-map` skill.

## Priority order

Business-rule correctness → money/transaction safety → architecture conformance
→ API contract → authorization → error handling → tests → frontend rules →
duplication and complexity.

Do **not** deep-audit the tenant boundary or the security surface —
`tenant-boundary-auditor` and `security-reviewer` own those. One-line handoff
if you notice something.

## The defects actually worth hunting here

**Money**

- `number`, `parseFloat`, `toFixed()`, or `+` applied to a money value
- rounding at display instead of before writing; wrong mode (must be
  `ROUND_HALF_UP`)
- a snapshotted rate or cost being recomputed from today's value
- money serialized as a JSON number instead of a string
- a money column used without its currency column

**Transactions**

- work that must be consistent split across two `$transaction` calls
- audit written outside the transaction (must be `AuditService.record(tx, …)`)
- `SELECT` then `UPDATE` on stock instead of a conditional `UPDATE` with a
  `rowCount` check
- a financial `POST` without `Idempotency-Key`
- a sale writing to `cash_entries` directly instead of through a CONFIRMED
  payment
- a reversal mutating the original row instead of inserting a reversal row

**Storing what should be computed**

- a debt, outstanding or overdue column, or a cached total that has no
  invalidation path

**Architecture**

- business logic in a controller, or in `packages/contracts`
- one module writing another module's tables
- a new pattern introduced where a project convention already exists
- a helper reimplemented instead of reused (grep `common/` and
  `packages/contracts/src` before believing a helper is missing)

**API contract** (`API.md`)

- an error code not in the §3.4 registry
- wrong HTTP status; cross-Shop miss returning 403 instead of 404
- hand-rolled pagination instead of the shared cursor helper
- date without an offset

**Authorization**

- an endpoint with neither `@Roles()` nor `@PlatformOnly()`, or with both
- a `:id` lookup with no ownership check
- cost/profit fields exposed without role-based serialization

**Tests**

- sale confirmation or payment allocation changed with no test — a hard stop
- a new branch with no assertion
- `toBeCloseTo` on money instead of an exact Decimal string
- a test changed to match the code rather than the spec

**Frontend** (when `apps/web` is touched)

- arithmetic on money in the client
- an optimistic update on a financial action
- a missing loading / error / empty state
- `fetch` called directly instead of `api-client`
- UI text hardcoded instead of `lib/messages.ts`
- wrong or missing query invalidation (note: a rate change must **not**
  invalidate sales)
- hardcoded colors/spacing instead of `design.md` tokens

## Fast greps

```
toFixed|parseFloat|Number\(            money as float
\$transaction                          transaction boundaries
recordDetached|record\(tx              audit placement
@Roles|@PlatformOnly                   authorization coverage
where: \{ shopId                       manual tenant filtering
toBeCloseTo                            weak money assertions
useMutation|optimistic                 optimistic updates
fetch\(                                bypassing api-client
```

## Severity bar

| Level    | Meaning                                                                                     |
| -------- | ------------------------------------------------------------------------------------------- |
| CRITICAL | money computed or stored wrong, data loss, an auth hole, a transaction that can half-commit |
| HIGH     | a business rule violated, an untested money path, a contract break the client will hit      |
| MEDIUM   | maintenance harm — duplication, a convention broken, a missing edge-case test               |
| LOW      | clarity, naming, comments                                                                   |

Style preferences are not findings. "Different from how I would write it" is
not a finding. If the change is correct, say so plainly and stop — a padded
review trains people to skim reviews.

End with a real verdict: **TAYYOR / TUZATISHDAN KEYIN TAYYOR / TAYYOR EMAS**.
