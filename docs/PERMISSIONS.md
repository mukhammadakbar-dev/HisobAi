# HisobAI CRM — Ruxsat matritsasi (v0.2.1)

> **MVP holati (§16.14, §21.2):** `UserRole` enum'ida **faqat
> `SHOP_ADMIN`** bor. `MANAGER` va `SELLER` bu hujjatda **kelajak uchun**
> loyihalashtirilgan, lekin enum'ga hozir **kiritilmaydi**.
>
> Sabab: amalga oshirilmagan rol — sinovdan o'tmagan xavfsizlik kodi
> demakdir. PostgreSQL'da enum'ga qiymat qo'shish arzon
> (`ALTER TYPE ... ADD VALUE`), olib tashlash qimmat. Shuning uchun
> minimaldan boshlanadi.
>
> **`OWNER` → `SHOP_ADMIN` (§21.2).** Ikkalasi bir xil rolni anglatadi;
> `TZ.md` §25.2 platforma atamasini talab qilgani uchun qayta nomlandi.
> `SUPERADMIN` bu matritsada **umuman yo'q** — u boshqa jadvalda va
> boshqa sessiyada yashaydi (§5, §21.3).

## 1. Mexanizm (MVP'da ham to'liq quriladi)

| Qoida                          | Ifodasi                                                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **Default DENY**               | Global guard. `@Roles(...)` ham, `@PlatformOnly()` ham (§5) **yo'q** endpoint hech kimga ochilmaydi — 403                        |
| **Ochiq endpointlar**          | Faqat `@Public()` bilan aniq belgilanganlar: `POST /auth/login`, `/auth/forgot-password`, `/auth/reset-password`, `GET /health*` |
| **Egalik tekshiruvi**          | Rol yetarli emas. `:id` bo'yicha resurs olinganda **egalik ham** tekshiriladi (sessiyalar, fayllar)                              |
| **Javob shakli rolga bog'liq** | Endpoint ochiq bo'lsa ham, ba'zi maydonlar (tannarx, foyda) rolga qarab javobdan olib tashlanadi                                 |

Uchinchi qoida muhim: `SELLER` `GET /sales/:id` ga kira olsa ham,
`costSnapshot` va foyda maydonlarini **ko'rmasligi** kerak. Bu endpoint
darajasida emas, **serializatsiya darajasida** hal qilinadi.

## 2. Matritsa

Belgilar: ✅ to'liq · ⚠️ cheklangan · ❌ yo'q

