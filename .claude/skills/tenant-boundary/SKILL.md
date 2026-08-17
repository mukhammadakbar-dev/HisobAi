---
name: tenant-boundary
description: The HisobAI multi-tenant contract — Prisma extension, AsyncLocalStorage shop context, PostgreSQL RLS policies, the sanctioned raw-SQL sites, the Platform/SUPERADMIN separation, and the mandatory isolation test run. Load before touching anything near shop_id.
---

Source: `ARCHITECTURE.md` §14 (lines 643–979), `PERMISSIONS.md` §4/§5,
`DECISIONS.md` §21.

## The invariant

> Shop A's business data never mixes with Shop B's.
> SUPERADMIN never reaches any Shop's business data.

## The two layers

```
request → ShopContextMiddleware        (from user.shopId — NEVER from
   │                                    query/body/header, §25.12)
   ↓
AsyncLocalStorage<{ shopId }>
   ↓
PrismaService.$extends({ query: { $allOperations } })
   │   no context  → throws SHOP_CONTEXT_MISSING (never reaches the DB)
   │   no tx       → wraps transparently in one (§21.15)
   ↓
SELECT set_config('app.current_shop_id', $1, true)      (§21.14)
   ↓
PostgreSQL RLS (ENABLE + FORCE, USING and WITH CHECK):
  shop_id = NULLIF(current_setting('app.current_shop_id', true), '')::uuid
```

The extension gives ergonomics. **RLS gives the guarantee.**

### Why each detail is load-bearing

- **`NULLIF`** (§21.17): after `set_config(…, true)` has run once, the setting
  resets to an **empty string**, not `NULL`, when the transaction ends. Without
  `NULLIF` the same bug is a silently empty result on a fresh connection and a
  cast error on a reused one.
- **`WITH CHECK` alongside `USING`**: `USING` controls only which rows are
  _visible_, not which `shop_id` a new row may carry. With `USING` alone you
  can **write** a row into another tenant.
- **Missing context throws, and never reaches the DB** (§21.15): with RLS on
  and the setting unset, the policy matches nothing and the query returns `[]`
  — not an error. A silent empty result is worse than a loud failure, because
  "no filter = all rows" is the most common leak in tenant systems.
- **Restricted DB role `hisobai_app`** (§21.16): RLS is bypassed for the table
  owner and for superusers. `FORCE ROW LEVEL SECURITY` covers the owner;
  superuser still passes. So the restricted role is a _precondition_ of RLS
  working, not an optional hardening step.

## Rules for service code

- **Never** write `where: { shopId }` by hand (§21.7). 93 API files × one
  forgotten filter = the §25.11 cross-Shop IDOR.
- **Never** accept `shopId` from the client — same rule class as
  `exchange_rate` and `cost_snapshot`.
- **Composite unique pattern.** `findUnique`/`update`/`delete` on a composite
  `(shop_id, …)` key is forbidden — Prisma requires `shopId` to build the key,
  forcing manual scoping:
  ```ts
  // ✗ forces you to write shopId by hand
  await tx.customer.findUnique({ where: { shopId_phonePrimary: { shopId, phonePrimary } } });

  // ✓ RLS already scoped it — the remaining condition is enough
  const existing = await tx.customer.findFirst({ where: { phonePrimary } });
  await tx.customer.update({ where: { id: existing.id }, data });
  ```
  Look up with `findFirst`, mutate by primary key `id`, bulk with
  `updateMany` / `deleteMany`.
- **`runWithoutShopScope()`** is the only named escape hatch, and exactly two
  callers are entitled to it: the `Platform` module, and auditing an account
  action for a shopless account (§21.18). One greppable name.

## Raw SQL — exactly three sites, pinned by a test

Raw SQL bypasses the extension but **not** RLS. The `shop_id` predicate is
still written explicitly — for readability, not protection.

| Site                                           | §    | Measure                          |
| ---------------------------------------------- | ---- | -------------------------------- |
| `sale_counters` number allocation              | 17.1 | `WHERE shop_id = … AND year = …` |
| product-name advisory lock (`product.service`) | 18.5 | `shop_id` added to the lock key  |
| `SELECT 1` (`health.controller`)               | —    | touches no tenant table          |

