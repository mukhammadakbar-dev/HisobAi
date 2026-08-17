---
name: db-schema
description: HisobAI PostgreSQL and Prisma conventions — table groups, column rules, CHECK constraints, RLS policy shape, trigger inventory, migration checklist and verification commands. Load before editing schema.prisma or a migration.
---

Files: `apps/api/prisma/schema.prisma` (~1358 lines),
`apps/api/prisma/migrations/`, `apps/api/prisma/seed.mts`,
`apps/api/prisma/README-test-db.md`,
`docs/proposals/v0.2.1-migration.sql` (reference CHECK set).

Design source: `ARCHITECTURE.md` §7 (line 225) and §14.5 (line 844).

## Column rules — no exceptions

| Kind          | Type                                                                               |
| ------------- | ---------------------------------------------------------------------------------- |
| Money         | `numeric(18,2)` + a paired currency column. Never a lone amount                    |
| Rate          | `numeric(12,4)`                                                                    |
| Timestamp     | `timestamptz`, always                                                              |
| Calendar date | `@db.Date` (business day in `Asia/Tashkent`)                                       |
| Id            | uuid                                                                               |
| Tenant        | `shop_id NOT NULL` with `@default(dbgenerated(...))` reading `app.current_shop_id` |

The `@default` is what makes `shopId` optional in Prisma's create input — that
is the whole reason services never have to write it by hand (§21.7).

## Table groups

- **Auth**: `users`, `sessions`, `login_attempts`, `password_reset_tokens`
- **Platform**: `platform_admins`, `platform_sessions`, `shops`
- **Rates**: `cbu_rates` (platform-wide, `date` unique), `shop_exchange_rates`
  (`(shop_id, date)` unique, `store_rate`, `source`, `updated_by_id`)
- **Catalog**: `categories`, `brands`, `products`
- **Inventory**: `inventory_items`, `inventory_batches`, `stock_movements`,
  `stocktakes`, `stocktake_lines`
- **Customers**: `customers` — **no debt column**, debt is computed (§6.12)
- **Sales**: `sales` (`number` nullable while DRAFT), `sale_items`,
  `sale_counters` (`(shop_id, year)`)
- **Installments**: `installment_contracts`, `payment_schedules`
  — **no `outstanding_amount`**, it is computed
- **Payments**: `payments` (carries both `sale_id?` and `contract_id?`),
  `payment_allocations`
- **Cash**: `cash_accounts`, `cash_categories`, `cash_entries`, `cash_exchanges`
- **Files/docs/notify/audit**: `files`, `documents`, `notification_logs`,
  `push_subscriptions`, `audit_logs`, `idempotency_keys`

`settings` no longer exists — its columns are on `shops` (§21.4).
`shops` has no `base_currency`: the base currency is always `UZS`.
`sales.subtotal` was removed — no discount, tax or shipping in scope, so it
always equalled `total`.

## Constraints are the last line of defence (§17.8)

`CHECK` constraints protect against application bugs. Keep them in sync when a
column is added. The set covers: currency agreement (`cash_entries` ↔ account,
cost ↔ product), non-negative batch remainder, `returned_quantity ≤ quantity`,
a payment having either `sale_id` or `contract_id`, positive amounts, the
`principal` formula, status consistency, and one opening balance per account.

Shop-scoped uniques (a global unique would stop the second Shop from writing):
`customers.(shop_id, phone_primary)`, category/brand/cash-category
`(shop_id, slug)`, IMEI/serial as shop-scoped **partial** uniques
(non-null values only), `sales.(shop_id, number)`, `sale_counters.(shop_id, year)`,
`cash_accounts.(shop_id, name, currency)`, `idempotency_keys.(shop_id, key)`.

Child tables (`sale_items`, `payment_allocations`, `stocktake_lines`) carry a
denormalised `shop_id`, tied to the parent by a composite FK over
`@@unique([id, shop_id])` — the child can never drift to another tenant.

## RLS policy shape (every shop-scoped table)

```sql
ALTER TABLE t ENABLE ROW LEVEL SECURITY;
ALTER TABLE t FORCE ROW LEVEL SECURITY;
CREATE POLICY t_shop_isolation ON t
  USING      (shop_id = NULLIF(current_setting('app.current_shop_id', true), '')::uuid)
  WITH CHECK (shop_id = NULLIF(current_setting('app.current_shop_id', true), '')::uuid);
```

Both clauses, always. `NULLIF`, always. See the `tenant-boundary` skill for why.

DB roles (`PERMISSIONS.md` §4): `hisobai_app` — the application role, with only
`INSERT`/`SELECT` on `audit_logs` so "immutable audit" is enforced rather than
declared; `hisobai_migrate` — DDL, used at deploy time only.

## Triggers

| Trigger                      | §    | Note                                    |
| ---------------------------- | ---- | --------------------------------------- |
| IMEI cross-column uniqueness | 18.3 | comparison happens **within `shop_id`** |
| Product-name advisory lock   | 18.5 | key includes `shop_id`                  |

Triggers are not queries — the Prisma extension does not cover them. They are
written in migration SQL by hand.

## Migration checklist

1. State the change before editing: tables, columns, constraints, indexes, RLS,
   backfill, what breaks.
2. Edit `schema.prisma`, then `pnpm --filter @hisobai/api db:migrate`.
3. Hand-edit the generated SQL for what Prisma cannot express: RLS policies,
   `CHECK` constraints, partial unique indexes, triggers, composite FKs.
4. Backfill existing rows in the same migration — a migration that fails on
   existing data is not forward-safe.
5. New shop-scoped table? Add `shop_id`, the `@default`, the RLS policy, the
   composite FK if it is a child, and add it to the parametrised isolation test.
6. Verify:
   ```bash
   pnpm --filter @hisobai/api db:generate
   pnpm --filter @hisobai/api exec prisma validate
   pnpm --filter @hisobai/api exec vitest run src/database/tenant-isolation.integration.spec.ts
   ```
7. An index is added only for a query that exists in the codebase — name it.

Never drop a column or loosen a constraint silently. Name it, justify it, and
let the parent decide.