| Resurs / amal                                                      | SHOP_ADMIN |          MANAGER¹          |            SELLER¹            |
| ------------------------------------------------------------------ | :--------: | :------------------------: | :---------------------------: |
| **Dashboard** ko'rish                                              |  ✅   |             ✅             |  ⚠️ foyda va kassa blokisiz   |
| **Katalog** ko'rish                                                |  ✅   |             ✅             |              ✅               |
| Mahsulot yaratish / tahrirlash / arxivlash                         |  ✅   |             ✅             |              ❌               |
| Kategoriya / brend yaratish, birlashtirish                         |  ✅   |             ✅             |              ❌               |
| **Tannarx ko'rish** (`lastCostPrice`, `costPrice`, `costSnapshot`) |  ✅   |             ✅             |              ❌               |
| **Ombor** ko'rish                                                  |  ✅   |             ✅             |         ⚠️ tannarxsiz         |
| Qabul qilish                                                       |  ✅   |             ✅             |              ❌               |
| Inventarizatsiya                                                   |  ✅   |             ✅             |              ❌               |
| Tuzatish (`ADJUST`)                                                |  ✅   |    ⚠️ `MISCOUNT` uchun     |              ❌               |
| Shaxsiy foydalanish                                                |  ✅   |             ❌             |              ❌               |
| Sotuvga qaytarish (`RETURNED` → `AVAILABLE`)                       |  ✅   |             ✅             |              ❌               |
| **Mijoz** ko'rish / yaratish / tahrirlash                          |  ✅   |             ✅             |              ✅               |
| **Passport ma'lumoti** ko'rish                                     |  ✅   |       ⚠️ audit bilan       |              ❌               |
| **Passport rasmi** ko'rish                                         |  ✅   |       ⚠️ audit bilan       |              ❌               |
| Mijozni arxivlash / belgilash                                      |  ✅   |             ✅             |              ❌               |
| **Savdo qoralamasi** yaratish / tahrirlash / o'chirish             |  ✅   |             ✅             |              ✅               |
| Savdo tasdiqlash (naqd)                                            |  ✅   |             ✅             |              ✅               |
| Savdo tasdiqlash (nasiya)                                          |  ✅   |             ✅             |        ⚠️ limit bilan²        |
| **Tannarxdan past sotish**                                         |  ✅   |             ✅             |              ❌               |
| Savdo sanasini orqaga qo'yish                                      |  ✅   |             ✅             |              ❌               |
| **Qaytarish**                                                      |  ✅   |             ✅             |              ❌               |
| **Bekor qilish**                                                   |  ✅   |       ⚠️ o'z savdosi       |              ❌               |
| **Nasiya** ko'rish                                                 |  ✅   |             ✅             |       ⚠️ o'z savdolari        |
| Jadvalni qayta tuzish                                              |  ✅   |             ❌             |              ❌               |
| Erta yopish                                                        |  ✅   |             ✅             |              ❌               |
| **To'lov** qabul qilish                                            |  ✅   |             ✅             |              ✅               |
| To'lovni tasdiqlash (o'tkazma)                                     |  ✅   |             ✅             |              ❌               |
| To'lovni rad etish                                                 |  ✅   |             ✅             |              ❌               |
| **To'lovni qaytarish**                                             |  ✅   |             ❌             |              ❌               |
| **Kassa** qoldiqlarini ko'rish                                     |  ✅   |             ✅             |              ❌               |
| Kassa yozuvlarini ko'rish                                          |  ✅   |             ✅             |              ❌               |
| Qo'lda kirim / chiqim                                              |  ✅   |             ✅             |              ❌               |
| Qo'lda yozuvni tahrirlash / o'chirish                              |  ✅   |     ⚠️ o'zi yaratgani      |              ❌               |
| **Valyuta ayirboshlash**                                           |  ✅   |             ❌             |              ❌               |
| Boshlang'ich qoldiq                                                |  ✅   |             ❌             |              ❌               |
| Kassa hisobi yaratish                                              |  ✅   |             ❌             |              ❌               |
| **Hisobotlar** — savdo, ombor                                      |  ✅   |             ✅             |       ⚠️ o'z savdolari        |
| **Hisobotlar** — foyda, qarzdorlar                                 |  ✅   |             ✅             |              ❌               |
| **Sozlamalar** — do'kon, bildirishnoma                             |  ✅   |         ⚠️ o'qish          |              ❌               |
| **Sozlamalar** — moliyaviy (kurs ustamasi, nasiya standartlari)    |  ✅   |             ❌             |              ❌               |
| **Kurs** o'zgartirish                                              |  ✅   |             ❌             |              ❌               |
| **Foydalanuvchi** boshqarish                                       |  ✅   |             ❌             |              ❌               |
| **Audit** ko'rish                                                  |  ✅   |             ❌             |              ❌               |
| **AI insights**                                                    |  ✅   |             ⚠️             |              ❌               |
| Fayl yuklash                                                       |  ✅   |             ✅             |        ⚠️ chek surati         |
| Fayl ko'rish                                                       |  ✅   | ⚠️ `PASSPORT` dan tashqari | ⚠️ `RECEIPT`, `PRODUCT_IMAGE` |

¹ Enum'da hozir yo'q — ikkinchi xodim paydo bo'lganda qo'shiladi.
² Sozlamalarda belgilangan maksimal shartnoma summasidan oshmasligi
(kelajakdagi `Settings.seller_max_contract_amount`).

## 3. Kirish nazorati risklari (auditda aniqlangan)

