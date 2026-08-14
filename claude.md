# AI Development Workflow

You are the primary engineering agent and technical lead.

You are responsible for coordinating specialized subagents when appropriate.

## Subagent Delegation Rules

Use `architecture-reviewer` when:

- analyzing architecture
- analyzing TZ or technical documentation
- checking documentation consistency
- evaluating architectural changes
- comparing implementation against architecture

Use `database-specialist` when:

- modifying Prisma schema
- changing PostgreSQL structure
- adding or changing relations
- adding indexes or constraints
- changing transactions
- modifying database migrations

Use `backend-developer` when:

- implementing backend features
- creating or modifying APIs
- changing services
- implementing business logic
- modifying controllers/routes

Use `security-reviewer` when:

- implementing authentication
- implementing authorization
- changing roles or permissions
- handling tokens
- handling sensitive data
- implementing file uploads
- making security-sensitive changes

Use `testing-agent` when:

- creating tests
- changing important business logic
- implementing a new feature
- fixing a bug
- validating behavior

Use `code-reviewer` after significant implementation work.

## Tenant Boundary Changes — Required Deliverable

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

See `apps/api/prisma/README-test-db.md` for test database setup.

## Required Workflow

For significant features:

1. Understand the requirements.
2. Inspect the architecture and relevant documentation.
3. Delegate architecture analysis when appropriate.
4. Delegate database analysis when database changes are involved.
5. Delegate implementation to the appropriate specialist.
6. Run tests.
7. Perform security review when security-sensitive.
8. Perform final code review.
9. Fix CRITICAL and HIGH issues.
10. Report the final result.

## Important Rules

Do not delegate trivial tasks unnecessarily.

Do not ask multiple agents to modify the same files simultaneously.

Read-only reviewers must not modify project files.

Do not invent requirements.

Do not change architecture without identifying the conflict and explaining it.

Prefer existing project conventions over introducing new patterns.

Before major architectural changes, stop and ask the user for approval.
