---
name: arch-guard
description: The HisobAI document set, its precedence order, and the architectural invariants that must never drift — money representation, immutability of confirmed operations, computed-not-stored values, module boundaries, staged delivery. Load before an architecture review.
---

## Document precedence — never invert

1. **`docs/DECISIONS.md`** — the decision log. Wins over everything.
2. `docs/ARCHITECTURE.md` (design) and `docs/TZ.md` (requirement).
3. `docs/API.md`, `docs/PERMISSIONS.md`, `docs/FRONTEND.md`,
   `docs/GLOSSARY.md`, `docs/files/design.md` — cross-cutting contracts.
4. The code.

Code disagreeing with 1–3 is a defect. **Documents disagreeing with each other
is a higher-severity defect**, because every downstream decision inherits the
ambiguity.

Section line numbers for all documents: see the `repo-map` skill. Grep the `§`,
read a window — never read a document whole.

## What the system is

A phone-shop CRM: catalog, warehouse (serialized units + batches), customers,
cash sales, returns/cancellations, installment contracts, payments, cash book,
reports, AI insights. Multi-currency UZS/USD. Multi-tenant SaaS, one
SHOP_ADMIN per Shop, plus a separate platform SUPERADMIN.

Built as a **modular monolith**: simple deploy, one transactional PostgreSQL,
but module boundaries drawn so a module can later split out.

## Invariants that must never drift

| #   | Invariant                                                                           | Why it exists                                                                       |
| --- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | Money is `Decimal`, serialized as a string, rounded before writing, `ROUND_HALF_UP` | float error makes distributed parts stop summing to the total                       |
| 2   | Every money column travels with its own currency column                             | a naked amount is unreadable across two currencies                                  |
| 3   | Rate and cost snapshots are never recomputed                                        | otherwise a rate change today rewrites last month's profit                          |
| 4   | A confirmed operation is never edited or deleted — only reversed                    | an audited ledger cannot have history rewritten                                     |
| 5   | Computed values are never stored: customer debt, `outstanding_amount`, "overdue"    | two places holding one truth eventually disagree; a stopped job would display a lie |
| 6   | A module never writes into another module's tables                                  | the sale-confirmation transaction is the one sanctioned cross-module path           |
| 7   | Everything that must be consistent lives in one `$transaction`, audit included      | an interceptor runs outside the transaction and could lose the audit row            |
| 8   | Shop context is automatic and never client-supplied                                 | 93 files × one forgotten filter = cross-Shop IDOR                                   |
| 9   | SUPERADMIN has no `shopId` at all                                                   | a structural guarantee beats a per-request `if`                                     |
| 10  | Stock is claimed with a conditional `UPDATE` + `rowCount` check                     | `SELECT` then `UPDATE` sells one unit twice under `READ COMMITTED`                  |
| 11  | Cash enters the till only through a CONFIRMED payment                               | two write paths would let one payment be counted twice                              |
| 12  | There is no customer balance — overpayment is rejected                              | money held in the till for a customer is an untracked liability                     |
| 13  | DB `CHECK` constraints are the last line of defence against code bugs               | application code is not the only writer                                             |
| 14  | The frontend computes no financial value                                            | one source of truth, one rounding implementation                                    |

## Deliberate non-goals

No discount field, no tax, no shipping (hence `sales.subtotal` was removed).
No offline writes. No i18n library — Uzbek only in MVP. No global client state
store. No Server Actions. No `POST /sales/:id/reverse` — return and cancel are
different business acts, and the API reflects that.

## Staged delivery (`TZ.md` §22, `ARCHITECTURE.md` §13)

0 decisions → 1 cross-cutting foundation → 2 auth+settings → 3 catalog+inventory
→ 4 customers → 5 cash sale + cash book → **6 platform + tenant isolation** →
7 reversal → 8 installments + payments → 9 reports + audit view →
10 documents + storage → 11 stocktake/personal use/exchange → 12 PWA + push +
SMS → 13 AI insights → 14 production hardening.

Stages 0–9 are complete. Two ordering decisions are load-bearing and should not
be re-litigated without a new decision entry:

- **Foundation before features**: fixing a document contradiction before code
  is cheap; retrofitting cross-cutting conventions means revisiting every module.
- **Tenant layer before MVP-2**: the four hardest transactional modules were
  still unwritten. Writing them single-tenant first would mean revisiting every
  transaction, report query and `CHECK` constraint afterwards.

Work that pulls a later stage forward is a finding unless a decision authorises it.

## Review discipline

- Do not invent requirements. If the docs are silent, mark it "hujjatda yo'q"
  as an open question.
- If the docs are ambiguous, quote both readings — do not pick one.
- Separate "violates the design" from "I would have designed it differently".
  Only the first is a finding.
- Every finding carries a locator: `file:line` or a `§`. No locator, no finding.
