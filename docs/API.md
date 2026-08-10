# HisobAI CRM — API konventsiyalari (v0.2.1)

> Bu hujjat **endpoint ro'yxati emas** — endpointlar `ARCHITECTURE.md` §8 da.
> Bu yerda **barcha endpointlar uchun umumiy qoidalar** turadi: xato formati,
> pagination, idempotency, serializatsiya. Ular modul yozilishidan **oldin**
> bitta joyda amalga oshiriladi (§17.7).
>
> Sabab: har modul o'z konventsiyasini yaratsa, keyin 15 ta joyni bir vaqtda
> tuzatish kerak bo'ladi.

---

## 1. Asoslar

| Qoida            | Qiymat                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------- |
| Prefiks          | `/api/v1`                                                                                                     |
| Format           | JSON, `Content-Type: application/json; charset=utf-8`                                                         |
| Til              | Xato matnlari o'zbekcha; `code` esa barqaror inglizcha identifikator                                          |
| Swagger          | `/api/docs` (versiya segmentisiz)                                                                             |
| Autentifikatsiya | Sessiya cookie (`HttpOnly`, `Secure`, `SameSite=Strict`)                                                      |
| CSRF             | Double-submit token: `X-CSRF-Token` sarlavhasi + `csrf` cookie. Barcha `POST/PATCH/PUT/DELETE` uchun majburiy |

### Versiyalash

`/api/v1` — buzuvchi o'zgarish bo'lganda `/api/v2` ochiladi. Buzuvchi
hisoblanadi: maydonni olib tashlash, tipini o'zgartirish, majburiy qilish,
enum qiymatini olib tashlash. Buzuvchi **emas**: yangi ixtiyoriy maydon,
yangi enum qiymati, yangi endpoint.

---

## 2. Serializatsiya

### 2.1 Pul — har doim STRING

```jsonc
{
  "total": "12500000.00", // ✅ string
  "currency": "UZS", // ✅ har pul maydoni valyuta bilan yuradi
}
```

```jsonc
{ "total": 12500000 }          // ❌ number — HECH QACHON
{ "total": { "s": 1, "e": 7 } } // ❌ Prisma Decimal xom holda
```

**Sabab:** ARCHITECTURE §4 — pul `float` bilan ifodalanmaydi. JSON'da
`number` — bu IEEE-754 double, ya'ni float. Prisma `Decimal` ni to'g'ridan
to'g'ri `res.json()` ga bersa ichki obyekt chiqadi. Ikkalasi ham xato.

Amalga oshirish: global `DecimalSerializerInterceptor` `Prisma.Decimal` ni
`toString()` bilan **aniq qiymat** sifatida uzatadi.

**Nega `toFixed(scale)` emas.** Interceptor ixtiyoriy `Decimal` maydonning
valyutasini bila olmaydi: bitta javobda UZS summasi, USD summasi va
`Decimal(12,4)` kurs birga kelishi mumkin. Shuning uchun bu qatlam qiymatni
o'zgartirmaydi. Yaxlitlash **yozishdan oldin** serverda qilinadi (§1.10),
ko'rsatish esa `formatMoney` bilan — u valyutani biladi va scale'ni o'zi
qo'llaydi. Ya'ni `"12500000"` ham, `"12500000.00"` ham to'g'ri kirish:
UI ikkalasini `12 500 000 so'm` deb ko'rsatadi.

### 2.2 Sana — ISO 8601, ofset bilan

```jsonc
{
  "soldAt": "2026-08-09T14:30:00+05:00", // vaqt nuqtasi
  "dueDate": "2026-09-15", // kalendar sana (vaqtsiz)
}
```

`@db.Date` maydonlar (`dueDate`, `exchangeRates.date`) — **kalendar sana**,
vaqt zonasiga bog'liq emas, `YYYY-MM-DD` sifatida beriladi va shu ko'rinishda
qabul qilinadi. Qolgan barcha vaqtlar `timestamptz` (§17.9) va ofset bilan
beriladi.

**Amalga oshirish.** Kalendar sanani global interceptor ajrata olmaydi —
Prisma uni oddiy `Date` sifatida qaytaradi, xuddi vaqt nuqtasi kabi.
Shuning uchun modul o'z javob mapper'ida `toCalendarDate()` yordamchisini
chaqiradi (`apps/api/src/common/dates.ts`). U sanani **UTC bo'yicha** oladi:
Prisma `@db.Date` ni UTC yarim tunida qaytaradi, lokal zona bo'yicha
o'qilsa sana bir kun sakrab ketishi mumkin.

