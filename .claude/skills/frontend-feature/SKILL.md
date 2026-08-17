---
name: frontend-feature
description: How a screen is built in the HisobAI Next.js app — folder anatomy, api-client, TanStack Query keys and invalidation, forms with zod, the four request states, design tokens and mobile rules. Load before implementing anything in apps/web.
---

Stack: Next.js 16 App Router, React 19, TypeScript, TanStack Query v5,
react-hook-form + zod (schemas from `@hisobai/contracts`), Tailwind v4,
lucide-react, date-fns. Source: `docs/FRONTEND.md`, `docs/files/design.md`.

Pages are `'use client'` — the data is session-bound and private, so SSR
caching buys nothing. Server Components carry the static shell only.

## Folder anatomy

```
apps/web/src/
  app/(auth)/login  (auth)/reset-password
  app/(app)/…       dashboard sales inventory products customers
                    installments cashbook reports settings
  app/(setup)/setup-shop
  app/(superadmin)/…            fully separate route group, own layout+client
  features/<domain>/
    api.ts          request functions (call api-client, never fetch)
    queries.ts      useQuery / useMutation hooks + key factory
    schemas.ts      form zod schemas, built on @hisobai/contracts
    components/     the actual UI
    utils.ts
  components/ui | layout | states | money
  lib/  api-client.ts · api-error.ts · query-client.ts · format.ts
        messages.ts · permissions.ts
  hooks/
```

**`app/` contains no business logic.** A page composes components from
`features/`, so logic does not move when a route changes.

## `lib/api-client.ts` — the only network entry point

Never call `fetch` directly. The client handles:
`credentials: 'include'` · `X-CSRF-Token` · `Idempotency-Key` on financial
POSTs · throwing `ApiError` (`code`, `message`, `field`, `details`, `requestId`)
· `401` → clear the query cache and redirect to `/login` · network failure →
`NETWORK_ERROR`.

## Error → UI (`FRONTEND.md` §5.2)

Decisions key off the **`code`**, never the message text.

| Error                 | UI                                                    |
| --------------------- | ----------------------------------------------------- |
| `VALIDATION_FAILED`   | map `details.issues` onto react-hook-form fields      |
| 409 business conflict | red banner above the form + mark the offending row    |
| 422 business rule     | same, but no "retry" — the request must change        |
| `401`                 | redirect, no toast                                    |
| `403`                 | "Bu amalga ruxsatingiz yo'q", page level              |
| `429`                 | show remaining time from `Retry-After`                |
| `NETWORK_ERROR` / 5xx | "Server javob bermadi. Qayta urinib ko'ring." + retry |

All strings live in `lib/messages.ts`, keyed by `code`. Server text is the
fallback, never the contract.

## Query keys and invalidation (`FRONTEND.md` §5.3)

```ts
export const salesKeys = {
  all: ['sales'] as const,
  list: (filters: SalesFilters) => [...salesKeys.all, 'list', filters] as const,
  detail: (id: string) => [...salesKeys.all, 'detail', id] as const,
};
```

A financial action touches several domains — invalidate deliberately:

| Action                  | Invalidate                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------- |
| Sale confirm            | `sales`, `inventory`, `cashbook`, `dashboard`, `customers.detail`, + `installments` if credit |
| Payment taken/confirmed | `payments`, `installments`, `cashbook`, `dashboard`, `customers.detail`                       |
| Return / cancel         | same list as sale confirm                                                                     |
| Inventory receive       | `inventory`, `products`, `dashboard`                                                          |
| Cash entry              | `cashbook`, `dashboard`                                                                       |
| Rate change             | `exchangeRates`, `dashboard` — **not sales**                                                  |

The last row matters: sales are frozen at their snapshot rate. Invalidating
them would be a misreading of "computed values are not stored".

## The six principles (`FRONTEND.md` §1)

1. **Phone first** — design at 375px; laptop is the extension.
2. **Server is the source of truth** — profit, debt, balance all come from the
   API. If a screen needs a number the API does not expose, stop and report;
   do not compute it client-side.
3. **Money is never a `number`** — it arrives as a string and is formatted via
   `@hisobai/contracts`. No money arithmetic in the client.
4. **No optimistic updates on financial actions** — wait for the server. A
   false "success" is the worst possible outcome.
5. **Four states per request** — loading · error · empty · data, all designed.
6. **No offline writes** — offline is shell and read cache only.

## Deliberately rejected (`FRONTEND.md` §2)

Redux/Zustand/Jotai (server state is TanStack Query's job; a second store is a
second truth) · Server Actions (business logic would split across two runtimes)
· SSR/ISR for data · CSS-in-JS · an i18n library (Uzbek only in MVP; text is
centralised in `messages.ts`).

## Navigation (`FRONTEND.md` §4)

- Phone (< 768px): bottom bar with 5 items — Boshqaruv · Savdo · Ombor ·
  Mijozlar · Yana. "Yana" opens a sheet with the rest.
- Laptop (≥ 768px): left sidebar, everything visible.
- Both: shop name, today's rate (CBU + shop), and a warning bar when the rate
  is stale.
- **One** floating button, "Yangi savdo", bottom right, on every page. No other
  FAB is added.
- `PageHeader` handles the title and back — it uses browser history; we do not
  build our own stack.

## Styling

Tokens from `design.md` §3 live in `app/globals.css` (`@theme`). Use them — no
hardcoded hex, no arbitrary spacing. Touch targets ≥ 44×44px (`design.md` §6).
Tables must survive 375px without horizontal page scroll — reflow to cards.

Filters, date ranges and pagination cursors live in the URL via
`useSearchParams`, so links are shareable and Back works.

## Verification

```bash
pnpm --filter @hisobai/web typecheck
pnpm --filter @hisobai/web lint
```

To see it running, use the `run-hisobai` skill or hand off to `qa-driver`.

## Style

English identifiers, **Uzbek comments** citing the governing `§` — as in
`lib/api-client.ts`. All UI text in Uzbek, via `lib/messages.ts`.
