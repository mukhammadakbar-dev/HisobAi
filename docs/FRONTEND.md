# HisobAI CRM — Frontend arxitekturasi (v0.2.1)

> **Nima uchun bu hujjat.** 2026-08-09 auditida frontend arxitekturasi 3/10
> ball oldi: butun frontend `ARCHITECTURE.md` §8 dagi 11 ta URL ro'yxatidan
> iborat edi. Holat boshqaruvi, papka tuzilmasi, forma strategiyasi,
> loading/error/empty konventsiyasi, offline siyosati — hech biri yozilmagan.
> Bu hujjat shu bo'shliqni yopadi.
>
> Yondosh hujjatlar: **`design.md`** (dizayn tizimi — rang, tipografika,
> komponent qoidalari), **`API.md`** (kontrakt), **`GLOSSARY.md`** (atamalar),
> **`PERMISSIONS.md`** (rolga bog'liq ko'rinish).

---

## 1. Tamoyillar

`design.md` dagi asosiy tamoyil butun arxitekturaga ham tegishli:
**raqam ko'rinishi bezakdan muhimroq**.

| #   | Tamoyil                                             | Amaliy natijasi                                                                                                      |
| --- | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | **Telefon birinchi**                                | Har ekran avval 375px kenglikda loyihalanadi. Noutbuk — kengaytma, teskarisi emas                                    |
| 2   | **Server — yagona haqiqat manbai**                  | Frontend moliyaviy qiymatni hisoblamaydi. Foyda, qarz, qoldiq — hammasi serverdan keladi                             |
| 3   | **Pul hech qachon `number` bo'lmaydi**              | API'dan string keladi (`API.md` §2.1), `@hisobai/contracts` bilan formatlanadi. Frontendda pul arifmetikasi **yo'q** |
| 4   | **Optimistik yangilash — moliyaviy amallarda yo'q** | Savdo tasdiqlash, to'lov, qaytarish — server javobini kutadi. Yolg'on "muvaffaqiyat" ko'rsatish eng yomon variant    |
| 5   | **Har so'rov 4 holatga ega**                        | loading · error · empty · data. To'rttasi ham loyihalanadi, hech biri tashlab ketilmaydi                             |
| 6   | **Offline'da yozish yo'q**                          | MVP'da offline faqat qobiq va o'qish keshi (§10)                                                                     |

---

## 2. Texnologik qarorlar

| Qatlam        | Tanlov                                                   | Sabab                                                                                                                                               |
| ------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework     | **Next.js 16, App Router**                               | Allaqachon o'rnatilgan; PWA va marshrutlash tayyor                                                                                                  |
| Render rejimi | **Client-side ma'lumot** (`'use client'` sahifalar)      | Ma'lumot sessiya cookie'siga bog'liq va shaxsiy — SSR keshi foyda bermaydi. Server Component'lar faqat statik qobiq uchun                           |
| Server state  | **TanStack Query v5**                                    | Kesh, qayta so'rash, invalidatsiya, `refetchOnWindowFocus` — hammasi tayyor. §14.7 "avtomatik yangilash yo'q" talabi konfiguratsiya bilan qoplanadi |
| UI state      | **React `useState` / `useReducer`**                      | Global UI store kerak emas: modal, filtr, savat — hammasi lokal yoki URL'da                                                                         |
| URL state     | **`useSearchParams`**                                    | Filtr, sana oralig'i, sahifa kursori — URL'da. Havolani ulashish va orqaga qaytish ishlaydi                                                         |
| Forma         | **react-hook-form + zod**                                | Zod sxemasi `@hisobai/contracts` da — **client va server bir xil qoidani ishlatadi**                                                                |
| Styling       | **Tailwind CSS v4**                                      | `design.md` §3 aynan shunga yozilgan (`@theme` bloki)                                                                                               |
| Komponentlar  | **O'z komponentlarimiz** (headless primitive'lar ustida) | Tayyor kutubxona `design.md` qoidalarini buzadi; kerak bo'lganda Radix UI primitive'lari (dialog, popover, select) qo'shiladi                       |
| Grafik        | **Recharts**                                             | §13.6 dinamika grafigi. Bitta grafik turi uchun d3 ortiqcha                                                                                         |
| Sana          | **date-fns + date-fns-tz**                               | "Bugun" `Asia/Tashkent` da hisoblanadi (`API.md` §2.2)                                                                                              |
| Ikonka        | **lucide-react**                                         | Yengil, tree-shakeable, uslubi neytral                                                                                                              |
| Test          | **Vitest + Testing Library**, keyin Playwright (E2E)     | `ARCHITECTURE.md` §12 dagi test darajalariga mos                                                                                                    |

**Hozircha o'rnatilmagan.** Yuqoridagilar `TZ.md` §22 ning **1-bosqichida**
(kesuvchi poydevor) o'rnatiladi. Bu hujjat qarorni belgilaydi, o'rnatishni
emas.