O'sha faylda `businessDay()` va `today()` ham bor — "bugun" har doim
`Asia/Tashkent` da hisoblanadi, serverning lokal zonasida emas.

**"Bugun" tushunchasi** doim `Asia/Tashkent` da hisoblanadi (`env.TIMEZONE`),
serverning lokal zonasida emas.

### 2.3 Identifikatorlar

UUID v4, string. `settings.id` — yagona istisno (`Int`, doim `1`).

### 2.4 Bo'sh qiymatlar

`null` ishlatiladi, `undefined` yoki bo'sh satr emas. Ixtiyoriy maydon
javobda **doim bo'ladi**, qiymati `null` bo'lishi mumkin.

---

## 3. Xato formati

Barcha xatolar bir xil shaklda:

```jsonc
{
  "error": {
    "code": "SALE_ITEM_NOT_AVAILABLE",
    "message": "Bu IMEI allaqachon sotilgan: 353917104876543",
    "field": "items[2].inventoryItemId", // ixtiyoriy
    "details": {
      // ixtiyoriy, xatoga xos
      "inventoryItemId": "…",
      "soldInSaleNumber": "2026-00147",
    },
    "requestId": "01J…", // log bilan bog'lash uchun
  },
}
```

| Maydon      | Majburiy | Ma'nosi                                                                                            |
| ----------- | :------: | -------------------------------------------------------------------------------------------------- |
| `code`      |    ✅    | **Barqaror** identifikator. Frontend shunga qarab qaror qabul qiladi. Hech qachon o'zgartirilmaydi |
| `message`   |    ✅    | Foydalanuvchiga ko'rsatiladigan **o'zbekcha** matn                                                 |
| `field`     |    ❌    | Forma maydoni yo'li (massivlar indeks bilan)                                                       |
| `details`   |    ❌    | Mashina o'qiy oladigan qo'shimcha kontekst                                                         |
| `requestId` |    ✅    | Structured log'dagi yozuv bilan bog'laydi                                                          |

### 3.1 HTTP kodlari

| Kod   | Qachon                                                           | Misol                                                                   |
| ----- | ---------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `400` | So'rov shakli noto'g'ri                                          | JSON buzilgan, maydon tipi xato                                         |
| `401` | Autentifikatsiya yo'q yoki muddati o'tgan                        | Sessiya tugagan                                                         |
| `403` | Autentifikatsiya bor, ruxsat yo'q                                | SELLER kassaga kirmoqchi                                                |
| `404` | Resurs topilmadi                                                 | Noto'g'ri `id`                                                          |
| `409` | **Biznes konflikti** — holat mos emas                            | IMEI band, savdo allaqachon tasdiqlangan, kassa yozuvi kechagi          |
| `422` | **Biznes qoidasi buzildi** — ma'lumot to'g'ri, lekin qoidaga zid | Jadval summasi qarzga teng emas (§9.6), ortiqcha to'lov (§10.2)         |
| `428` | **Old shart yo'q** — optimistik qulf tokeni yuborilmagan         | `PATCH` da `expectedUpdatedAt` ham, `If-Unmodified-Since` ham yo'q (§8) |
| `429` | Limit oshdi                                                      | Login urinishi, AI so'rovi                                              |
| `500` | Ichki xato                                                       | —                                                                       |
| `503` | Vaqtincha ishlamayapti                                           | DB javob bermayapti (`/health/ready`)                                   |

