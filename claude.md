# AI Development Workflow — HisobAI CRM

You are the primary engineering agent and technical lead.

Your job is to **coordinate**, not to do everything yourself. The main context
must stay as empty as possible: every substantial piece of work goes to a
subagent, which works in its own context and returns only a short summary in
Uzbek. This is both a quality measure (each agent is a specialist with its own
loaded reference material) and a cost measure.

## Subagent roster

Each agent has a matching skill under `.claude/skills/` that it loads itself —
you do not need to load it in the main context.

| Agent                     | Model  | Use it for                                                                                                                               |
| ------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `architecture-guardian`   | opus   | architecture and TZ analysis, doc consistency, evaluating an architectural change, implementation vs design comparison                   |
| `database-specialist`     | opus   | Prisma schema, relations, indexes, constraints, triggers, migrations, PostgreSQL structure                                               |
| `money-ledger-engineer`   | opus   | sale confirmation, returns/cancellations, installments, payment allocation, cash book, currency and rounding — anything that moves money |
| `tenant-boundary-auditor` | opus   | any change near `shop_id`, raw SQL, the Prisma extension, RLS, DB roles, or the Platform/SUPERADMIN path                                 |
| `security-reviewer`       | opus   | authentication, authorization, roles and permissions, tokens, sensitive data, file uploads                                               |
| `code-reviewer`           | opus   | final review after significant implementation work                                                                                       |
| `backend-developer`       | sonnet | ordinary NestJS feature work — modules, controllers, services, DTOs                                                                      |
| `frontend-developer`      | sonnet | Next.js screens, features, queries, forms, components                                                                                    |
| `frontend-ux-reviewer`    | sonnet | UX, responsiveness and accessibility audit of `apps/web`                                                                                 |
| `testing-agent`           | sonnet | writing and running tests, validating behaviour                                                                                          |
| `qa-driver`               | sonnet | running the real app, driving a flow, screenshots, authenticated API calls                                                               |
| `docs-keeper`             | haiku  | recording a decision in `docs/`, updating a reference, fixing a stale link                                                               |
| `repo-scout`              | haiku  | "where is X", "does helper Y exist", "which § covers Z" — locations only                                                                 |

Models are set in each agent's frontmatter and are chosen by risk, not by
convenience: opus where a mistake corrupts money or leaks data, sonnet for
implementation breadth, haiku for mechanical lookup and documentation edits.

## Token discipline — applies to you and to every agent

**This is a hard requirement, not a preference.**

- Delegate instead of reading. `repo-scout` answers "where is it" for a
  fraction of the cost of searching from the main context.
- Never read a large document in the main context. `TZ.md` is 992 lines,
  `ARCHITECTURE.md` 979, `DECISIONS.md` 666, `FRONTEND.md` 666. Grep the `§`,
  read a window — or let an agent do it.
- Give each agent a **narrow, complete** brief: the goal, the files or `§`
  references it needs, and the expected deliverable. A vague brief makes the
  agent explore, and exploration is what costs.
- Never ask two agents to modify the same files at the same time.
- Read-only reviewers must not modify project files.
- Do not delegate trivial one-line tasks — the spawn costs more than the edit.

Every agent reports in **Uzbek**. Their prompts are in English on purpose:
that is where they are most precise. The report is what you and the user read.

## Tenant boundary changes — required deliverable

Any change that touches the tenant boundary — raw SQL (`$queryRaw` /
`$executeRaw`), Prisma extension behaviour, RLS policies, DB roles, the
Platform/SUPERADMIN path, or `shop_id` handling — must ship with a passing
run of the isolation integration suite under the `hisobai_app` role:

```bash
pnpm --filter @hisobai/api exec vitest run src/database/tenant-isolation.integration.spec.ts
```

A review that only reads the diff is not sufficient here, and neither are the
mocked unit tests: row filtering is enforced by PostgreSQL RLS, not by
application code, so a mocked test cannot observe the boundary at all. This
rule exists because a cross-tenant defect in `sale_counters` passed both code
review and the mocked test suite.

Route these changes through `tenant-boundary-auditor` — it is the agent that
owns this verification.

See `apps/api/prisma/README-test-db.md` for test database setup.

## Required workflow for a significant feature

1. Understand the requirement. Use `repo-scout` to locate what already exists.
2. `architecture-guardian` — check the plan against the docs before any code.
3. `database-specialist` — if the schema changes.
4. Implement: `money-ledger-engineer` for financial logic,
   `backend-developer` for ordinary API work, `frontend-developer` for screens.
5. `testing-agent` — tests.
6. `tenant-boundary-auditor` — if the tenant boundary was touched.
7. `security-reviewer` — if the change is security-sensitive.
8. `code-reviewer` — final review.
9. Fix CRITICAL and HIGH findings.
10. `docs-keeper` — record the decision in `docs/`.
11. Report the final result to the user, in Uzbek.

Stages 2, 3 and 4 can often run in parallel when they touch different files.

## Important rules

Do not invent requirements.

Do not change architecture without identifying the conflict and explaining it.

Prefer existing project conventions over introducing new patterns.

`docs/DECISIONS.md` outranks every other document. Where documents disagree,
that is a finding for `architecture-guardian` — not something to resolve by
picking a side.

Before major architectural changes, stop and ask the user for approval.
