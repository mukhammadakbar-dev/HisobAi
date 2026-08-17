---
name: qa-smoke
description: The HisobAI smoke paths worth driving in the running app, with the expected result for each, plus environment gotchas. Companion to the run-hisobai skill, which holds the actual startup and driver commands.
---

**The `run-hisobai` skill is the authoritative procedure** for ports, startup,
readiness polling, the login driver at `.claude/skills/run-hisobai/driver.mjs`,
screenshots, authenticated REST calls and teardown. Invoke it first. This file
only says _what to check_ once the app is up.

API on 4000 (`/api/v1`), web on 3000. Local PostgreSQL, no Docker.

## Environment gotchas

- The driver reads `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `apps/api/.env` and
  those must match what `db:seed` created. On an unseeded database the driver
  cannot log in.
- `db:seed` is idempotent — re-running it creates no duplicates.
- Wait by polling the port (`/api/v1/health/live`, `/login`), never with a
  blind `sleep`.
- `next dev` is a three-layer process — `lsof -ti:PORT` is unreliable for
  teardown. Use the skill's stop procedure.
- If the environment will not come up, report the blocker and stop. Never
  report a flow as working when you could not run it.

## Smoke paths

| #   | Path                       | Expected                                                                                              |
| --- | -------------------------- | ----------------------------------------------------------------------------------------------------- |
| 1   | Login → `/dashboard`       | KPI blocks render; a failed block does not blank the page                                             |
| 2   | Header rate line           | CBU + shop rate shown; the stale-rate bar appears when the rate is old                                |
| 3   | Catalog → create product   | validation errors appear inline, in Uzbek                                                             |
| 4   | Inventory → receive        | serialized unit and batch both accepted; IMEI duplicate refused                                       |
| 5   | Customer → create          | duplicate phone refused with a clear message                                                          |
| 6   | **Sale → draft → confirm** | sale number appears only after confirm; stock drops; a cash entry appears only for CONFIRMED payments |
| 7   | Sale → return              | a **separate** reversal row with `-R1`, negative total; the original is not edited                    |
| 8   | Installment → payment      | allocation starts from the oldest unpaid row; overpayment refused with `PAYMENT_EXCEEDS_OUTSTANDING`  |
| 9   | Cash book                  | balance per account and currency; a non-`MANUAL` entry is not editable                                |
| 10  | Reports                    | period figures match the dashboard; profit uses the snapshot rate                                     |
| 11  | `/superadmin`              | separate login; a business endpoint returns 403 for SUPERADMIN                                        |
| 12  | Setup flow                 | an account without a Shop is redirected to `/app/setup-shop` (`SHOP_SETUP_REQUIRED`, 409)             |

## What to verify on any screen

- Renders at **375px** and at desktop width, with no horizontal page scroll.
- Money is shown with its currency and matches what the API returned.
- Loading is a **skeleton**, not a spinner. Empty state names the next action.
- A financial action waits for the server — no premature success message.
- The error path shows Uzbek text driven by the error `code`, not raw server
  prose.
- Double-submitting a financial form does not create two records
  (`Idempotency-Key`).

## Evidence discipline

Report status codes, error `code` values and screenshot paths. Never paste
server logs, HTML or full JSON — at most the status code and 2–3 relevant
fields. Take the fewest screenshots that prove the claim.

**Never modify application code.** You verify; you do not fix. A defect is
reported with reproduction steps and handed back.
