# HisobAI CRM

Telefon do'konlari uchun ombor, savdo, nasiya, kassa va AI tahlil CRM'i.

**Holat:** v0.2.1 — **9-bosqich tugadi; MVP-2 shartnoma PDF'idan
tashqari yakunlandi** (§16.10, §17.17). Kesuvchi
poydevor (xato formati, validatsiya, idempotency, pul serializatsiyasi,
pagination, ruxsat, rate limiting), auth va sozlamalar, valyuta kursi,
katalog va ombor (kategoriya/brend birlashtirish bilan, mahsulot
shabloni, seriyali birlik va partiya, qabul qilish), mijozlar (E.164
normalizatsiyasi, dublikat tekshiruvi, belgilash va arxivlash), naqd
savdo va kassa (qoralama, tasdiqlash tranzaksiyasi, aralash to'lov,
kassa hisoblari va yozuvlari, boshlang'ich qoldiq, dashboard), platforma
va tenant izolyatsiya (RLS siyosatlari), qaytarish va bekor qilish,
nasiya va to'lovlar (muddatli jadval, maksimal qarz limit), hisobot va
audit ko'rinishi. Ekranlar: `/dashboard`, `/sales`, `/sales/new`,
`/sales/[id]`, `/installments`, `/installments/[id]`, `/cashbook`,
`/cashbook/new`, `/products`, `/inventory`, `/inventory/receive`,
`/customers`, `/reports`, `/reports/debts`, `/settings/catalog`,
`/settings/audit`, `/settings/security`, `/superadmin`. Keyingi bosqich
(10) — **shartnoma PDF va Storage (MinIO)**.

## Hujjatlar

| Fayl                                           | Nima uchun                                                                           |
| ---------------------------------------------- | ------------------------------------------------------------------------------------ |
| [`docs/DECISIONS.md`](docs/DECISIONS.md)       | Qabul qilingan qarorlar va ularning sabablari. **Ziddiyat chiqsa shu ustun turadi.** |
| [`docs/TZ.md`](docs/TZ.md)                     | Texnik topshiriq (v0.2.1) — nima qilinishi kerak                                     |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Texnik arxitektura (v0.2.1) — qanday qilinishi kerak                                 |
| [`docs/API.md`](docs/API.md)                   | API konventsiyalari: xato formati, pagination, idempotency, serializatsiya           |
| [`docs/FRONTEND.md`](docs/FRONTEND.md)         | Frontend arxitekturasi: papka tuzilmasi, holat boshqaruvi, formalar, PWA             |
| [`docs/files/design.md`](docs/files/design.md) | Dizayn tizimi: rang, tipografika, komponent qoidalari, brend fayllari                |
| [`docs/PERMISSIONS.md`](docs/PERMISSIONS.md)   | Ruxsat matritsasi va kirish nazorati qoidalari                                       |
| [`docs/GLOSSARY.md`](docs/GLOSSARY.md)         | Enum ↔ o'zbekcha atama lug'ati                                                       |

Kod va hujjatlardagi `§N.N` belgilari `DECISIONS.md`dagi qaror raqamiga
ishora qiladi. **§16** — 2026-08-09 auditidagi aniqlashtirishlar,
**§17** — kodlashdan oldingi blocker qarorlari.

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
  JSON'da ham pul **string** bo'lib uzatiladi (§17.7).
- **Kurs snapshot** — konvertatsiya bo'lgan joyda kurs saqlanadi va qayta
  hisoblanmaydi (§1.7). Qaytarish asl kursda bajariladi (§1.8).
- **Tasdiqlangan moliyaviy yozuv o'chirilmaydi** — faqat teskari yozuv.
- **Hisoblanadigan qiymat saqlanmaydi** — qarz qoldig'i va "muddati o'tgan"
  har safar tranzaksiyalardan hisoblanadi (§6.12, §9.8).
- **Kassaga pul faqat to'lov orqali tushadi** — savdo to'g'ridan-to'g'ri
  kassa yozuvi yaratmaydi (§17.2).
- **Moliyaviy `POST` idempotent** — `Idempotency-Key` majburiy (§17.6).
- **Ruxsat: default DENY** — `@Roles()` yoki `@Public()` yo'q endpoint
  hech kimga ochilmaydi.
- **Tenant chegarasi ikki qatlamda** — Prisma extension `shop_id` ni
  avtomatik qo'yadi, PostgreSQL RLS esa (`FORCE`, `USING` va `WITH CHECK`)
  uni mustaqil ravishda majburlaydi (§21.7, §21.13).
- **Tranzaksiya ichidan boshqa servisning `PrismaService`'iga so'rov yo'q** —
  `tx` ni uzat yoki qiymatni oldindan o'qi (§23.13).
- **UI'da faqat semantik rang tokenlari** — `bg-neutral-900` emas,
  `bg-surface-page`. Aks holda element bir mavzuda o'qilmas bo'ladi.
- Build artifaktlari (`.js`, `.d.ts`, `*.tsbuildinfo`) git'ga kirmaydi.
- Secretlar (`.env`, VAPID, SMS/AI kalitlari) hech qachon repoga kirmaydi.

## Eski versiyalar

v0.1 kodi o'chirilmagan, arxiv branchlarida:

| Branch                         | Nima                                        |
| ------------------------------ | ------------------------------------------- |
| `archive/v0.1`                 | 2026-08 gacha bo'lgan ishlaydigan v0.1 kodi |
| `archive/recovered-2026-07-26` | undan oldingi tiklangan snapshotlar         |