A fourth site is a finding. The list is frozen in
`src/database/raw-sql-audit.spec.ts`.

Conditional stock `UPDATE` (§17.5) is **not** on this list — it uses
`tx.inventoryItem.updateMany(...)` / `tx.inventoryBatch.updateMany(...)`, which
the extension covers.

Advisory lock keys must include `shop_id` in both places: otherwise adding a
product in one Shop blocks a receiving operation in another — not a correctness
bug, but tenants slowing each other down.

**DB triggers** are not queries, so neither the extension nor manual filters
apply. They are rewritten at SQL level: the IMEI cross-column uniqueness check
(§18.3) compares within `shop_id`, and the `CHECK` constraints (§17.8) must
cover new columns.

## Platform separation (§14.3)

| Layer        | Business (`SHOP_ADMIN`)       | Platform (`SUPERADMIN`)        |
| ------------ | ----------------------------- | ------------------------------ |
| Table        | `users`                       | `platform_admins`              |
| Session      | `sessions`                    | `platform_sessions`            |
| Cookie       | `SESSION_COOKIE_NAME`         | `PLATFORM_SESSION_COOKIE_NAME` |
| Guard        | `SessionGuard` + `RolesGuard` | `PlatformSessionGuard`         |
| Decorator    | `@Roles(...)`                 | `@PlatformOnly()`              |
| Shop context | from `user.shopId`            | **none at all**                |

The two decorators never share an endpoint; an endpoint with neither is
default DENY. SUPERADMIN has no `shopId` field, so a shop-scoped query is
technically impossible for it — a structural guarantee, not a code check.

## Shop-scoped tables (§14.5)

`categories`, `brands`, `products`, `inventory_items`, `inventory_batches`,
`stock_movements`, `stocktakes`, `stocktake_lines`, `customers`, `sales`,
`sale_items`, `sale_counters`, `installment_contracts`, `payment_schedules`,
`payments`, `payment_allocations`, `cash_accounts`, `cash_categories`,
`cash_entries`, `cash_exchanges`, `files`, `documents`, `notification_logs`,
`push_subscriptions`, `audit_logs`.

`audit_logs.shop_id` is the **only nullable** one (platform-level account
actions). Hence `AuditService.record(tx, …)` takes `shopId` as a required
argument, and only the platform path passes `null`.

`idempotency_keys` (§21.11): not a business table, but `response_body` holds
another Shop's response. Unique moved to `(shop_id, key)` and the replay path
now also checks `user_id`.

Shop-scoped uniques: `customers.(shop_id, phone_primary)`, slugs, IMEI/serial
partial uniques, `sales.(shop_id, number)`, `sale_counters.(shop_id, year)`,
`cash_accounts.(shop_id, name, currency)`.
`sale_counters` matters especially (§21.9): a shared counter would start the
second shop where the first stopped, leaking the other tenant's sales volume
through a customer-visible number.

## Errors

| Code                   | Status | Meaning                                                 |
| ---------------------- | ------ | ------------------------------------------------------- |
| `SHOP_SETUP_REQUIRED`  | 409    | account exists, no Shop → redirect to `/app/setup-shop` |
| `SHOP_CONTEXT_MISSING` | 500    | internal: a shop-scoped query ran without context       |

A cross-Shop attempt gets **404**, never 403 — 403 would confirm the ID exists.

## Verification — mandatory, not optional

```bash
pnpm --filter @hisobai/api exec vitest run src/database/tenant-isolation.integration.spec.ts
```

Must run under the `hisobai_app` role. Setup: `apps/api/prisma/README-test-db.md`.

Reading the diff is not sufficient, and mocked unit tests prove nothing here —
row filtering is enforced by PostgreSQL, so a mocked test cannot observe the
boundary at all. This rule exists because a cross-tenant defect in
`sale_counters` passed both code review and the mocked suite.

Related specs: `raw-sql-audit.spec.ts`, `shop-context.spec.ts`,
`transaction-scope-audit.spec.ts`.
