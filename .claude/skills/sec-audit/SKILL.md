---
name: sec-audit
description: HisobAI security model reference — session and CSRF scheme, default-DENY authorization, the role matrix, known access-control risks (P2–P9), file and passport PII handling, audit immutability, and the greps that find each. Load before a security audit.
---

Source: `docs/PERMISSIONS.md` (149 lines — short enough to read fully),
`ARCHITECTURE.md` §12 (line 523), `API.md` §6/§7, `DECISIONS.md` §2.

## Threat model

Multi-tenant CRM for phone shops in Uzbekistan. Stores **passport series and
number, PINFL, and passport scans** — personal data under local law, hosted
inside Uzbekistan (§16.13). Holds the shop's entire financial record.
Realistic attackers: another tenant's admin, and a lower-privileged employee
once `MANAGER`/`SELLER` land.

## Auth scheme

- Passwords: **Argon2id** (§2.4).
- Session: `HttpOnly`, `Secure`, `SameSite=Strict` cookie, 30 days (§2.7);
  CSRF via double-submit token (§2.8, `API.md` §1).
- Login throttling: 5 attempts / 15 min, logged (§2.9, §2.10). Behind a reverse
  proxy `trust proxy` **must** be configured — otherwise every user shares one
  IP and the limit blocks everyone.
- `password_reset_tokens`: hashed, expiring, single-use (§2.5).
- SUPERADMIN is a **separate table, session table, cookie and guard** — not a
  value in `UserRole`.

## Authorization mechanism (`PERMISSIONS.md` §1)

| Rule             | Form                                                                                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| **Default DENY** | global guard; an endpoint with neither `@Roles()` nor `@PlatformOnly()` returns 403                            |
| Public endpoints | only explicit `@Public()`: `POST /auth/login`, `/auth/forgot-password`, `/auth/reset-password`, `GET /health*` |
| Ownership        | role is not enough — `:id` lookups check ownership (sessions, files)                                           |
| Response shaping | some fields (cost, profit) are stripped **by role at serialization**, even on an endpoint the role may call    |

MVP has only `SHOP_ADMIN` in `UserRole`. `MANAGER` and `SELLER` are designed
in the matrix but deliberately not in the enum — an unimplemented role is
untested security code. Account status (`ACTIVE`/`SUSPENDED`/`DISABLED`) is
checked in `SessionGuard` on **every request**, not only at login — otherwise a
block would take effect only at next sign-in.

## Known risks to verify (`PERMISSIONS.md` §3)

| #   | Risk                                                | Expected control                                                      |
| --- | --------------------------------------------------- | --------------------------------------------------------------------- |
| P2  | `PATCH /shops/me` mass assignment                   | strict DTO whitelist; `id`, `shopId`, `status` rejected               |
| P3  | Role escalation                                     | separate endpoint, SHOP_ADMIN only, **forbidden on self**             |
| P4  | `DELETE /auth/sessions/:id` deleting someone else's | query always `WHERE user_id = :currentUser`                           |
| P5  | `GET /files/:id` fetching any file                  | permission by `FileKind`; `PASSPORT` → SHOP_ADMIN only + audit (§6.7) |
| P6  | `/payments/:id`, `/installments/:id` IDOR           | ownership check                                                       |
| P7  | Cost-price leakage                                  | serialization groups (`@Expose({ groups: ['cost'] })`)                |
| P8  | Cross-Shop IDOR                                     | Prisma extension + RLS — **owned by `tenant-boundary-auditor`**       |
| P9  | SUPERADMIN reaching business data                   | separate table and session; no `shopId` exists for it                 |

## Mass-assignment denylist

These are **never** accepted from the client: `shopId`, `exchange_rate`,
`cost_snapshot`, `number`, `status`, `id`, `role`.
Validation is zod `.strict()` / `whitelist: true, forbidNonWhitelisted: true`.

## Files and PII

- No file is ever publicly reachable — the API issues a **15-minute signed
  URL** (§15.5).
- Max 10 MB, no automatic compression (§15.7).
- Upload: MIME allow-list, file-signature (magic byte) check, EXIF strip
  (`API.md` §7).
- **Every view of a passport image is written to `audit_logs`** (§6.7).

## Audit immutability

`audit_logs` grants for `hisobai_app` are `INSERT` and `SELECT` only —
`UPDATE`/`DELETE` are refused at the database. If they are grantable, the
"immutable audit" claim in `ARCHITECTURE.md` §5 is unbacked. This is a
DB-permission finding, not a code finding.

## AI module (§11)

The provider never gets a database connection. `AiInsights` computes the
aggregates itself and sends only that bounded JSON. The provider is read-only:
it cannot create, update or delete anything. Passport and phone data are
excluded from the context.

## Useful greps

```
@Public|@Roles|@PlatformOnly        authorization coverage
argon2|scrypt|bcrypt                password hashing
httpOnly|sameSite|secure            cookie flags
\$queryRaw|\$executeRaw             injection surface (also: template literals)
whitelist|forbidNonWhitelisted|strict\(\)   mass assignment
trust proxy|trustProxy              throttle correctness behind a proxy
Expose\(|groups:                    role-based serialization
mimetype|magic|exif                 upload validation
Retry-After|Throttle                rate limiting
```

## Reporting rules

Findings are ranked by **reachability**: an unauthenticated path outranks one
requiring an admin session. Every finding carries `file:line`. Describe the
attack at a high level — **never** write exploit code or step-by-step
exploitation instructions. Note what is done well, so the next person does not
"fix" a deliberate decision.
