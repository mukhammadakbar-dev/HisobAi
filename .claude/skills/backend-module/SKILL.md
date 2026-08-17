---
name: backend-module
description: How a NestJS module is built in HisobAI — file anatomy, contracts package usage, guards and decorators, error codes, idempotency, pagination, audit, and the verification commands. Load before implementing backend features.
---

Stack: NestJS 11, Prisma 7, PostgreSQL, zod 4, Vitest 4, pnpm workspace.
Routes under `/api/v1`. Conventions come from `API.md` and `PERMISSIONS.md`.

## Module anatomy

Copy an existing sibling — `customers/`, `catalog/`, `cash/` are clean
references. Do not invent a layout.

```
apps/api/src/<domain>/
  <domain>.module.ts        wiring
  <domain>.controller.ts    routes, guards, decorators — no business logic
  <domain>.service.ts       business logic, Prisma access
  <domain>.mappers.ts       row → DTO (INCLUDE constants live here too)
  <domain>.service.spec.ts  Vitest, mocked Prisma
```

Complex domains split the service by responsibility rather than growing one
file — see `sales/`: `sales.service.ts`, `sale-confirmation.service.ts`,
`sale-reversal.service.ts`.

## `packages/contracts`

Shared by both apps. It holds **shapes only** — zod schemas, types, enums,
error codes, money helpers. Never runtime business logic; that would couple the
frontend to backend internals.

Adding an endpoint means: schema + types in `packages/contracts/src`, then
consume them on both sides. After changing it:
`pnpm --filter @hisobai/contracts build`.

## Cross-cutting pieces in `src/common/`

| File                                                  | Use                                                  |
| ----------------------------------------------------- | ---------------------------------------------------- |
| `app.exception.ts`                                    | `AppException` — throw with a registered `ErrorCode` |
| `all-exceptions.filter.ts`                            | maps to the `API.md` §3 error body                   |
| `zod-validation.pipe.ts`                              | zod `.strict()` — unknown keys rejected              |
| `session.guard.ts`, `roles.guard.ts`, `csrf.guard.ts` | auth chain; order is tested in `guard-order.spec.ts` |
| `auth.decorators.ts`                                  | `@Public()`, `@Roles()`, `@PlatformOnly()`           |
| `current-user.decorator.ts`, `request-user.ts`        | the session user                                     |
| `idempotency.interceptor.ts`                          | `Idempotency-Key` handling                           |
| `decimal-serializer.interceptor.ts`                   | `Decimal` → string in responses                      |
| `pagination.ts`                                       | cursor pagination helper                             |
| `optimistic-lock.ts`                                  | `API.md` §8                                          |
| `dates.ts`                                            | `businessDay`, `Asia/Tashkent`                       |
| `search.ts`                                           | normalised search                                    |
| `prisma-errors.ts`                                    | Prisma error → domain error                          |

`src/database/`: `prisma.service.ts` (the extension), `shop-context.ts`
(`requireShopId`, `runWithoutShopScope`).
`src/audit/audit.service.ts`: `record(tx, …)` inside a transaction,
`recordDetached(…)` for sensitive reads.

## Rules that get violated most often

1. **Never** `where: { shopId }` by hand; **never** accept `shopId` from the
   client. Look up with `findFirst`, mutate by `id`. See the `tenant-boundary`
   skill.
2. **Money is `Prisma.Decimal`**, serialized as a string. Any actual money
   arithmetic belongs to `money-ledger-engineer` — say so rather than improvise.
3. **Every endpoint carries `@Roles()` or `@PlatformOnly()`** — never both,
   never neither. Nothing should fall to default DENY by accident.
4. **Errors** use a code from the `API.md` §3.4 registry. Never invent an
   ad-hoc code; never leak internals. User-facing text in Uzbek.
5. **Audit inside the transaction** — `AuditService.record(tx, …)`. An
   interceptor runs outside the transaction and could leave an action recorded
   with no audit row; that is why audit is a service here, not an interceptor.
6. **Financial `POST` requires `Idempotency-Key`.**
7. **Never store a computed value** — debt, outstanding, overdue.
8. **Cursor pagination** via the shared helper. No hand-rolled offsets.
9. Client validation never replaces server validation.
10. Role-sensitive fields (`costSnapshot`, cost price, profit) are stripped at
    the **serialization** layer, not by hiding the endpoint.

## Response conventions (`API.md`)

- Money → string: `"12500000.00"` (§2.1)
- Dates → ISO 8601 with offset (§2.2)
- Errors → `{ code, message, field?, details?, requestId }` (§3)
- Cross-Shop miss → **404**, not 403
- Lists → cursor-based (§5.1)

## Verification before reporting

```bash
pnpm --filter @hisobai/contracts build          # only if contracts changed
pnpm --filter @hisobai/api exec vitest run <touched spec files>
pnpm --filter @hisobai/api typecheck
pnpm --filter @hisobai/api lint
```

If the change touches raw SQL, the Prisma extension, RLS or `shop_id` handling,
tell the parent that `tenant-boundary-auditor` must run the isolation suite.
Do not declare it safe yourself.

## Style

English identifiers, **Uzbek comments** that cite the governing `§` — as in
`sales/sale-confirmation.service.ts`. A comment explains _why_, not _what_.
