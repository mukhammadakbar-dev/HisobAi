---
name: run-hisobai
description: Build, run, and drive HisobAI CRM (NestJS API + Next.js web). Use when asked to start the app or dev servers, take a screenshot of a page, click through a screen, call the API with authentication, run migrations/seed, or run the tests.
---

HisobAI — pnpm monorepo: `apps/api` (NestJS, port 4000) va `apps/web`
(Next.js, port 3000). Ikkalasi birga ishlashi kerak: web'dagi hamma
ma'lumot API'dan keladi. Haydash uchun
`.claude/skills/run-hisobai/driver.mjs` — u login qiladi, sahifalarni
ochib screenshot oladi va autentifikatsiyalangan REST chaqiruvlarini
yuboradi.

Barcha yo'llar repo ildiziga nisbatan.

## Prerequisites

- Node ≥ 22, pnpm 11 (`packageManager` maydonida qotirilgan)
- **Lokal PostgreSQL** — Docker ishlatilmaydi (§0.3)
- Screenshot uchun tizimda chromium. Driver `/snap/bin/chromium`,
  `/usr/bin/chromium`, `/usr/bin/chromium-browser`, `/usr/bin/google-chrome`
  ni shu tartibda qidiradi; boshqa joyda bo'lsa `CHROMIUM_BIN=...`.

```bash
pg_isready -h localhost          # "accepting connections" bo'lishi kerak
```

Playwright repo bog'liqligi **emas**: driver uni topolmasa
`/tmp/hisobai-run/deps` ga o'zi o'rnatadi (bir marta, ~20 s).
Brauzer yuklab olinmaydi — tizimdagisi ishlatiladi.

## Setup

```bash
pnpm install
cp apps/api/.env.example apps/api/.env    # DATABASE_URL va ADMIN_* ni to'ldiring
psql -h localhost -U postgres -c 'create database hisob_ai;'
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

`db:seed` idempotent — qayta ishlatsa dublikat yaratmaydi. U egani
`ADMIN_EMAIL`/`ADMIN_PASSWORD` bo'yicha yaratadi va **driver aynan shu
ikki qiymatni `apps/api/.env` dan o'qiydi**. Seed qilinmagan bazada
driver login qila olmaydi.

## Run (agent path)

Ikkala serverni fonda ko'tarib, tayyor bo'lishini kutib turing —
`sleep` emas, portni so'rang:

```bash
pnpm --filter @hisobai/api dev > /tmp/hisobai-api.log 2>&1 &
pnpm --filter @hisobai/web dev > /tmp/hisobai-web.log 2>&1 &
timeout 120 bash -c 'until curl -sf http://localhost:4000/api/v1/health/live >/dev/null; do sleep 2; done'
timeout 120 bash -c 'until curl -sf http://localhost:3000/login >/dev/null; do sleep 2; done'
```

To'xtatish. **`lsof -ti:PORT` bu yerda ishonchsiz** — `next dev` uch
qatlamli jarayon (`sh` → `next` → `next-server`) va lsof tinglovchini
topmay qolishi mumkin; `pkill -f 'next dev'` esa xavfli (naqsh sizning
o'z shell buyrug'ingizga ham tushadi). Ishlaydigan yo'l — `ss` dan pid:

```bash
for port in 3000 4000; do
  ss -ltnp 2>/dev/null | grep ":$port " | grep -oP 'pid=\K[0-9]+' | xargs -r kill -9
done
```

Keyin driver:

```bash
node .claude/skills/run-hisobai/driver.mjs smoke
```

| buyruq                      | nima qiladi                                                                                                                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `smoke`                     | login → `/dashboard`, `/products`, `/inventory`, `/customers`, `/settings`, `/settings/catalog` → har biriga screenshot; console xatosi bo'lsa exit 1 |
| `shot <yo'l> [nom]`         | bitta sahifani ochib screenshot oladi: `shot /inventory/receive qabul`                                                                                |
| `api <METOD> <yo'l> [json]` | autentifikatsiyalangan REST chaqiruvi: `api POST /brands '{"name":"Samsung"}'`                                                                        |

Artefaktlar: screenshot'lar → `/tmp/hisobai-run/screenshots/`, brauzer
sessiyasi → `/tmp/hisobai-run/state.json`, API cookie'lari →
`/tmp/hisobai-run/api-cookies.json`. Sessiyani qayta olish uchun shu
katalogni o'chiring.

Kutilgan natija:

```
✓ /dashboard → /tmp/hisobai-run/screenshots/dashboard.png
...
✓ /settings/catalog → /tmp/hisobai-run/screenshots/settings-catalog.png

console: xato yo'q
```

**Screenshot'ga qarang.** Bo'sh yoki xato sahifasi ko'rinsa — ishga
tushmagan, "smoke o'tdi" degani yetarli emas.

