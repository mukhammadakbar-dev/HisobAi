---
name: test-suite
description: HisobAI testing conventions — Vitest layout and commands, the four test levels, what a money assertion must look like, the edge cases that matter in this domain, and the hard limits of mocked tests. Load before writing or running tests.
---

Vitest 4 everywhere. `*.spec.ts` sits next to its source. 36 spec files exist —
follow their style, do not invent a new one.

```bash
pnpm --filter @hisobai/api  exec vitest run <path>     # scoped — preferred
pnpm --filter @hisobai/contracts test
pnpm test                                              # whole workspace, sparingly
```

`apps/web` has no test runner yet (`test` is a stub) — Vitest + Testing Library
and later Playwright are planned in `FRONTEND.md` §13.

## Levels (`ARCHITECTURE.md` §12, line 560)

| Level       | Covers                                                                                                                              | Where                                               |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Unit        | money and currency maths, rounding, allocation, schedule building, profit                                                           | `packages/contracts`, `src/common/*.spec.ts`        |
| Integration | sale confirmation, return/cancel, payment confirm and reverse, stock adjustment                                                     | `src/sales`, `src/payments`, `src/inventory`        |
| Tenant      | cross-Shop IDOR, parametrised over every shop-scoped resource; context-less query throws; SUPERADMIN gets 403 on business endpoints | `src/database/tenant-isolation.integration.spec.ts` |
| E2E         | login → sale → installment → payment                                                                                                | Playwright, later stage                             |

**Sale confirmation and payment allocation do not reach `main` untested.**
They are the two places where being wrong corrupts money silently.

The tenant test must stay **parametrised, not exemplary** — a resource added
later must be covered automatically, or it ships untested. A CI script also
checks that every model in the §14.5 list carries `shop_id`.

## Money assertions

```ts
expect(result.total.toString()).toBe('12500000.00'); // ✓ exact
expect(result.total).toBeCloseTo(12500000); // ✗ never for money
```

No snapshot tests for financial output — pin the value explicitly, so a change
in the number is a visible diff and not a re-recorded blob.

## Edge cases that matter in this domain

- The rounding remainder landing on the **last** schedule row (§17.15).
- A residue below the smallest unit (< 0.01 USD / < 1 UZS) auto-closing the row
  as `PAID` (§16.11).
- Overpayment rejected with `PAYMENT_EXCEEDS_OUTSTANDING` (§10.2).
- Claiming an inventory unit that is no longer `AVAILABLE` — `rowCount = 0`
  must fail the transaction, and nothing may be saved.
- A batch with insufficient `quantity_remaining`.
- Payment in a different currency from the contract — all three values stored
  (§10.5).
- Return using the **original** sale rate, not today's (§1.8).
- Cancel outside the 7-day window (§16.5).
- Partial return reducing debt only from `UNPAID` rows, from the last backwards
  (§16.12).
- A `kind = CASH` sale whose payments do not sum to `total` (§17.10).
- A stale exchange rate — the app must keep working on the last known rate.
- Idempotency: the same key replayed returns the stored response and creates
  nothing new.
- Authorization: assert the role that must be **refused**, not only the allowed
  one.
- The reversal path, not only the happy path.

## The limit of mocked tests — respect it

Row-level tenant filtering is enforced by **PostgreSQL RLS**, not by
application code. A test with a mocked Prisma client **cannot observe the
tenant boundary at all**. This exact gap once let a cross-tenant defect in
`sale_counters` pass both code review and the mocked suite.

So the boundary is proven only by:

```bash
pnpm --filter @hisobai/api exec vitest run src/database/tenant-isolation.integration.spec.ts
```

under the restricted `hisobai_app` role — RLS is bypassed for the table owner
and for superusers. Setup: `apps/api/prisma/README-test-db.md`.
Never claim isolation coverage from a mocked test. If the test DB is
unavailable, say so and mark the coverage UNVERIFIED.

## Rules

- **Never change production logic to make a test pass.** If the implementation
  looks wrong, report a suspected bug and leave the code alone.
- Always label a failure as a **test defect** or an **implementation defect**.
- Never delete or weaken an existing assertion to get green.
- Cite the governing `§` in the test description or a comment.
- English identifiers; Uzbek `describe`/`it` text and comments, as in the
  existing specs.