### Ataylab tanlanmaganlar

| Nima                    | Nega yo'q                                                                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Redux / Zustand / Jotai | Global mijoz holati deyarli yo'q — bor narsa server state, uni TanStack Query boshqaradi. Ikkinchi store ikki marta haqiqat manbai demakdir |
| Server Actions          | Backend alohida NestJS API. Server Action qo'shilsa, biznes mantiq ikki joyga bo'linadi                                                     |
| SSR/ISR ma'lumot uchun  | Ma'lumot shaxsiy va sessiyaga bog'liq; kesh foyda bermaydi, xavf tug'diradi                                                                 |
| CSS-in-JS               | Runtime narxi bor; Tailwind v4 tokenlari `design.md` bilan bir xil tilda                                                                    |
| i18n kutubxonasi        | MVP'da faqat o'zbek tili (TZ §2). Matn `messages.ts` da markazlashadi — keyin i18n'ga o'tish oson                                           |

---

## 3. Papka tuzilmasi

```text
apps/web/src/
  app/                        # Next.js App Router — faqat marshrut va qobiq
    (auth)/
      login/page.tsx
    (app)/                    # autentifikatsiya talab qiladigan hamma narsa
      layout.tsx              # AppShell: navigatsiya, kurs chizig'i, FAB
      dashboard/page.tsx
      sales/                  page.tsx · new/page.tsx · [id]/page.tsx
      inventory/              page.tsx · receive/page.tsx · [id]/page.tsx · stocktake/page.tsx
      products/               page.tsx · new/page.tsx · [id]/page.tsx
      customers/              page.tsx · [id]/page.tsx
      installments/           page.tsx · [id]/page.tsx
      payments/page.tsx
      cashbook/               page.tsx · new/page.tsx
      reports/page.tsx
      insights/page.tsx
      settings/               page.tsx · catalog/page.tsx · security/page.tsx
    layout.tsx
    globals.css               # design.md §3 dagi @theme bloki
    manifest.ts               # PWA
  features/                   # domen bo'yicha — asosiy kod SHU YERDA
    sales/
      api.ts                  # so'rov funksiyalari
      queries.ts              # useQuery / useMutation hook'lari
      schemas.ts              # forma zod sxemalari (contracts ustiga)
      components/
      utils.ts
    inventory/  customers/  installments/  payments/  cashbook/
    reports/  settings/  auth/  catalog/
  components/                 # domenga bog'liq bo'lmagan UI
    ui/                       # Button, Input, Select, Dialog, Table, Badge…
    layout/                   # AppShell, BottomNav, Sidebar, PageHeader
    states/                   # Loading, ErrorState, EmptyState, RateStaleBar
    money/                    # Money, MoneyInput, CurrencyBadge
  lib/
    api-client.ts             # fetch wrapper: cookie, CSRF, xato, idempotency
    query-client.ts           # TanStack Query konfiguratsiyasi
    format.ts                 # sana/telefon formatlash (pul — contracts'da)
    messages.ts               # barcha foydalanuvchi matnlari
    permissions.ts            # rolga bog'liq ko'rinish
  hooks/                      # useDebounce, useMediaQuery, useIdempotencyKey…
  public/
    brand/                    # hisobai-logo.svg, icon.svg, icon-light.svg
    favicon.svg
```

**Qoida:** `app/` ichida biznes mantiq bo'lmaydi — sahifa faqat `features/`
dan komponent chaqiradi. Sabab: marshrut o'zgarganda mantiq ko'chmasin.

**Brend fayllari** hozir `docs/files/` da. 1-bosqichda `apps/web/public/brand/`
ga ko'chiriladi (`design.md` §1).

---

## 4. Navigatsiya

`design.md` §6 (44×44px bosish maydoni) va TZ §20 talablariga muvofiq.

| Ekran                 | Tuzilma                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Telefon** (< 768px) | Pastda 5 ta element: Boshqaruv · Savdo · Ombor · Mijozlar · Yana. "Yana" — sheet: nasiya, to'lovlar, kassa, hisobot, tahlil, sozlama |
| **Noutbuk** (≥ 768px) | Chapda yon menyu, barcha bo'limlar ko'rinadi                                                                                         |
| **Har ikkalasi**      | Tepada: do'kon nomi, bugungi kurs (CBU + do'kon), kurs eskirgan bo'lsa ogohlantirish chizig'i (§16.6)                                |
| **Suzuvchi tugma**    | Faqat **"Yangi savdo"** — barcha sahifalarda pastda o'ngda (§14.6). Boshqa FAB qo'shilmaydi                                          |

Sahifa sarlavhasi va orqaga qaytish — `PageHeader` komponentida; brauzer
tarixiga tayanadi, o'z stack'imizni qurmaymiz.

---

## 5. Ma'lumot qatlami