`api` buyrug'i REST qatlamini to'g'ridan-to'g'ri urish uchun: servis
mantiqiga tegadigan o'zgarishni tekshirishda brauzerni ochish shart
emas. U CSRF cookie'sini oladi, kerak bo'lsa login qiladi va har
mutatsiyaga `Idempotency-Key` qo'yadi.

## Run (human path)

```bash
pnpm dev    # api va web parallel; Ctrl-C to'xtatadi
```

Web: `http://localhost:3000` · API: `http://localhost:4000/api/v1` ·
Swagger: `http://localhost:4000/api/docs`.

## Test

```bash
pnpm test        # api 198 + contracts 112 test, hammasi o'tadi; web'da test yo'q
pnpm typecheck
pnpm lint
pnpm format:check
pnpm build       # contracts → api → web
```

Testlar bazani talab qilmaydi (Prisma mock'lanadi), shuning uchun
serverlarsiz ham ishlaydi.

## Gotchas

- **Login 5 urinish / 15 daqiqa bilan cheklangan** (`API.md` §6). Driver
  shuning uchun sessiyani `/tmp/hisobai-run/` ga saqlaydi. Baribir `429`
  chiqsa — throttler **xotirada**, ya'ni API'ni qayta ishga tushirish uni
  darhol tozalaydi (kutish shart emas). `login_attempts` jadvalidagi §2.9
  bloki esa boshqa mexanizm: u bazada qoladi va faqat noto'g'ri **parol**
  bilan urinishda yig'iladi.
- **Har mutatsiya CSRF cookie'sini talab qiladi** (double-submit,
  `API.md` §1). Cookie'ni server istalgan javobda qo'yadi, shuning uchun
  `curl` bilan ishlaganda avval `GET /health/live` chaqiring va
  `hisobai_csrf` qiymatini `X-CSRF-Token` sarlavhasida qaytaring — usiz
  `403 AUTH_CSRF_INVALID`.
- **`PATCH` optimistik qulfsiz ishlamaydi**: `expectedUpdatedAt` (body)
  yoki `If-Unmodified-Since` (sarlavha) bo'lmasa `428 PRECONDITION_REQUIRED`
  keladi (`API.md` §8). Avval `GET` bilan `updatedAt` ni oling.
- **`POST /inventory/receive` `Idempotency-Key` siz `400` beradi** (§17.6).
  Driver uni har mutatsiyaga qo'yadi.
- **Pul JSON'da satr** (`"12500000.00"`), hech qachon `number` (§17.7) —
  javobni tekshirayotganda solishtirishni satr bilan qiling.
- **Next dev marshrutni birinchi so'rovda kompilyatsiya qiladi.** Playwright
  `domcontentloaded` bilan qaytsa, sahifa hali bo'sh bo'lishi va locator
  30 soniyada tugab qolishi mumkin. Driver shuning uchun `networkidle`
  bilan navigatsiya qilib, 60–90 soniyagacha kutadi.
- **O'chirish endpointlari yo'q** — hamma narsa arxivlanadi (§4.8, §6.13).
  Sinov ma'lumotini tozalash uchun to'g'ridan-to'g'ri SQL kerak:
  ```bash
  PGPASSWORD=<parol> psql -h localhost -U postgres -d hisob_ai \
    -c "delete from brands where name like 'Sinov %';"
  ```
- **Kategoriya/brendni birlashtirish tugmasi faqat ikkinchi faol yozuv
  bo'lganda chiqadi** — nishon yo'q bo'lsa UI uni ko'rsatmaydi (server ham
  `CATALOG_MERGE_INVALID_TARGET` bilan rad etadi).

## Troubleshooting

- **`Error: listen EADDRINUSE: :::3000`**: eski `next dev` jarayoni
  turibdi va `kill` uni o'ldirmagan. Yuqoridagi `ss` li to'xtatish
  buyrug'ini ishlating — `lsof` bu jarayonni ko'rmasligi mumkin.
- **`429` + `Retry-After` login'da**: yuqoridagi throttle. API'ni qayta
  ishga tushiring va `/tmp/hisobai-run/state.json` ni saqlab qoling.
- **`TypeError: Cannot read properties of undefined (reading 'launch')`**:
  Playwright CJS paket, `import()` uni `default` ichiga o'raydi. Driver
  ikkala shaklni ham tekshiradi — bu xato faqat driverni qo'lda
  ko'chirganda chiqadi.
- **`Chromium topilmadi`**: `CHROMIUM_BIN=/path/to/chromium` bilan
  ko'rsating yoki `sudo snap install chromium`.
- **`apps/api/.env yo'q`**: driver ADMIN hisobini shu fayldan oladi —
  `cp apps/api/.env.example apps/api/.env` va to'ldiring.
- **`GET /health/ready` `"database":"down"`**: PostgreSQL ishlamayapti yoki
  `DATABASE_URL` xato. `pg_isready -h localhost` bilan tekshiring.
