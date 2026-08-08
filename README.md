# HisobAI CRM

Telefon do'konlari uchun ombor, savdo, nasiya, kassa va AI tahlil CRM'i.

**Holat:** v0.2 poydevor bosqichi — monorepo skeleti va to'liq ma'lumotlar
bazasi schema'si tayyor. Biznes modullari `docs/TZ.md` §22 dagi tartibda
qo'shiladi.

## Hujjatlar

| Fayl                                           | Nima uchun                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| [`docs/DECISIONS.md`](docs/DECISIONS.md)       | Qabul qilingan qarorlar va ularning sabablari. **Ziddiyat chiqsa shu ustun turadi.** |
| [`docs/TZ.md`](docs/TZ.md)                     | Texnik topshiriq (v0.2) — nima qilinishi kerak                                       |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Texnik arxitektura (v0.2) — qanday qilinishi kerak                                   |

Kod va hujjatlardagi `§N.N` belgilari `DECISIONS.md`dagi qaror raqamiga
ishora qiladi.

## Texnologiyalar

pnpm workspace · NestJS 11 · Next.js 16 · React 19 · Prisma 7 ·
PostgreSQL · TypeScript 5.9 · Vitest 4

```text
apps/api        NestJS API (Prisma, PostgreSQL)
apps/web        Next.js PWA
packages/contracts          API va web uchun umumiy enumlar va tiplar
packages/typescript-config  umumiy tsconfig
packages/eslint-config      umumiy lint qoidalari
```

## Lokal ishga tushirish

Talab qilinadi: Node.js ≥ 22, pnpm 11, lokal PostgreSQL.
Development'da Docker ishlatilmaydi (§0.3).

```bash
pnpm install
cp apps/api/.env.example apps/api/.env      # DATABASE_URL va ADMIN_* ni to'ldiring
cp apps/web/.env.example apps/web/.env      # ixtiyoriy

# Bazani yaratish (bir marta)
psql -h localhost -U postgres -c 'create database hisob_ai;'

pnpm db:generate
pnpm db:migrate
pnpm db:seed

pnpm dev
```

- Web: `http://localhost:3000`
- API: `http://localhost:4000/api/v1`
- Swagger: `http://localhost:4000/api/docs` (versiya segmentisiz)

## Skriptlar

```bash
pnpm dev          # api va web parallel
pnpm build        # contracts -> api -> web
pnpm typecheck    # barcha workspace'lar
pnpm lint
pnpm test
pnpm format
```

## Muhim qoidalar

- **Pul hech qachon `number` bilan hisoblanmaydi** — Prisma `Decimal`,
  `numeric(18,2)`. Har pul ustuni o'z valyuta ustuni bilan yuradi.
- **Kurs snapshot** — konvertatsiya bo'lgan joyda kurs saqlanadi va qayta
  hisoblanmaydi (§1.7). Qaytarish asl kursda bajariladi (§1.8).
- **Tasdiqlangan moliyaviy yozuv o'chirilmaydi** — faqat teskari yozuv.
- **Hisoblanadigan qiymat saqlanmaydi** — qarz qoldig'i va "muddati o'tgan"
  har safar tranzaksiyalardan hisoblanadi (§6.12, §9.8).
- Build artifaktlari (`.js`, `.d.ts`, `*.tsbuildinfo`) git'ga kirmaydi.
- Secretlar (`.env`, VAPID, SMS/AI kalitlari) hech qachon repoga kirmaydi.

## Eski versiyalar

v0.1 kodi o'chirilmagan, arxiv branchlarida:

| Branch                         | Nima                                        |
| ------------------------------ | ------------------------------------------- |
| `archive/v0.1`                 | 2026-08 gacha bo'lgan ishlaydigan v0.1 kodi |
| `archive/recovered-2026-07-26` | undan oldingi tiklangan snapshotlar         |