| #   | Risk                                                           | Chora                                                                     |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| P4  | `DELETE /auth/sessions/:id` — boshqaning sessiyasini o'chirish | So'rov doim `WHERE user_id = :currentUser` bilan                          |
| P5  | `GET /files/:id` — har qanday faylni olish                     | `FileKind` bo'yicha ruxsat + `PASSPORT` uchun SHOP_ADMIN + audit (§6.7)   |
| P6  | `/payments/:id`, `/installments/:id` IDOR                      | Ko'p foydalanuvchida majburiy egalik tekshiruvi                           |
| P7  | Tannarx sizishi                                                | Serializatsiya guruhlari (`@Expose({ groups: ['cost'] })`)                |
| P2  | `PATCH /shops/me` mass assignment                              | Qat'iy DTO whitelist; `id`, `shopId`, `status` qabul qilinmaydi           |
| P3  | Rol eskalatsiyasi                                              | Rol o'zgartirish alohida endpoint, faqat SHOP_ADMIN, **o'ziga taqiq**    |
| P8  | **Cross-Shop IDOR** (§25.11)                                   | Shop konteksti Prisma extension'ida majburiy (§21.7); raw SQL — §21.8     |
| P9  | SUPERADMIN business data'ga kirishi (§25.3)                    | Alohida jadval va sessiya — SUPERADMIN'da `shopId` yo'q (§21.3)          |

## 4. Ma'lumotlar bazasi darajasidagi ruxsatlar

| Rol               | Huquq                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `hisobai_app`     | Ilova roli. `audit_logs` uchun faqat `INSERT` va `SELECT` — `UPDATE`/`DELETE` **rad etiladi** |
| `hisobai_migrate` | Migratsiya roli. DDL huquqi bor, faqat deploy paytida ishlatiladi                             |

Sabab: ARCHITECTURE §5 "o'zgarmas audit yozuvlari" deb e'lon qiladi. Bitta
superuser bilan ulanilsa, bu e'lon hech narsa bilan ta'minlanmagan bo'ladi.

## 5. Platforma darajasi — `SUPERADMIN` (§25.3, §21.3)

`SUPERADMIN` yuqoridagi matritsada **yo'q** va bu ataylab: u boshqa
jadvalda (`platform_admins`), boshqa sessiya cookie'sida va boshqa guard
ostida yashaydi. Ikkala rol bitta `UserRole` enum'ida bo'lganida,
"SUPERADMIN business data ko'rmaydi" degan invariant (§25.20) har bir
so'rovdagi tekshiruvga tayanardi — bitta unutilgan joy uni buzardi.

| Amal                                                       | SUPERADMIN |
| ---------------------------------------------------------- | :--------: |
| `/superadmin/*` panel                                      |     ✅     |
| SHOP_ADMIN account yaratish                                |     ✅     |
| SHOP_ADMIN accountlar ro'yxati va kartasi                  |     ✅     |
| Account statusini o'zgartirish (`ACTIVE`/`SUSPENDED`/`DISABLED`) | ✅   |
| Platforma darajasidagi audit ko'rish                       |     ✅     |
| **Barcha `/api/v1/*` biznes endpointlari**                 |     ❌     |
| Shop sozlamalari, katalog, ombor, mijoz, savdo, kassa, hisobot, AI | ❌ |
| SHOP_ADMIN nomidan CRM amali bajarish                      |     ❌     |
| Shop yaratish                                              |     ❌     |

Oxirgi qator §25.5 dan: Shop'ni **faqat SHOP_ADMIN o'zi** yaratadi.

### Mexanizm

| Qatlam           | Ifodasi                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------- |
| Sessiya          | Alohida cookie va `platform_sessions` jadvali — biznes `SessionGuard` uni o'qimaydi           |
| Guard            | `@PlatformOnly()` + `PlatformSessionGuard`; `@Roles()` bilan bir endpointda ishlatilmaydi      |
| Shop konteksti   | SUPERADMIN'da `shopId` **umuman yo'q** → shop-scoped so'rov bajarilmaydi (§21.7 kontekst xatosi) |
| Audit            | `SHOP_ADMIN_CREATED` · `_ACTIVATED` · `_DEACTIVATED` · `_BLOCKED` · `_UNBLOCKED` (§25.17)      |

### Account statusi (§21.6)

`SUSPENDED` yoki `DISABLED` account biznes endpointlarga kira olmaydi.
Tekshiruv `SessionGuard`da — sessiya bekor qilinmagan bo'lsa ham status
tekshiriladi, aks holda blok faqat keyingi logindan ta'sir qilardi.

`TZ.md` §25.18 dagi alohida Shop statusi MVP'da yo'q: 1 SHOP_ADMIN =
1 SHOP modelida u account statusini takrorlaydi. Branch modeli
qo'shilganda (§25.8) ajratiladi.