### 5.1 API client

`lib/api-client.ts` — yagona kirish nuqtasi. Barcha so'rovlar shundan o'tadi.

Vazifalari:

1. `credentials: 'include'` (sessiya cookie'si)
2. `X-CSRF-Token` sarlavhasi (`API.md` §1)
3. Moliyaviy `POST` uchun `Idempotency-Key` (§5.4)
4. Javob `ok` bo'lmasa — `ApiError` tashlaydi (`code`, `message`, `field`,
   `details`, `requestId`)
5. `401` → sessiya tugagan: query kesh tozalanadi, `/login` ga yo'naltiriladi
6. Tarmoq xatosi → `NETWORK_ERROR` kodi bilan `ApiError`

**`fetch` to'g'ridan-to'g'ri chaqirilmaydi** — aks holda xato ishlov berish
va idempotency har joyda takrorlanadi.

### 5.2 Xato → UI

`API.md` §3 dagi `code` — frontend qaror qabul qiladigan yagona maydon.
`message` foydalanuvchiga ko'rsatiladi, lekin unga **shart yozilmaydi**.

| Xato turi               | UI ko'rinishi                                                                          |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `VALIDATION_FAILED`     | `details.issues` react-hook-form maydonlariga o'rnatiladi                              |
| `409` biznes konflikti  | Forma tepasida qizil banner + tegishli qatorni belgilash (masalan band IMEI)           |
| `422` biznes qoidasi    | Xuddi shunday, lekin "qayta urinish" tugmasisiz — so'rovni o'zgartirish kerak          |
| `401`                   | Yo'naltirish, toast'siz                                                                |
| `403`                   | "Bu amalga ruxsatingiz yo'q" — sahifa darajasida                                       |
| `429`                   | `Retry-After` bilan qolgan vaqt ko'rsatiladi                                           |
| `NETWORK_ERROR` / `5xx` | "Server javob bermadi. Qayta urinib ko'ring." + qayta urinish tugmasi (`design.md` §7) |

Xato matnlari `lib/messages.ts` da — `code` bo'yicha lug'at. Server matni
zaxira sifatida ishlatiladi.

### 5.3 Query kalitlari va invalidatsiya

```ts
// features/sales/queries.ts
export const salesKeys = {
  all: ['sales'] as const,
  list: (filters: SalesFilters) => [...salesKeys.all, 'list', filters] as const,
  detail: (id: string) => [...salesKeys.all, 'detail', id] as const,
};
```

Invalidatsiya jadvali — **moliyaviy amal bir necha bo'limga tegadi**, shuning
uchun aniq yozilgan:

| Amal                             | Invalidatsiya qilinadi                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| Savdo tasdiqlash                 | `sales`, `inventory`, `cashbook`, `dashboard`, `customers.detail`, nasiya bo'lsa `installments` |
| To'lov qabul qilish / tasdiqlash | `payments`, `installments`, `cashbook`, `dashboard`, `customers.detail`                         |
| Qaytarish / bekor qilish         | Savdo tasdiqlash bilan bir xil ro'yxat                                                          |
| Ombor qabul qilish               | `inventory`, `products`, `dashboard`                                                            |
| Kassa yozuvi                     | `cashbook`, `dashboard`                                                                         |
| Kurs o'zgartirish                | `exchangeRates`, `dashboard` — **savdolar emas** (snapshot, §1.7)                               |

Oxirgi qator muhim: kurs o'zgarsa eski savdolar **qayta so'ralmaydi**, chunki
ular snapshot kursda qotgan. Buni invalidatsiya qilish "hisoblanadigan qiymat
saqlanmaydi" qoidasini noto'g'ri tushunish bo'lardi.

### 5.4 Idempotency

```ts
// hooks/use-idempotency-key.ts — forma OCHILGANDA yaratiladi
const idempotencyKey = useIdempotencyKey(); // useState(() => crypto.randomUUID())
```

Kalit **forma ochilganda bir marta** yaratiladi va qayta yuborishda
o'zgarmaydi — aynan shu narsa dublikatni to'sadi (`API.md` §4). Muvaffaqiyatli
javobdan keyin forma yopiladi; qayta ochilsa yangi kalit olinadi.

### 5.5 Pagination

Kursor-asosli (`API.md` §5.1). Ro'yxatlarda `useInfiniteQuery`; telefonda
"Yana yuklash" tugmasi (avtomatik scroll-yuklash emas — trafik va batareya,
§14.7 ruhi).

### 5.6 Yangilash siyosati (§14.7)

```ts
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false, // §14.7 — avtomatik yangilash yo'q
      refetchOnReconnect: true,
      retry: (count, error) => !(error instanceof ApiError) && count < 2,
    },
  },
});
```

Yangilash: sahifa ochilganda + pastga tortib qo'lda (pull-to-refresh).
`ApiError` qayta urinilmaydi — biznes xatosini takrorlash ma'nosiz.

