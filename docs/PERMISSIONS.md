# HisobAI CRM — Ruxsat matritsasi (v0.2.1)

> **MVP holati (§16.14):** `UserRole` enum'ida **faqat `OWNER`** bor.
> `MANAGER` va `SELLER` bu hujjatda **kelajak uchun** loyihalashtirilgan,
> lekin enum'ga hozir **kiritilmaydi**.
>
> Sabab: amalga oshirilmagan rol — sinovdan o'tmagan xavfsizlik kodi
> demakdir. PostgreSQL'da enum'ga qiymat qo'shish arzon
> (`ALTER TYPE ... ADD VALUE`), olib tashlash qimmat. Shuning uchun
> minimaldan boshlanadi.

## 1. Mexanizm (MVP'da ham to'liq quriladi)

| Qoida                          | Ifodasi                                                                                                                          |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **Default DENY**               | Global guard. `@Roles(...)` dekoratori **yo'q** endpoint hech kimga ochilmaydi — 403                                             |
| **Ochiq endpointlar**          | Faqat `@Public()` bilan aniq belgilanganlar: `POST /auth/login`, `/auth/forgot-password`, `/auth/reset-password`, `GET /health*` |
| **Egalik tekshiruvi**          | Rol yetarli emas. `:id` bo'yicha resurs olinganda **egalik ham** tekshiriladi (sessiyalar, fayllar)                              |
| **Javob shakli rolga bog'liq** | Endpoint ochiq bo'lsa ham, ba'zi maydonlar (tannarx, foyda) rolga qarab javobdan olib tashlanadi                                 |

Uchinchi qoida muhim: `SELLER` `GET /sales/:id` ga kira olsa ham,
`costSnapshot` va foyda maydonlarini **ko'rmasligi** kerak. Bu endpoint
darajasida emas, **serializatsiya darajasida** hal qilinadi.

## 2. Matritsa

Belgilar: ✅ to'liq · ⚠️ cheklangan · ❌ yo'q

| Resurs / amal                                                      | OWNER |          MANAGER¹          |            SELLER¹            |
| ------------------------------------------------------------------ | :---: | :------------------------: | :---------------------------: |
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
| P5  | `GET /files/:id` — har qanday faylni olish                     | `FileKind` bo'yicha ruxsat + `PASSPORT` uchun OWNER + audit yozuvi (§6.7) |
| P6  | `/payments/:id`, `/installments/:id` IDOR                      | Ko'p foydalanuvchida majburiy egalik tekshiruvi                           |
| P7  | Tannarx sizishi                                                | Serializatsiya guruhlari (`@Expose({ groups: ['cost'] })`)                |
| P2  | `PATCH /settings` mass assignment                              | Qat'iy DTO whitelist; `id` va `baseCurrency` qabul qilinmaydi             |
| P3  | Rol eskalatsiyasi                                              | Rol o'zgartirish alohida endpoint, faqat OWNER, **o'ziga taqiq**          |

## 4. Ma'lumotlar bazasi darajasidagi ruxsatlar

| Rol               | Huquq                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `hisobai_app`     | Ilova roli. `audit_logs` uchun faqat `INSERT` va `SELECT` — `UPDATE`/`DELETE` **rad etiladi** |
| `hisobai_migrate` | Migratsiya roli. DDL huquqi bor, faqat deploy paytida ishlatiladi                             |

Sabab: ARCHITECTURE §5 "o'zgarmas audit yozuvlari" deb e'lon qiladi. Bitta
superuser bilan ulanilsa, bu e'lon hech narsa bilan ta'minlanmagan bo'ladi.
