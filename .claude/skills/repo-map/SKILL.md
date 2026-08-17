---
name: repo-map
description: Pre-built map of the HisobAI monorepo and its documentation set — where every module, service, feature folder and doc section lives, with line numbers. Use to locate code or a § reference without searching.
---

Answer from this map first. Search only when the map does not cover it.
All paths are relative to the repo root.

## Monorepo

```
apps/api        NestJS 11 + Prisma 7 + PostgreSQL, port 4000, /api/v1
apps/web        Next.js 16 App Router + React 19, port 3000
packages/contracts        zod schemas, enums, money helpers, DTO types
packages/eslint-config    shared lint rules
packages/typescript-config shared tsconfig
docs/           TZ, ARCHITECTURE, DECISIONS, API, PERMISSIONS, FRONTEND, GLOSSARY
docs/files/design.md      design system
docs/proposals/v0.2.1-migration.sql   reference CHECK constraint set
```

Root scripts: `pnpm dev` (both apps parallel), `build`, `typecheck`, `lint`,
`test`, `db:generate`, `db:migrate`, `db:deploy`, `db:seed`, `db:studio`.

## API modules — `apps/api/src/`

| Folder             | Holds                                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `common/`          | exception filter, zod pipe, guards (session, roles, csrf), idempotency interceptor, decimal serializer, pagination, dates, optimistic lock, search |
| `database/`        | `prisma.service.ts`, `shop-context.ts`, tenant isolation + raw-SQL audit specs                                                                     |
| `config/`          | env schema                                                                                                                                         |
| `auth/`            | login, sessions, throttling, password reset                                                                                                        |
| `platform/`        | SUPERADMIN, `platform_admins`, shop-admin management                                                                                               |
| `shops/`           | Shop entity, `/shops/me` settings                                                                                                                  |
| `exchange-rates/`  | CBU sync, shop rate                                                                                                                                |
| `catalog/`         | categories, brands, products (`product.service.ts`, `taxonomy.service.ts`)                                                                         |
| `inventory/`       | serialized items, batches, movements, receiving                                                                                                    |
| `customers/`       | customer card, phone dedupe, passport                                                                                                              |
| `sales/`           | `sales.service.ts`, `sale-confirmation.service.ts`, `sale-reversal.service.ts`, `sales.mappers.ts`                                                 |
| `installments/`    | contracts, schedules                                                                                                                               |
| `payments/`        | `payments.service.ts`, `allocation.service.ts`                                                                                                     |
| `cash/`            | cash accounts, entries, exchanges                                                                                                                  |
| `reports/`         | `reports.service.ts`, `dashboard.service.ts`                                                                                                       |
| `audit/`           | `audit.service.ts`                                                                                                                                 |
| `health/`, `mail/` | health endpoints, mail port                                                                                                                        |

`apps/api/prisma/`: `schema.prisma` (~1358 lines), `migrations/`, `seed.mts`,
`README-test-db.md` (test DB setup for the isolation suite).

36 `*.spec.ts` files sit next to their source.

## Web — `apps/web/src/`

```
app/(auth)/login  (auth)/reset-password
app/(app)/        dashboard sales inventory products customers
                  installments cashbook reports settings
app/(setup)/setup-shop
app/(superadmin)/superadmin   (superadmin-auth)/superadmin
features/         auth cashbook catalog customers dashboard exchange-rates
                  installments inventory platform reports sales shops
                  — each: api.ts · queries.ts · schemas.ts · components/ · utils.ts
components/       ui/ layout/ states/ money/
lib/              api-client.ts · api-error.ts · query-client.ts · format.ts
                  messages.ts · permissions.ts
hooks/
```

Rule: `app/` holds routes and shell only; business logic lives in `features/`.

## Doc index — grep the heading, then Read a window

**`docs/TZ.md`** (992 lines) — the requirement

| §                   | Line | §                           | Line |
| ------------------- | ---- | --------------------------- | ---- |
| 1 Maqsad            | 14   | 14 Kalkulator               | 285  |
| 2 Foydalanuvchi     | 23   | 15 Hisobotlar               | 296  |
| 3 Valyuta           | 38   | 16 Dashboard                | 312  |
| 4 Kirish/xavfsizlik | 73   | 17 Hujjatlar/fayllar        | 324  |
| 5 Sozlamalar        | 85   | 18 Bildirishnomalar         | 340  |
| 6 Katalog           | 98   | 19 AI tahlil                | 349  |
| 7 Ombor             | 117  | 20 Dizayn/UX                | 368  |
| 8 Mijozlar          | 135  | 21 Ishonchlilik             | 377  |
| 9 Savdo             | 152  | 22 Bosqichlar               | 383  |
| 10 Qaytarish/bekor  | 196  | 23 Scope tashqari           | 446  |
| 11 Nasiya           | 219  | 24 Ochiq savollar           | 457  |
| 12 To'lovlar        | 240  | 25 Platforma/Shop isolation | 469  |
| 13 Kassa            | 267  |                             |      |

**`docs/ARCHITECTURE.md`** (979 lines) — the design