---

## 6. Formalar

### 6.1 Sxemalar bir joyda

Validatsiya qoidasi **`@hisobai/contracts`** da yoziladi va ikkala tomon
ishlatadi. Client tezkor javob uchun, server esa majburiy qayta tekshiruv
uchun (`ARCHITECTURE.md` §8).

```
packages/contracts/src/schemas/sale.ts   →  apps/web (RHF resolver)
                                         →  apps/api (DTO validatsiyasi)
```

Bu qoida buzilsa, ikki tomon boshqa-boshqa qoidani qo'llaydi va foydalanuvchi
"forma to'g'ri, lekin server rad etdi" holatiga tushadi.

### 6.2 Pul maydonlari

`MoneyInput` komponenti:

- ichkarida **string** saqlaydi, `number` ga aylantirmaydi;
- kiritish paytida minglik ajratgich qo'yadi, fokus ketganda valyuta
  qoidasiga yaxlitlaydi (`roundMoney`, §1.10);
- `inputMode="decimal"`, o'lchami 16px (mobilda zoom bo'lmasligi uchun,
  `design.md` §4);
- UZS'da kasr qismini umuman qabul qilmaydi (tiyin ishlatilmaydi).

### 6.3 Saqlanmagan o'zgarish

Savdo qoralamasi va kassa formasida sahifadan chiqishda ogohlantirish
(`beforeunload` + marshrut o'zgarishi). Moliyaviy forma jimgina yo'qolmasin.

---

## 7. Holatlar: loading · error · empty

Har ro'yxat va har kartochka uchun to'rttasi ham loyihalanadi.

| Holat                    | Qoida                                                                                                                                    |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **Loading**              | Skeleton (spinner emas) — jadval shakli saqlanadi, sahifa sakramaydi. 200 ms dan qisqa yuklanishda ko'rsatilmaydi (miltillash bo'lmasin) |
| **Error**                | Nima bo'lgani + nima qilish kerakligi + qayta urinish tugmasi. Uzr so'ralmaydi (`design.md` §7)                                          |
| **Empty**                | Keyingi qadam aytiladi: _"Hali savdo yo'q. Birinchi savdoni qo'shing."_ + amal tugmasi                                                   |
| **Filtrdan keyin bo'sh** | Boshqa matn: _"Ushbu filtr bo'yicha savdo topilmadi."_ + "Filtrni tozalash"                                                              |
| **Qisman xato**          | Dashboard bir blok yiqilsa, qolgani ko'rinadi — butun sahifa yo'qolmaydi                                                                 |

Oxirgi qator `GET /dashboard` uchun muhim: u bitta so'rov (§14.1), lekin
javobdagi bloklar mustaqil ko'rsatiladi.

---

## 8. Dizayn tizimini ulash

`design.md` §3 dagi `@theme` bloki `app/globals.css` ga **o'zgartirilmasdan**
ko'chiriladi. Hozirgi `globals.css` — boilerplate qoldig'i va o'z tokenlari
bilan `design.md` ga zid; 1-bosqichda almashtiriladi.

### 8.1 Qorong'i rejim palitrasi (tasdiqlangan 2026-08-10)

**TZ §2:** _"Light va dark mode; tanlov saqlanadi va tizim mavzusiga
moslasha oladi"_. Schema'da `User.theme` (`SYSTEM`/`LIGHT`/`DARK`) bor,
lekin `design.md` faqat yorug' palitrani beradi. Quyidagi jadval shu
bo'shliqni yopadi.

**Yangi rang qo'shilmadi** — barcha qiymat `design.md` §2 dagi `blue` va
`neutral` shkalalaridan, teskari pog'onalarda olingan.

| Rol              | Yorug'    | Qorong'i  | Manba                                  |
| ---------------- | --------- | --------- | -------------------------------------- |
| Sahifa foni      | `#F7F8FA` | `#020D1F` | neutral-50 → neutral-900 (brend `ink`) |
| Karta foni       | `#FFFFFF` | `#171D28` | neutral-0 → neutral-800                |
| Ko'tarilgan yuza | `#EEF0F4` | `#2E3542` | neutral-100 → neutral-700              |
| Chegara          | `#DDE1E8` | `#2E3542` | neutral-200 → neutral-700              |
| Asosiy matn      | `#020D1F` | `#F7F8FA` | neutral-900 ↔ neutral-50               |
| Ikkilamchi matn  | `#4A5261` | `#C2C8D3` | neutral-600 → neutral-300              |
| Uchlamchi matn   | `#6B7484` | `#98A0AF` | neutral-500 → neutral-400              |
| Tugma foni       | `#274FB5` | `#4A6FD0` | blue-500 → blue-400                    |
| Havola matni     | `#274FB5` | `#7E9AE0` | blue-500 → blue-300                    |
| Tanlangan qator  | `#EEF2FB` | `#02133B` | blue-50 → blue-900                     |