`409` va `422` farqi: `409` — **vaqt o'tishi bilan o'zgaradigan** holat
(qayta urinish ma'noli bo'lishi mumkin); `422` — **so'rovning o'zi** qoidaga
zid (o'zgartirmasdan qayta urinish foydasiz).

### 3.2 Validatsiya xatosi (bir nechta maydon)

```jsonc
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Forma to'ldirilishida xato bor",
    "details": {
      "issues": [
        { "field": "phonePrimary", "code": "INVALID_PHONE", "message": "Telefon raqami noto'g'ri" },
        { "field": "items[0].quantity", "code": "MIN", "message": "Miqdor 1 dan kam bo'lmasin" },
      ],
    },
    "requestId": "01J…",
  },
}
```

### 3.3 Qisman muvaffaqiyatsizlik (ommaviy amallar)

`POST /inventory/receive` da 50 ta IMEI'dan 3 tasi dublikat bo'lsa —
tranzaksiya to'liq bekor qilinadi (`409`), lekin javobda **qaysi qatorlar**
muammoli ekani qaytariladi, foydalanuvchi hammasini qayta kiritmasin:

```jsonc
{
  "error": {
    "code": "INVENTORY_DUPLICATE_IMEI",
    "message": "3 ta IMEI allaqachon bazada bor",
    "details": {
      "rows": [
        { "index": 12, "imei1": "35391…", "existingItemId": "…" },
        { "index": 31, "imei1": "35492…", "existingItemId": "…" },
      ],
    },
  },
}
```

### 3.4 Xato kodlari registri

Kodlar `packages/contracts/src/errors.ts` da `as const` obyekt sifatida
saqlanadi — frontend ham, backend ham shu yerdan oladi. Namuna:

```
AUTH_INVALID_CREDENTIALS · AUTH_BLOCKED · AUTH_SESSION_EXPIRED
AUTH_TOKEN_INVALID · AUTH_TOKEN_USED

SALE_NOT_DRAFT · SALE_ALREADY_CONFIRMED · SALE_EMPTY
SALE_ITEM_NOT_AVAILABLE · SALE_INSUFFICIENT_STOCK
SALE_CUSTOMER_REQUIRED · SALE_PAYMENT_MISMATCH · SALE_DATE_OUT_OF_RANGE
SALE_CANCEL_WINDOW_EXPIRED

INSTALLMENT_SCHEDULE_SUM_MISMATCH · INSTALLMENT_SCHEDULE_ROW_PAID
INSTALLMENT_CONTRACT_NOT_ACTIVE

PAYMENT_EXCEEDS_OUTSTANDING · PAYMENT_ACCOUNT_CURRENCY_MISMATCH
PAYMENT_NOT_PENDING · PAYMENT_ALREADY_REVERSED

CASH_ENTRY_NOT_MANUAL · CASH_ENTRY_NOT_TODAY · CASH_ACCOUNT_CURRENCY_MISMATCH
CASH_EXCHANGE_SAME_CURRENCY

INVENTORY_DUPLICATE_IMEI · INVENTORY_ITEM_NOT_AVAILABLE

FILE_TOO_LARGE · FILE_TYPE_NOT_ALLOWED

EXCHANGE_RATE_MISSING · EXCHANGE_RATE_CBU_MISSING · EXCHANGE_RATE_FETCH_FAILED

VALIDATION_FAILED · RATE_LIMITED · IDEMPOTENCY_KEY_REUSED
STALE_RESOURCE · PRECONDITION_REQUIRED
```

---

## 4. Idempotency (§17.6)

### 4.1 Qoida

Quyidagi endpointlarda `Idempotency-Key` sarlavhasi **majburiy**:

```
POST /sales/:id/confirm      POST /sales/:id/return     POST /sales/:id/cancel
POST /payments               POST /payments/:id/confirm POST /payments/:id/reverse
POST /cash-entries           POST /cashbook/exchange
POST /inventory/receive      POST /inventory/adjust     POST /inventory/personal-use
POST /stocktakes/:id/complete
PATCH /installments/:id/schedule
POST /installments/:id/close
```

Sarlavha bo'lmasa — `400 IDEMPOTENCY_KEY_REQUIRED`.

**Sabab:** telefon internetida so'rov yuborilib, javob yo'qolishi oddiy hol.
Foydalanuvchi tugmani qayta bosadi. UI'da tugmani bloklash **yetarli emas** —
so'rov allaqachon serverga yetib borgan bo'lishi mumkin.

### 4.2 Ishlashi

```
idempotency_keys(
  key            text PRIMARY KEY,     -- client yaratgan UUID
  user_id        uuid NOT NULL,
  endpoint       text NOT NULL,
  request_hash   text NOT NULL,        -- body ning SHA-256 i
  status_code    int,
  response_body  jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
)
```

1. Kalit bo'yicha yozuv **yo'q** → `INSERT` qilinadi (unique index poygani
   hal qiladi), so'rov bajariladi, javob yoziladi.
2. Yozuv **bor va `request_hash` bir xil** → saqlangan javob qaytariladi,
   amal **qayta bajarilmaydi**.
3. Yozuv **bor, lekin `request_hash` boshqa** → `409 IDEMPOTENCY_KEY_REUSED`.
4. Yozuv bor, lekin `response_body` hali `null` (parallel so'rov davom
   etmoqda) → `409 REQUEST_IN_PROGRESS`, client qayta urinadi.

Saqlash muddati — **24 soat**, keyin tozalanadi.

Kalit ilova tomonidan **forma ochilganda** yaratiladi va qayta yuborishda
o'zgarmaydi — aynan shu narsa dublikatni to'sadi.

---

## 5. Ro'yxatlar: pagination, filtr, saralash

### 5.1 Kursor-asosli pagination

```
GET /sales?limit=50&cursor=eyJpZCI6…
```

```jsonc
{
  "data": [ … ],
  "nextCursor": "eyJpZCI6…",   // null bo'lsa — oxiri
  "hasMore": true
}
```

`limit` — default `50`, maksimum `200`.

**Istisno — chegaralangan ro'yxatlar.** `GET /exchange-rates` kursor
qabul qilmaydi va konvertsiz massiv qaytaradi: kurs tarixi kuniga bitta
qatordan iborat (§3.3) va `limit` bilan to'liq qamraladi. Bu **e'lon
qilingan istisno**, e'tibordan chetda qolgan joy emas — sxema `.strict()`
bo'lgani uchun `?cursor=` yuborilsa `400` qaytadi, jimgina yutilmaydi.

**Nega offset emas:** moliyaviy ro'yxatlar doimo o'sib turadi. `?page=2`
yuklanguncha yangi savdo qo'shilsa, foydalanuvchi bitta yozuvni **ikki marta**
ko'radi yoki umuman ko'rmaydi. Kursor bu muammoni yo'q qiladi.

Kursor — `{ sortValue, id }` juftligining base64 kodlangan shakli.
Saralash ustuni har doim `id` bilan ikkilamchi tartiblanadi (barqarorlik uchun).

### 5.2 Filtrlash

```
GET /sales?status=CONFIRMED&kind=INSTALLMENT&from=2026-01-01&to=2026-01-31&customerId=…
GET /inventory?productId=…&status=AVAILABLE&q=353917
GET /cash-entries?accountId=…&direction=OUT&categoryId=…
```

| Qoida             | Ifodasi                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------ |
| Sana oralig'i     | `from` va `to` — kalendar sana, **ikkala chekka ham kiritiladi**, `Asia/Tashkent` bo'yicha |
| Ro'yxatli qiymat  | Vergul bilan: `?status=CONFIRMED,PARTIALLY_RETURNED`                                       |
| Matn qidiruvi     | `q` parametri. Har endpoint qaysi ustunlarni qidirishi hujjatda yoziladi                   |
| Noma'lum parametr | **Xato beradi** (`400`), jimgina e'tiborsiz qoldirilmaydi                                  |

Oxirgi qoida muhim: `?stauts=CONFIRMED` (yozuv xatosi) jimgina barcha
savdolarni qaytarsa, foydalanuvchi noto'g'ri ma'lumotni to'g'ri deb qabul
qiladi.

### 5.3 Saralash

```
GET /sales?sort=-soldAt
```

`-` prefiksi — kamayish tartibi. Har endpoint uchun **ruxsat etilgan
maydonlar ro'yxati** aniq belgilanadi (ixtiyoriy ustun bo'yicha saralash —
indekssiz so'rov demakdir).

---

## 6. Rate limiting (§9 auditidan)

| Sinf          | Endpointlar                    | Limit                                     |
| ------------- | ------------------------------ | ----------------------------------------- |
| Auth          | `POST /auth/login`             | 5 / 15 daqiqa (IP + email bo'yicha, §2.9) |
| Parol tiklash | `POST /auth/forgot-password`   | 3 / soat (IP), 3 / kun (email)            |
| Mutatsiya     | Barcha `POST/PATCH/PUT/DELETE` | 60 / daqiqa (sessiya)                     |
| O'qish        | Barcha `GET`                   | 300 / daqiqa (sessiya)                    |
| Fayl yuklash  | `POST /files`                  | 30 / soat                                 |
| AI            | `POST /ai-insights/query`      | 10 / soat + kunlik token budjeti          |

Limit oshganda: `429` + `Retry-After` sarlavhasi.

Reverse proxy ortida ishlaganda `trust proxy` **sozlanishi shart** — aks
holda barcha so'rovlar bitta IP bo'lib ko'rinadi va IP bo'yicha cheklov
yagona foydalanuvchini bloklaydi.

---

## 7. Fayl yuklash (§17 xavfsizlik)

| Tekshiruv      | Qoida                                                                                |
| -------------- | ------------------------------------------------------------------------------------ |
| Hajm           | ≤ 10 MB (§15.7)                                                                      |
| MIME whitelist | `image/jpeg`, `image/png`, `image/webp`, `application/pdf`                           |
| Magic-byte     | Fayl boshidagi imzo `Content-Type` bilan mos kelishi shart                           |
| EXIF           | Rasmlardan metama'lumot **olib tashlanadi** (passport rasmidagi GPS koordinatalari!) |
| Nom            | Saqlashda ishlatilmaydi — `storageKey` UUID asosida yaratiladi                       |
| Berish         | `Content-Disposition: attachment`; hech qachon `text/html` MIME bilan berilmaydi     |
| Havola         | 15 daqiqalik imzolangan URL (§15.5); `PASSPORT` uchun **5 daqiqa**                   |
| Audit          | `PASSPORT` faylga havola berilganda `audit_logs` ga yoziladi (§6.7)                  |

---

## 8. Optimistik qulf

Bir vaqtda ikki qurilmadan tahrirlanadigan resurslarda (`PATCH /sales/:id`,
`PATCH /settings`, `PATCH /customers/:id`) client o'zi ko'rgan holat
vaqtini yuboradi. Ikki manbadan **biri majburiy**:

```
If-Unmodified-Since: 2026-08-09T14:30:00Z
```

yoki body ichida:

```jsonc
{ "lowStockThreshold": 4, "expectedUpdatedAt": "2026-08-09T14:30:00.123Z" }
```

| Holat            | Javob                                                                       |
| ---------------- | --------------------------------------------------------------------------- |
| Token mos keladi | `200` — o'zgarish yoziladi                                                  |
| Token eskirgan   | `409 STALE_RESOURCE`; `details` da `expectedUpdatedAt` va `actualUpdatedAt` |
| Token yo'q       | `428 PRECONDITION_REQUIRED`                                                 |

**Ikkalasi kelsa body ustun turadi** — u millisekundgacha aniq.
`If-Unmodified-Since` HTTP-date sifatida sekundgacha aniq, shuning uchun
solishtiruvga 999 ms bardosh qo'shiladi; usiz `14:30:00.123` da yozilgan
yozuv `14:30:00` tokeni bilan **har doim** eskirgan ko'rinardi va sarlavha
varianti umuman ishlamasdi.

Siljishsiz vaqt (`2026-08-09T14:30:00`) qabul qilinmaydi: uni `new Date()`
mahalliy vaqt deb o'qiydi va Toshkentda 5 soatga siljigan qiymat chiqadi —
aynan qulf to'sishi kerak bo'lgan konflikt jimgina o'tib ketardi.

**Nega majburiy.** Ixtiyoriy qulf — qulf emas: uni yubormagan client
himoyasiz qoladi va buni hech kim sezmaydi. Bularsiz "oxirgi yozgan
yutadi" bo'ladi va foydalanuvchi o'z o'zgarishi yo'qolganini bilmaydi.
`Idempotency-Key` (§4) ayni shu sababdan majburiy qilingan.

**Nega faqat tekshirish yetarli emas.** `SELECT` keyin `UPDATE` — TOCTOU
poygasi: `READ COMMITTED` da ikkala tranzaksiya ham "mos keladi" deb
ko'radi. Shuning uchun `updated_at` `UPDATE` ning `WHERE` shartiga
qo'yiladi va mos qator topilmasa Prisma `P2025` beradi — §17.5 dagi ombor
poygasi bilan bir xil mexanizm.

Amalga oshirish: `apps/api/src/common/optimistic-lock.ts`. Web tomonda
token formadan emas, query keshidagi holatdan olinadi
(`features/settings/queries.ts`) — har forma uni qo'lda uzatsa, bittasida
unutiladi.

---

## 9. Umumiy javob sarlavhalari

| Sarlavha                  | Ma'nosi                                 |
| ------------------------- | --------------------------------------- |
| `X-Request-Id`            | Har javobda; log bilan bog'lash uchun   |
| `Cache-Control: no-store` | Barcha moliyaviy javoblar uchun default |
| `Retry-After`             | `429` va `503` da (sekundda)            |

Brauzer CORS ostida faqat `exposedHeaders` ga tushgan sarlavhalarni ko'radi
(`main.ts`: `X-Request-Id`, `Retry-After`). Shu sababli kutish vaqti
**javob tanasida ham** takrorlanadi — `error.details.retryAfterSeconds`.
UI shuni o'qiydi: sarlavha ro'yxatdan tushib qolsa, xato jimgina
yo'qolmasin.

Qiymat manbai, tartib bilan: xatoning o'zi aytgan muddat (masalan §2.9
login bloki) → throttler qo'ygan `Retry-After-<profil>` sarlavhasi →
zaxira (throttler oynasi 60 s, `503` uchun 15 s). Nomlangan throttler
standart `Retry-After` ni **o'zi qo'ymaydi** — uni `AllExceptionsFilter`
tiklaydi.

---

## 10. Salomatlik endpointlari

| Endpoint            | Maqsad                                    |
| ------------------- | ----------------------------------------- |
| `GET /health/live`  | Jarayon tirikmi (DB tekshirilmaydi)       |
| `GET /health/ready` | DB va MinIO ulanishi bormi — deploy uchun |