| §                     | Line | §                          | Line |
| --------------------- | ---- | -------------------------- | ---- |
| 1 Maqsad              | 17   | 9 Fayl saqlash             | 475  |
| 2 Monorepo            | 42   | 10 Fon jarayonlari         | 486  |
| 3 Texnologiya         | 64   | 11 AI xavfsizligi          | 508  |
| 4 Pul va valyuta      | 83   | 12 Xavfsizlik/testlar      | 523  |
| 5 Backend modullari   | 111  | 13 Kodlash tartibi         | 579  |
| 6 Moliyaviy yaxlitlik | 142  | 14 Multi-tenant            | 643  |
| 7 Ma'lumotlar modeli  | 225  | 14.3 Platforma ajratilishi | 699  |
| 8 API                 | 393  | 14.4 Shop konteksti + RLS  | 724  |
|                       |      | 14.5 Model o'zgarishlari   | 844  |
|                       |      | 14.6 Kurs modeli           | 917  |
|                       |      | 14.7 API/sahifalar         | 940  |
|                       |      | 14.8 Xatolar               | 965  |

**`docs/DECISIONS.md`** (666 lines) — **outranks every other doc**

| §                 | Line | §                        | Line |
| ----------------- | ---- | ------------------------ | ---- |
| 0 Loyiha          | 10   | 13 Hisobotlar            | 365  |
| 1 Valyuta         | 21   | 14 Dashboard             | 391  |
| 2 Kirish/sessiya  | 38   | 15 Hujjatlar/fayllar     | 413  |
| 3 Sozlamalar/kurs | 64   | 16 Aniqlashtirishlar     | 436  |
| 4 Katalog         | 90   | 17 Blocker qarorlari     | 472  |
| 5 Ombor           | 125  | 18 3-bosqich             | 500  |
| 6 Mijozlar        | 152  | 19 4-bosqich             | 514  |
| 7 Savdo (naqd)    | 181  | 20 5-bosqich             | 528  |
| 8 Qaytarish/bekor | 223  | 21 6-bosqich (tenant)    | 544  |
| 9 Nasiya          | 254  | 22 7-bosqich (qaytarish) | 601  |
| 10 To'lovlar      | 283  | 23 8-bosqich (nasiya)    | 619  |
| 11 Kassa          | 320  | 24 9-bosqich (hisobot)   | 641  |
| 12 Kalkulator     | 348  | Ochiq savollar           | 660  |

**`docs/API.md`** (451 lines) — 1 Asoslar 13 · 2 Serializatsiya 33
(2.1 pul=string 35, 2.2 sana 64, 2.3 id 91, 2.4 bo'sh 97) ·
3 Xato formati 104 (3.1 HTTP 132, 3.2 validatsiya 151, 3.3 qisman 169,
**3.4 xato kodlari registri 190**) · 4 Idempotency 227 ·
5 Pagination/filtr/sort 278 · 6 Rate limiting 340 · 7 Fayl yuklash 359 ·
8 Optimistik qulf 374 · 9 Sarlavhalar 424 · 10 Health 446

**`docs/FRONTEND.md`** (666 lines) — 1 Tamoyillar 15 · 2 Texnologiya 31 ·
3 Papka tuzilmasi 64 · 4 Navigatsiya 121 · 5 Ma'lumot qatlami 137
(5.1 api-client 139, 5.2 xato→UI 156, 5.3 query kalitlari 174,
5.4 idempotency 201, 5.5 pagination 212, 5.6 yangilash 218) ·
6 Formalar 238 · 7 Holatlar 272 · 8 Dizayn tizimi 289 (8.1 dark 295,
8.2 raqamlar 422) · 9 Rolga bog'liq ko'rinish 433 · 10 PWA/offline 458 ·
11 Erishimlilik 471 · 12 Ishlash budjeti 487 · 13 Testlash 499 ·
14 Yozish tartibi 513 · 15 Shrift/brend 530 · 16 Qarorlar holati 655

**`docs/PERMISSIONS.md`** (149) — 1 Mexanizm 17 · 2 Matritsa 30 ·
3 Risklar 87 · 4 DB rollari 100 · 5 SUPERADMIN 110

**`docs/GLOSSARY.md`** (172) — Valyuta 12 · Foydalanuvchi 24 · Katalog/ombor 43 ·
Savdo 70 · Nasiya 93 · To'lovlar 114 · Kassa 130 · Fayl/hujjat 152

**`docs/files/design.md`** — 1 Brend 7 · 2 Ranglar 28 · 3 CSS o'zgaruvchilar 71 ·
4 Tipografika 124 · 5 Interval/burchak 147 · 6 Komponent qoidalari 160 ·
7 Matn uslubi 171

## Delivery stage

`TZ.md` §22. Stages 0–9 are done (foundation, auth, catalog+inventory,
customers, cash sale + cash book, platform + tenant isolation, reversal,
installments + payments, reports + audit view).
Next: **10 — Documents (contract PDF) and Storage (MinIO)**, then 11 stocktake
/ personal use / currency exchange, 12 PWA + push + SMS, 13 AI insights,
14 production hardening.