Status ranglari — **matn yorug'lashadi, fon to'qlashadi**:

| Holat     | Yorug' matn / fon     | Qorong'i matn / fon   |
| --------- | --------------------- | --------------------- |
| `success` | `#17835A` / `#E7F5EF` | `#3FB98A` / `#0E2A21` |
| `warning` | `#B7791F` / `#FDF3E2` | `#D9A441` / `#2A2113` |
| `danger`  | `#C02B2B` / `#FBEAEA` | `#E36464` / `#2E1516` |
| `info`    | `#274FB5` / `#EEF2FB` | `#4A6FD0` / `#02133B` |
| `muted`   | `#6B7484` / `#EEF0F4` | `#98A0AF` / `#232A36` |

**Nega tugma va havola uchun boshqa pog'ona.** `#274FB5` to'q fonda
3.6:1 kontrast beradi — UI elementi uchun yetarli, lekin matn uchun emas
(AA 4.5:1 talab qiladi). Shuning uchun tugma **foni** `blue-400` bo'ladi
(ustidagi oq matn 4.7:1), havola **matni** esa `blue-300` (6.1:1).

**Nega bu brendga zid emas.** `design.md` §1 allaqachon to'q fonni nazarda
tutgan: _"to'q fonda logotip butunlay oq bo'ladi, AI qismi `#4A6FD0` ga
o'tadi"_. Qorong'i rejim brend tizimiga kirgan edi — faqat qolgan ranglar
yozilmagan edi.

#### Tokenlarni qatlamlash (Tailwind v4)

Uch qatlam. Chalkashmasligi uchun tartib muhim:

```css
@import 'tailwindcss';

/* 1-qatlam — xom palitra. design.md §3 dan O'ZGARTIRILMASDAN ko'chiriladi.
   Bu `bg-blue-500`, `text-neutral-400` kabi utilitalarni beradi. */
@theme {
  --color-blue-50: #eef2fb;
  /* … design.md §3 dagi to'liq ro'yxat … */
  --font-display: 'Poppins', ui-sans-serif, system-ui;
  --font-sans: 'Inter', ui-sans-serif, system-ui;
  --radius-md: 10px;
}

/* 2-qatlam — semantik tokenlar. Mavzuga qarab qiymati almashadi. */
:root {
  --surface-page: var(--color-neutral-50);
  --surface-card: #ffffff;
  --border-default: var(--color-neutral-200);
  --text-primary: var(--color-neutral-900);
  --text-secondary: var(--color-neutral-600);
  --action-bg: var(--color-blue-500);
  --action-text: #ffffff;
  --link-text: var(--color-blue-500);
  --row-selected: var(--color-blue-50);
  color-scheme: light;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    --surface-page: var(--color-neutral-900);
    --surface-card: var(--color-neutral-800);
    --border-default: var(--color-neutral-700);
    --text-primary: var(--color-neutral-50);
    --text-secondary: var(--color-neutral-300);
    --action-bg: var(--color-blue-400);
    --link-text: var(--color-blue-300);
    --row-selected: var(--color-blue-900);
    color-scheme: dark;
  }
}

:root[data-theme='dark'] {
  /* @media bloki bilan bir xil qiymatlar */
}

/* 3-qatlam — semantik tokenlarni utilita sifatida ochish.
   `inline` MAJBURIY: usiz Tailwind qiymatni build paytida qotirib qo'yadi
   va mavzu almashganda o'zgarmaydi. */
@theme inline {
  --color-surface-page: var(--surface-page);
  --color-surface-card: var(--surface-card);
  --color-border-default: var(--border-default);
  --color-text-primary: var(--text-primary);
  --color-action: var(--action-bg);
}
```

Uch holat ham qoplanadi: `SYSTEM` (belgi yo'q → `@media`), `LIGHT`
(`data-theme="light"` → `:not()` tufayli `@media` ishlamaydi), `DARK`
(`data-theme="dark"`).

**Qoida:** komponentda to'g'ridan-to'g'ri `bg-neutral-900` yozilmaydi —
faqat semantik nom (`bg-surface-page`). Aks holda element bitta mavzuda
to'g'ri, ikkinchisida o'qilmas bo'lib qoladi.

`body` foni **albatta** token bilan beriladi — shaffof qoldirilsa brauzer
o'z fonini ko'rsatadi va mavzular aralashib ketadi.

**Tanlov qayerda saqlanadi.** `User.theme` (`PATCH /settings`), sahifa
yuklanishida `<html data-theme>` ga qo'yiladi. Miltillashning oldini olish
uchun boshlang'ich qiymat `localStorage` dan inline skript bilan
o'qiladi — server javobini kutmaydi.

#### Ko'rinishi

Yorug' va qorong'i variantlar yonma-yon:
[Qorong'i rejim palitrasi](https://claude.ai/code/artifact/dad6d0af-765f-49ec-8e2c-d79817d6a01d)

### 8.2 Raqamlar

`design.md` §4 — `font-variant-numeric: tabular-nums` jadval, statistika va
pul uchun **majburiy**. `Money` komponenti buni o'zi qo'llaydi, alohida
eslash kerak bo'lmasin.

`@hisobai/contracts` dagi `formatMoney` allaqachon `design.md` §4 talabiga
mos: minglik ajratgich — uzilmaydigan probel, UZS'da tiyin yo'q.

---

## 9. Rolga bog'liq ko'rinish

`PERMISSIONS.md` matritsasi frontendda **ikkinchi qatlam**, birinchisi emas:
server baribir tekshiradi. UI vazifasi — foydalanuvchiga bosib bo'lmaydigan
tugmani ko'rsatmaslik.

```ts
// lib/permissions.ts
export function can(user: CurrentUser, action: Action): boolean;
```

MVP'da faqat `OWNER` bo'lgani uchun deyarli hamma narsa `true` qaytaradi —
lekin **chaqiruv joylari hozirdan qo'yiladi**. Keyin rol qo'shilganda
qidirib yurish kerak bo'lmaydi.

Tannarx va foyda maydonlari server javobida bo'lmasligi mumkin (rolga
bog'liq serializatsiya) — komponentlar `undefined` ni to'g'ri boshqarishi
kerak, `0` deb ko'rsatmasligi kerak.

---

## 10. PWA va offline

| Qoida                   | Ifodasi                                                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Offline yozish YO'Q** | Bu aniq qaror (§17 audit). Offline navbat murakkab sinxronlash va konflikt hal qilishni talab qiladi; moliyaviy tizimda bu MVP xavfi |
| Offline qobiq           | Service worker ilova qobig'ini va statik aktivlarni keshlaydi                                                                        |
| Offline o'qish          | Oxirgi ko'rilgan dashboard va ro'yxatlar keshdan ko'rsatiladi, tepada "Oflayn — ma'lumot eskirgan bo'lishi mumkin" chizig'i          |
| Offline'da amal         | Tugmalar o'chiriladi, tushuntirish beriladi: _"Internet yo'q. Savdoni tasdiqlash uchun ulanish kerak."_                              |
| Kalkulator              | To'liq offline ishlaydi (§12.3) — serverga so'rov yubormaydi                                                                         |
| Push                    | `PushSubscription` PWA o'rnatilgandan keyin so'raladi, birinchi kirishda emas                                                        |

---

## 11. Erishimlilik

`design.md` §6 dagi qoidalarga qo'shimcha:

- Fokus halqasi hech qachon o'chirilmaydi (`outline: 2px solid #274FB5`).
- **Rang yagona signal emas** (TZ §20): qarz, xatolik, muvaffaqiyat matn va
  ikonka bilan ham belgilanadi. Status badge'da doim matn bo'ladi.
- Modal: fokus ushlab turiladi, `Esc` yopadi, ochilganda fokus birinchi
  interaktiv elementga.
- Forma maydoni doim `<label>` bilan bog'lanadi; `placeholder` label o'rnini
  bosmaydi.
- Jadvalda `<caption>` yoki `aria-label`; summalar ustuni `<th scope>` bilan.
- Kontrast: matn ≥ 4.5:1, katta matn ≥ 3:1. `neutral-400` faqat 16px+ da.

---

## 12. Ishlash budjeti

| Ko'rsatkich               | Chegara                                             | Nega                                       |
| ------------------------- | --------------------------------------------------- | ------------------------------------------ |
| Dashboard JS (gzip)       | ≤ 200 KB                                            | Do'konda 4G/3G, arzon telefon              |
| `GET /dashboard` javobi   | ≤ 50 KB                                             | §14.1 bitta so'rov, tez ochilishi shart    |
| LCP (4G, o'rta telefon)   | ≤ 2.5 s                                             | —                                          |
| Marshrut bo'yicha bo'lish | Har sahifa alohida chunk                            | Hisobot grafigi savdo sahifasiga tushmasin |
| Recharts                  | Faqat `/reports` va `/dashboard` da, dinamik import | Eng og'ir bog'liqlik                       |

---

## 13. Testlash

| Daraja                   | Qamrov                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------- |
| Unit                     | `formatMoney`/`roundMoney` (allaqachon bor), `MoneyInput` xulqi, `can()`, xato→matn moslamasi             |
| Komponent                | Savdo savati (qator qo'shish, narx o'zgartirish, foyda ko'rsatish), to'lov formasi, jadval tuzish formasi |
| Integratsiya (MSW bilan) | Savdo tasdiqlash oqimi: muvaffaqiyat, band IMEI (`409`), tarmoq xatosi, takroriy yuborish                 |
| E2E (Playwright)         | `ARCHITECTURE.md` §12: login → savdo → nasiya → to'lov                                                    |

**Majburiy:** savdo tasdiqlash va to'lov formasi testsiz `main` ga kirmaydi —
backend uchun amal qiladigan qoida (§12) frontendda ham amal qiladi.

---

## 14. Yozish tartibi

`TZ.md` §22 bilan mos:

| Bosqich                    | Frontend ishi                                                                                                                                                                            |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Kesuvchi poydevor**   | Tailwind v4 + `design.md` tokenlari (dark mode bilan), `api-client.ts`, `query-client.ts`, `ApiError`, `messages.ts`, `ui/` primitive'lari, `AppShell`, `states/`, `Money` komponentlari |
| **2. Auth**                | `/login`, sessiya boshqaruvi, `/settings/security`                                                                                                                                       |
| **3. Katalog va ombor**    | `/products`, `/inventory`, qabul qilish formasi, IMEI skaner (zaxira sifatida qo'lda kiritish)                                                                                           |
| **4. Mijozlar**            | `/customers`, dublikat tekshiruvi UI'si                                                                                                                                                  |
| **5. Naqd savdo va kassa** | `/sales/new` (eng murakkab ekran), `/cashbook`, `/dashboard`                                                                                                                             |
| **6–9. MVP-2**             | Qaytarish, nasiya, to'lov, hisobotlar, PDF                                                                                                                                               |
| **10–12**                  | Inventarizatsiya, PWA/push, AI tahlil                                                                                                                                                    |

---

## 15. Shrift va brend fayllari

### 15.1 Shriftlar — self-host (tasdiqlangan 2026-08-10)

Poppins (logotip, sarlavha) va Inter (interfeys matni) **o'z serverimizdan**
beriladi, Google Fonts'dan emas.

| Qoida          | Ifodasi                                                                   |
| -------------- | ------------------------------------------------------------------------- |
| Joylashuvi     | `apps/web/public/fonts/` — `woff2` formatida                              |
| Qamrov         | `latin` + `latin-ext` (o'zbek lotin alifbosidagi `ʻ` va `ʼ` uchun)        |
| Og'irliklar    | Inter 400 / 500 / 600; Poppins 600 — boshqasi yuklanmaydi                 |
| Ulanishi       | `next/font/local` — Next.js `@font-face` va `preload` ni o'zi qo'yadi     |
| `font-display` | `swap` — matn shrift kutib turmasin                                       |
| Zaxira stack   | `ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` |

**Sabab.** (1) Do'konda internet uzilib turadi — tashqi CDN'ga bog'lanish
sahifani shriftsiz yoki sekin ochadi. (2) PWA offline qobig'i (§10) tashqi
domendagi faylni ishonchli keshlay olmaydi. (3) Har bir tashqi domen —
qo'shimcha DNS va TLS qo'l siqishi, 3G'da sezilarli. (4) Foydalanuvchi IP'si
uchinchi tomon serveriga ketmaydi (§16.13 lokalizatsiya ruhi).

Hajmi: 4 ta `woff2` ≈ 90–120 KB, `preload` bilan birinchi render'da tayyor.
§12 dagi 200 KB budjetiga sig'adi.

> **Holat (2026-08-10):** `woff2` fayllari hali yo'q. `next/font/local` fayl
> topilmasa build'ni yiqitadi, shuning uchun hozircha `globals.css` dagi
> `--font-sans` / `--font-display` zaxira stack bilan ishlaydi
> (`ui-sans-serif, system-ui, …`). Ilova to'liq ishlaydi, faqat tipografika
> brend shriftida emas. Fayllar kelganda ulash yo'riqnomasi:
> `apps/web/public/fonts/README.md`.

### 15.2 Logotip va brend fayllari (tasdiqlangan 2026-08-10)

`currentColor` bilan boshqarilmaydi, chunki logotipda **ikki rang** bor:
harflar va "AI" qismi alohida (`design.md` §1). Bitta `currentColor` buni
ifodalay olmaydi — logotip yaxlit bir rangga tushib qolardi.

| Fayl                    | Ranglari                                 | Qayerda                           |
| ----------------------- | ---------------------------------------- | --------------------------------- |
| `hisobai-logo.svg`      | `#020D1F` + `#052572`                    | Yorug' fon                        |
| `hisobai-logo-dark.svg` | `#FFFFFF` + `#4A6FD0`                    | To'q fon                          |
| `hisobai-logo-auto.svg` | ichki `<style>` + `prefers-color-scheme` | Faqat CSS'siz kontekstlar (§15.4) |
| `icon.svg`              | `#020D1F` + `#4A6FD0`                    | PWA ikonkasi, to'q fonli joylar   |
| `icon-light.svg`        | `#020D1F` + `#274FB5`                    | Oq/och fonli joylar               |
| `favicon.svg`           | `#020D1F` + `#4A6FD0`                    | Brauzer tabi                      |

Uchala logotip faylining `viewBox` va kontur ma'lumotlari **aynan bir xil**
(`0 0 312.96 79.44`) — faqat `fill` qiymatlari farq qiladi. Ikonkalardagi
`#274FB5` / `#4A6FD0` esa §8.1 dagi yorug'/qorong'i harakat rangiga to'g'ri
mos keladi.

Fayllar hozir `docs/files/` da; 1-bosqichda `apps/web/public/brand/` ga
ko'chiriladi (`favicon.svg` — `public/` ildiziga).

### 15.3 `hisobai-logo-auto.svg` ning cheklovi

Bu fayl ichida `prefers-color-scheme` media so'rovi bor va u `<img>` ichida
ham ishlaydi. Lekin u **faqat operatsion tizim sozlamasini** ko'radi — bizning
`data-theme` atributimizni ko'ra olmaydi. Natijada olti holatning ikkitasi
buziladi:

| `User.theme` | OT sozlamasi | Logotip          | Sahifa foni | Natija         |
| ------------ | ------------ | ---------------- | ----------- | -------------- |
| `SYSTEM`     | yorug'       | to'q harflar     | oq          | ✅             |
| `SYSTEM`     | qorong'i     | oq harflar       | to'q        | ✅             |
| `LIGHT`      | yorug'       | to'q harflar     | oq          | ✅             |
| `LIGHT`      | **qorong'i** | **oq harflar**   | **oq**      | ❌ ko'rinmaydi |
| `DARK`       | **yorug'**   | **to'q harflar** | **to'q**    | ❌ ko'rinmaydi |
| `DARK`       | qorong'i     | oq harflar       | to'q        | ✅             |

Foydalanuvchi mavzuni qo'lda tanlashi TZ §2 talabi, shuning uchun bu ikki
holatni e'tiborsiz qoldirib bo'lmaydi.

### 15.4 Yechim: ilova ichida inline SVG, tashqarida fayl

**Ilova ichida** (header, login sahifasi) logotip **inline React
komponenti** sifatida joylashtiriladi, konturlari `fill` ni bizning
tokenlarimizdan oladi:

```tsx
// components/layout/logo.tsx
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 312.96 79.44" role="img" aria-label="HisobAI" className={className}>
      <path className="fill-[--logo-base]" d="…" />
      <path className="fill-[--logo-accent]" d="…" />
    </svg>
  );
}
```

```css
:root {
  --logo-base: #020d1f;
  --logo-accent: #052572;
}
/* qorong'i blokda (§8.1 bilan bir joyda) */
--logo-base: #ffffff;
--logo-accent: var(--color-blue-400);
```

Nega shunday:

- **Oltala holat ham to'g'ri ishlaydi** — token bizning `data-theme` va
  `@media` mantiqimizga bo'ysunadi, OT sozlamasiga emas.
- **Qo'shimcha so'rov yo'q** — logotip HTML ichida keladi, header birinchi
  render'da to'liq chiqadi (miltillash yo'q).
- Rang qiymatlari §8.1 palitrasi bilan **bitta joyda** turadi; kelajakda
  palitra o'zgarsa logotip ham avtomatik ergashadi.

**CSS ishlamaydigan kontekstlarda** tayyor fayllar ishlatiladi:

| Kontekst                              | Fayl                                                                              |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| Nasiya shartnomasi PDF (§15.8)        | `hisobai-logo.svg` — oq qog'ozga bosiladi                                         |
| PWA manifest ikonkasi                 | `icon.svg`                                                                        |
| Brauzer tabi                          | `favicon.svg`                                                                     |
| Email, Telegram avatar, tashqi hujjat | `hisobai-logo-auto.svg` — u yerda OT sozlamasi yagona signal, cheklov muammo emas |

Ya'ni `hisobai-logo-auto.svg` bekor qilinmaydi — u aynan o'z joyida,
bizning mavzu mantiqimiz yetib bormaydigan joylarda foydali.

---

## 16. Qarorlar holati

Frontend bo'yicha ochiq savol **qolmadi** — 1-bosqichni boshlash mumkin.

| #   | Savol                                          | Holati                      |
| --- | ---------------------------------------------- | --------------------------- |
| 1   | Qorong'i rejim palitrasi (§8.1)                | ✅ Tasdiqlandi (2026-08-10) |
| 2   | Shriftlar self-host (§15.1)                    | ✅ Tasdiqlandi (2026-08-10) |
| 3   | Logotipning to'q varianti alohida fayl (§15.2) | ✅ Tasdiqlandi (2026-08-10) |
| 4   | Brend fayllari (§15.2)                         | ✅ Yetkazildi (2026-08-10)  |

Ochiq bog'liqlik **qolmadi** — 1-bosqich uchun hamma narsa tayyor.
