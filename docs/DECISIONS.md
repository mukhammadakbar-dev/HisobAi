# HisobAI CRM — Qabul qilingan qarorlar

Bu fayl dizayn muhokamasi davomida kelishilgan qarorlarni yozib boradi.
Muhokama tugagach `TZ.md` va `ARCHITECTURE.md` v0.2 shu qarorlar asosida yangilanadi.

Muhokama boshlangan sana: 2026-08-05

---

## 0. Loyiha darajasidagi qarorlar

| # | Qaror | Izoh |
|---|-------|------|
| 0.1 | Brend nomi — **HisobAI** | `docs/`dagi "Baraka Mobile" nomi yangilanadi |
| 0.2 | Fayl saqlash — **MinIO** (S3-mos) | `StorageProvider` adapteri ortida; Docker yo'q, binary sifatida o'rnatiladi |
| 0.3 | Ishlab chiqish muhiti — **lokal PostgreSQL** | Docker image faqat production uchun yoziladi |
| 0.4 | Git — **darhol commit + GitHub private repo** | Kod yo'qolib ketmasligi uchun |

---

## 1. Valyuta tizimi

| # | Qaror |
|---|-------|
| 1.1 | **Bazaviy valyuta — UZS.** Barcha hisobot, foyda va dashboard so'mda |
| 1.2 | **Mahsulotga bitta valyuta** — tannarx ham, sotuv narxi ham o'sha valyutada |
| 1.3 | **Qarz savdo valyutasida qoladi.** USD'da sotilgan mahsulot qarzi USD'da qoladi |
| 1.4 | **Kurs manbai — CBU API**, admin qo'lda tuzata oladi |
| 1.5 | API ishlamasa — oxirgi ma'lum kurs + UI'da "kurs eskirgan" ogohlantirishi. Ilova to'xtamaydi |
| 1.6 | **Kassada so'm va dollar qoldig'i alohida** yuritiladi |
| 1.7 | Kurs har savdo/to'lovda **snapshot** sifatida saqlanadi va hech qachon qayta hisoblanmaydi |
| 1.8 | Qaytarish va bekor qilish **asl kursda** bajariladi — teskari yozuv savdoni aniq nolga chiqaradi |
| 1.9 | **Bitta savdo — bitta valyuta.** Boshqa valyutadagi mahsulot savatga qo'shilganda savdo kursida aylantiriladi |
| 1.10 | Yaxlitlash: USD 2 xona, UZS butun songacha (tiyin ishlatilmaydi) |

---

## 2. Kirish, sessiya va xavfsizlik

| # | Qaror |
|---|-------|
| 2.1 | **MVP'da bitta foydalanuvchi**, lekin baza ko'p foydalanuvchini ko'taradi: `users` jadvali + `role` maydoni |
| 2.2 | Audit har amalni **aniq qaysi foydalanuvchi** qilganini yozadi — keyin rol qo'shish qayta qurish talab qilmaydi |
| 2.3 | UI'da rol tanlash yo'q; ruxsat tekshiruvi kodda bor, lekin bitta rol bilan ishlaydi |
| 2.4 | Parol **Argon2id** bilan hash qilinadi |
| 2.5 | **Parol tiklash — email orqali havola** (SMTP; provider 15-mavzuda tanlanadi) |
| 2.6 | SMTP ulangunicha zaxira — server komandasi orqali parol o'rnatish |
| 2.7 | **Sessiya 30 kun.** Sozlamalarda faol sessiyalar ro'yxati (qurilma, IP, oxirgi kirish) va ularni o'chirish imkoni |
| 2.8 | Sessiya cookie'si `HttpOnly`, `Secure`, `SameSite`; CSRF himoyasi qo'llanadi |
| 2.9 | Login urinishi cheklanadi: **5 marta xato → 15 daqiqa blok** (IP va email bo'yicha) |
| 2.10 | **Kirish jurnali:** muvaffaqiyatli va muvaffaqiyatsiz urinishlar yoziladi (vaqt, IP, qurilma), sozlamalarda ko'rinadi |

### Joylashuvi

| Qism | Manzil |
|------|--------|
| Sahifa | `/login` — yagona ochiq sahifa |
| API | `POST /auth/login` · `POST /auth/logout` · `GET /auth/me` · `POST /auth/forgot-password` · `POST /auth/reset-password` |
| Jadval | `users`, `sessions`, `login_attempts` |
| Modul | `Auth` |

---

## 3. Sozlamalar va valyuta kursi

| # | Qaror |
|---|-------|
| 3.1 | **Ikkita kurs saqlanadi:** CBU kursi (avtomatik, ma'lumot uchun) va **do'kon kursi** (savdo va to'lovlarda ishlatiladi) |
| 3.2 | Do'kon kursi CBU'dan ustama bilan avtomatik hisoblanadi yoki qo'lda kiritiladi; ikkalasi UI'da yonma-yon ko'rinadi |
| 3.3 | CBU kursi har kuni **09:00 (Toshkent)** da olinadi; har kun uchun bitta qator |
| 3.4 | **Kurs eskirsa savdo to'xtamaydi:** oxirgi ma'lum kurs ishlatiladi + ekran tepasida ogohlantirish chizig'i |
| 3.5 | Kurs tarixi saqlanadi: sana, CBU kursi, do'kon kursi, manba (`CBU`/`MANUAL`), olingan vaqt, kim o'zgartirgan |
| 3.6 | Do'kon sozlamalari: **nom, logo, manzil, telefon** — PDF, login sahifasi va eksportlarda |
| 3.7 | Do'kon sozlamalari: **ish vaqti va dam olish kunlari** — hisobot o'rtachalari uchun va dam olish kunida eslatma yubormaslik uchun |
| 3.8 | Do'kon sozlamalari: **umumiy kam qoldiq chegarasi** — mahsulotga alohida chegara qo'yilmasa shu ishlatiladi |
| 3.9 | Do'kon sozlamalari: **standart nasiya shartlari** (muddat, boshlang'ich to'lov foizi) — formada oldindan to'ldiriladi, har savdoda o'zgartirilishi mumkin |
| 3.10 | Sozlamalar audit'i: **kurs va moliyaviy sozlamalar** o'zgarishi yoziladi (kim, qachon, nimadan nimaga) |

### Joylashuvi

| Qism | Manzil |
|------|--------|
| Sahifa | `/settings` — Profil · Do'kon · Valyuta · Bildirishnomalar · Xavfsizlik |
| API | `GET/PATCH /settings` · `GET /exchange-rates` · `GET /exchange-rates/today` · `PUT /exchange-rates/:date` |
| Jadval | `settings` (bitta qator, tipli ustunlar) · `exchange_rates` |
| Modul | `Settings` |

---

## 4. Katalog (mahsulot shablonlari)

### Asosiy tushuncha

**Mahsulot (shablon)** va **ombor birligi (fizik narsa)** ajratiladi:

- `products` — "iPhone 15 Pro 256GB Qora": nomi, brendi, tavsiya narxi. Pul harakati va qoldiq yo'q.
- `inventory_items` — aynan shu IMEI'li telefon: o'z tannarxi, o'z holati. (4-mavzu)

Sabab: bir xil modelni har safar boshqa narxda olasiz. Tannarx shablonda tursa, foyda noto'g'ri hisoblanadi.

| # | Qaror |
|---|-------|
| 4.1 | **Haqiqiy tannarx har ombor birligida** (yoki miqdorli mahsulotda — partiyada) saqlanadi |
| 4.2 | Mahsulot kartasidagi tannarx — **faqat ma'lumot uchun** (oxirgi/o'rtacha), qabul formasida oldindan to'ldiriladi |
| 4.3 | **Kategoriya va brend — alohida jadvallar**, avtoto'ldirish bilan. Dublikat oldi olinadi |
| 4.4 | Yangi kategoriya/brendni mahsulot formasidan turib qo'shish mumkin; sozlamalarda tahrirlash va birlashtirish |
| 4.5 | Mahsulot maydonlari: kategoriya, brend, model, **xotira**, **rang**, turi (seriyali/miqdorli), valyuta, tavsiya narxi, kam qoldiq chegarasi, tavsif |
| 4.6 | **Mahsulot nomi avtomatik yig'iladi:** brend + model + xotira + rang → "Apple iPhone 15 Pro 256GB Qora" |
| 4.7 | Aksessuarlarda xotira va rang bo'sh qoladi |
| 4.8 | **Mahsulot o'chirilmaydi — arxivlanadi** (`is_active`). Yangi savdoda ko'rinmaydi, eski yozuvlar butun qoladi |
| 4.9 | **IMEI/shtrix-kodni telefon kamerasi bilan skanerlash** — qabul qilish va savdo formasida |
| 4.10 | **Mahsulot shabloniga rasm** biriktirish (MinIO'da saqlanadi) |

### Joylashuvi

| Qism | Manzil |
|------|--------|
| Sahifa | `/products` · `/products/new` · `/products/:id` · `/settings/catalog` |
| API | `GET/POST /products` · `GET/PATCH /products/:id` · `GET/POST /categories` · `GET/POST /brands` |
| Jadval | `categories` · `brands` · `products` |
| Modul | `Catalog` |

---

## 5. Ombor (fizik birliklar va harakat)

| # | Qaror |
|---|-------|
| 5.1 | **Seriyali mahsulot** — har fizik birlik alohida yozuv (`inventory_items`), o'z tannarxi va holati bilan |
| 5.2 | **Miqdorli mahsulot** — partiya bo'yicha (`inventory_batches`): miqdor + donasiga tannarx. Sabab: har partiya boshqa narxda keladi, foyda aniq hisoblanishi kerak |
| 5.3 | **IMEI-1 va IMEI-2** (ikkinchisi ixtiyoriy). Ikkalasi bo'yicha qidiruv ishlaydi, ikkalasi ham takrorlanmaydi |
| 5.4 | **"Rezerv" holati olib tashlandi.** Holatlar: `MAVJUD` · `SOTILGAN` · `QAYTARILGAN` · `CHIQARILGAN` |
| 5.5 | Savdo qoralamasi mahsulotni ushlab turmaydi. Bir xil IMEI ikki qoralamada bo'lishi mumkin — **birinchi tasdiqlagan oladi**, ikkinchisiga xato qaytariladi |
| 5.6 | **Inventarizatsiya** ekrani: jismonan sanab, tizimdagi qoldiq bilan solishtirish; farq sababi bilan tuzatiladi |
| 5.7 | Tuzatish sababi: `yo'qolgan` · `nuqsonli` · `xato hisob` · `boshqa`. Bitta mexanizm sinib qolgan va yo'qolgan mahsulotni ham qamraydi; hisobotda sabablar ajratiladi |
| 5.8 | **Shaxsiy foydalanishga olish** — mahsulot ombordan chiqadi, tannarx miqdorida xarajat sifatida yoziladi |
| 5.9 | **Ombor qiymati bugungi do'kon kursida** baholanadi. Foyda hisobi esa savdo paytidagi snapshot kursda qoladi — o'tgan davr hisoboti o'zgarmaydi |
| 5.10 | `stock_movements` har o'zgarishni yozadi va hech qachon o'chirilmaydi: `QABUL` · `SOTUV` · `QAYTARISH` · `TUZATISH` · `SHAXSIY` |
| 5.11 | Qabul qilish bitta tranzaksiyada; bir nechta IMEI'ni birdaniga kiritish mumkin |

### Joylashuvi

| Qism | Manzil |
|------|--------|
| Sahifa | `/inventory` · `/inventory/receive` · `/inventory/:id` · `/inventory/stocktake` |
| API | `GET /inventory` · `POST /inventory/receive` · `GET /inventory/:id` · `GET /inventory/movements` · `POST /inventory/adjust` |
| Jadval | `inventory_items` · `inventory_batches` · `stock_movements` |
| Modul | `Inventory` |

---

## 6. Mijozlar

| # | Qaror |
|---|-------|
| 6.1 | Naqd savdoda mijoz **ixtiyoriy**, nasiyada **majburiy** |
| 6.2 | Telefon **E.164 formatiga normalizatsiya** qilinadi (`+998901234567`) va takrorlanmaydi |
| 6.3 | Kiritish paytida dublikat tekshiriladi: "Bu raqam Alisher Karimovda bor. O'shami?" |
| 6.4 | **Asosiy telefon** (majburiy, SMS shunga ketadi, unique) + **qo'shimcha telefon** (ixtiyoriy). Ikkalasi bo'yicha qidiriladi |
| 6.5 | **Passport ma'lumoti:** seriya, raqam, JSHSHIR — matn maydonlari. Nasiya shartnomasi PDF'ida chiqadi |
| 6.6 | **Passport rasmi** biriktiriladi (MinIO) |
| 6.7 | Passport rasmi hech qachon ochiq havolada bo'lmaydi — faqat vaqtinchalik, autentifikatsiyalangan havola; **kim ko'rgani audit'ga yoziladi** |
| 6.8 | Kafil ma'lumoti **kiritilmaydi** (scope'dan tashqari) |
| 6.9 | **"Ehtiyot bo'ling" belgisi** + sababi. Nasiya savdo boshlanganda ogohlantiradi, lekin **taqiqlamaydi** |
| 6.10 | To'lov intizomi ko'rsatkichi **hisoblanmaydi** — to'lovlar tarixi baribir ko'rinadi |
| 6.11 | **Joriy qarz USD va UZS alohida** ko'rsatiladi (qarz savdo valyutasida qoladi) |
| 6.12 | Qarz **hech qachon qo'lda yozilmaydi** — faqat tranzaksiyalardan hisoblanadi |
| 6.13 | Savdosi bor mijoz o'chirilmaydi — **arxivlanadi** |

### Joylashuvi

| Qism | Manzil |
|------|--------|
| Sahifa | `/customers` · `/customers/:id` |
| API | `GET/POST /customers` · `GET/PATCH /customers/:id` · `GET /customers/:id/history` |
| Jadval | `customers` |
| Modul | `Customers` |

---

## 7. Savdo (naqd)

### Ikki bosqichli oqim

`QORALAMA` — istalgancha o'zgartiriladi, o'chiriladi, hech narsaga ta'sir qilmaydi.
`TASDIQLANGAN` — o'zgartirilmaydi va o'chirilmaydi; faqat qaytarish bilan tuzatiladi.

### Tasdiqlash tranzaksiyasi (hammasi bitta tranzaksiyada)

1. Mahsulotlar hali mavjudmi — tekshiriladi
2. `sales` + `sale_items` yaratiladi, **kurs snapshot** va **tannarx snapshot** yoziladi
3. Ombor birligi `SOTILGAN` bo'ladi / miqdor kamayadi + `stock_movements`
4. To'langan summa `cash_entries`ga kirim (valyutasi bo'yicha tegishli kassaga)
5. Audit yozuvi

Bittasi xato bersa — hech biri saqlanmaydi.

| # | Qaror |
|---|-------|
| 7.1 | **Aralash to'lov qo'llab-quvvatlanadi.** Bitta savdoga bir nechta to'lov: har biri o'z usuli, valyutasi va holatiga ega |
| 7.2 | **Arxitektura tuzatildi:** `payments` jadvali savdoga ham, nasiya shartnomasiga ham bog'lana oladi. Ilgari faqat `contract_id` bor edi — naqd savdo to'lovini yozadigan joy yo'q edi |
| 7.3 | **Alohida chegirma maydoni yo'q** — sotuv narxi to'g'ridan-to'g'ri o'zgartiriladi |
| 7.4 | Savdo qatorida **tavsiya narx ham snapshot** qilinadi; chegirma hisoboti `tavsiya narx − haqiqiy narx` sifatida hisoblanadi |
| 7.5 | **Savdo sanasini 7 kungacha orqaga** qo'yish mumkin; o'zgartirilgani audit'ga yoziladi |
| 7.6 | **Savdo raqami:** yil + ketma-ket raqam (`2026-00147`), har yil boshida qaytadan |
| 7.7 | **Qoralamani saqlash** mumkin — ombor va kassaga ta'sir qilmaydi |
| 7.8 | **Tannarxdan past sotishda ogohlantirish** chiqadi, lekin taqiqlamaydi |
| 7.9 | **Savat ichida har qatorning foydasi** ko'rsatiladi |
| 7.10 | **Kalkulator savdo formasida** ochiladi, natijani narx maydoniga o'tkazadi |
| 7.11 | Har savdo qatorida saqlanadi: mahsulot, miqdor, sotuv narxi, **tannarx snapshot**, tavsiya narx snapshot |

### Joylashuvi

| Qism | Manzil |
|------|--------|
| Sahifa | `/sales` · `/sales/new` · `/sales/:id` |
| API | `GET/POST /sales` · `GET /sales/:id` · `PATCH /sales/:id` (faqat qoralama) · `DELETE /sales/:id` (faqat qoralama) · `POST /sales/:id/confirm` · `POST /sales/:id/return` · `POST /sales/:id/cancel` (§17.18 — ilgari bu yerda `/reverse` yozilgan edi, §8 bilan zid edi) |
| Jadval | `sales` · `sale_items` · `payments` |
| Modul | `Sales` |

---

## 8. Qaytarish va bekor qilish

### Ikki xil holat ajratiladi

- **Bekor qilish** — savdo xato kiritilgan, jismonan hech narsa bo'lmagan. Hisobotda savdo umuman bo'lmagandek.
- **Qaytarish** — mahsulot haqiqatan qaytib keldi. Hisobotda savdo ham, qaytarish ham ko'rinadi.

Asl savdo **hech qachon o'chirilmaydi** — ustiga teskari yozuv qo'shiladi.

| # | Qaror |
|---|-------|
| 8.1 | Qaytarish **asl savdoning kursida** bajariladi — savdo aniq nolga chiqadi, soxta kurs foydasi paydo bo'lmaydi |
| 8.2 | Qaytgan mahsulot omborga qaytadi va **"qaytarilgan" belgisi + sababi** bilan saqlanadi. Qo'shimcha eslatma yoki narx tavsiyasi ko'rsatilmaydi |
| 8.3 | Qaytgan mahsulot ombor qiymatida to'liq hisoblanadi |
| 8.4 | **Qisman qaytarish** mumkin — savdodagi tanlangan qatorlar; miqdorli mahsulotda qisman miqdor ham |
| 8.5 | **Nasiya savdo qaytarilsa:** tizim shartnomani yopadi va mahsulotni omborga qaytaradi. To'langan pulni qaytarish/qaytarmaslikni **admin qo'lda hal qiladi** — tizim majburlamaydi |
| 8.6 | **Sabab majburiy** (nuqson / mijoz fikri o'zgardi / xato kiritildi / boshqa), audit'ga yoziladi |
| 8.7 | **Qaytarish o'z sanasiga yoziladi**, savdo sanasiga emas. O'tgan davr aylanmasi o'zgarmaydi |
| 8.8 | **Muddat cheklovi yo'q** — 8.7 tufayli kerak emas: eski savdoni qaytarish o'tgan oy hisobotini buzmaydi |

### Joylashuvi

| Qism | Manzil |
|------|--------|
| Sahifa | `/sales/:id` — "Qaytarish" va "Bekor qilish" tugmalari; `/sales` filtrida "qaytarilganlar" |
| API | `POST /sales/:id/return` · `POST /sales/:id/cancel` |
| Jadval | `sales` (**`reverses_sale_id`** — §17.18) · `sale_items` · `stock_movements` · `payments` |
| Modul | `Sales` |

---

## 9. Nasiya shartnoma va to'lov jadvali

| # | Qaror |
|---|-------|
| 9.1 | Shartnoma savdo tasdiqlanganda **o'sha tranzaksiya ichida** yaratiladi |
| 9.2 | Shartnoma valyutasi = savdo valyutasi, **o'zgarmaydi** |
| 9.3 | **Alohida ustama maydoni:** naqd narx ko'rsatiladi, ustiga ustama qo'shiladi — summa yoki foiz |
| 9.4 | Hisobotda **"nasiya ustamasidan daromad"** alohida ko'rinadi |
| 9.5 | Jadval **oylik avtomatik**, **qo'lda** yoki **aralash** tuziladi |
| 9.6 | **Jadval summasi qarzga teng bo'lishi shart** — teng bo'lmasa savdo tasdiqlanmaydi |
| 9.7 | Holatlar: `FAOL` · `YOPILGAN` · `BEKOR QILINGAN` |
| 9.8 | **"Muddati o'tgan" saqlanmaydi — sanadan hisoblanadi.** Saqlansa uni yangilab turadigan jarayon kerak bo'ladi va u ishlamay qolsa holat yolg'on ko'rsatadi |
| 9.9 | **Jarima yo'q.** Kechikish faqat ogohlantirish sifatida ko'rsatiladi |
| 9.10 | **Jadvalni qayta tuzish faqat to'lanmagan qatorlarda.** To'langan yoki qisman to'langan qatorlarga tegib bo'lmaydi |
| 9.11 | Qayta tuzish sababi bilan audit'ga yoziladi; umumiy qarz summasi o'zgarmaydi — faqat sanalar/summalar taqsimoti |
| 9.12 | **Erta yopish:** "Qarzni yopish" tugmasi qolgan summani ko'rsatadi, mijoz to'laydi, shartnoma yopiladi. Ustama qaytarilmaydi |
| 9.13 | Standart muddat va boshlang'ich to'lov foizi sozlamalardan oldindan to'ldiriladi (3.9) |

### Joylashuvi

| Qism | Manzil |
|------|--------|
| Sahifa | `/installments` · `/installments/:id` |
| API | `GET /installments` · `GET /installments/:id` · `PATCH /installments/:id/schedule` · `POST /installments/:id/close` |
| Jadval | `installment_contracts` · `payment_schedules` |
| Modul | `Installments` |

---

## 10. To'lovlar va tasdiqlash

### Holatlar

| Holat | Ma'nosi |
|-------|---------|
| `TEKSHIRILMOQDA` | Transfer bildirilgan, admin hali tasdiqlamagan |
| `TASDIQLANGAN` | Pul qabul qilindi — qarz kamayadi, kassaga tushadi |
| `RAD ETILGAN` | Tasdiqlanmadi — moliyaviy hisobga umuman kirmaydi |
| `QAYTARILGAN` | Ilgari tasdiqlangan to'lov teskari yozuv bilan bekor qilindi |

Naqd to'lov darhol `TASDIQLANGAN`. **Faqat `TASDIQLANGAN` to'lov qarzni kamaytiradi va kassaga tushadi.**

### Valyuta aylanishi

To'lov yozuvida uchalasi ham saqlanadi: **haqiqatda berilgan summa va valyutasi**, **o'sha paytdagi do'kon kursi**, **qarzdan qancha ayrilgani**. Shunda hisob har qanday tekshiruvda qayta tiklanadi.

| # | Qaror |
|---|-------|
| 10.1 | To'lov **eng eski to'lanmagan qatordan boshlab avtomatik taqsimlanadi**; ortgani keyingisiga o'tadi |
| 10.2 | **Ortiqcha to'lov qabul qilinmaydi:** ogohlantiradi va faqat qarz miqdoricha oladi. Tizimda "avans/mijoz balansi" tushunchasi yo'q |
| 10.3 | **Chek rasmi ixtiyoriy** — biriktirish mumkin, lekin tasdiqlash uchun shart emas |
| 10.4 | **To'lov sanasini 7 kungacha orqaga** qo'yish mumkin; o'zgartirilgani audit'ga yoziladi |
| 10.5 | Kassaga **haqiqiy pul o'z valyutasida** yoziladi (so'm to'lansa so'm kassasiga), qarzdan esa shartnoma valyutasida ayriladi |
| 10.6 | To'lovni qaytarish (`QAYTARILGAN`) teskari kassa yozuvi yaratadi va qarzni tiklaydi |

### Joylashuvi

| Qism | Manzil |
|------|--------|
| Sahifa | `/payments` ("tekshirish kutilmoqda" filtri birinchi) · `/installments/:id` ichidan |
| API | `POST /payments` · `POST /payments/:id/confirm` · `POST /payments/:id/reject` · `POST /payments/:id/reverse` |
| Jadval | `payments` |
| Modul | `Payments` |

---

## 11. Kassa (pul kirim-chiqimi)

Savdo ma'lumoti va haqiqiy pul — bir xil narsa emas. Nasiyaga sotilgan telefon aylanmada bor, lekin kassada pul yo'q.

| # | Qaror |
|---|-------|
| 11.1 | **Alohida hisoblar:** "Naqd UZS", "Naqd USD", "Karta/bank UZS" va h.k. Har to'lov o'z hisobiga tushadi |
| 11.2 | Yangi hisob qo'shish mumkin; hisobotda hammasi bazaviy valyutada jamlanadi |
| 11.3 | Sabab: karta puli kassa yashigida yo'q. Bir joyga qo'shilsa, kun oxirida naqd pulni sanaganda tizim bilan hech qachon to'g'ri kelmaydi |
| 11.4 | **Boshlang'ich qoldiq** — har hisob uchun bir marta (sana + summa), alohida yozuv turi. Hisobotlarda daromad deb sanalmaydi |
| 11.5 | Ombor uchun ham xuddi shunday: mavjud mahsulotlar qabul qilish orqali kiritiladi |
| 11.6 | **Valyuta ayirboshlash — alohida amal:** qaysi hisobdan qancha chiqdi, qaysi hisobga qancha kirdi, qanday kurs bo'yicha. Daromad deb sanalmaydi; kurs farqi hisobotda alohida ko'rinadi |
| 11.7 | **Avtomatik yozuvlar qo'lda tahrirlanmaydi** — tuzatish faqat savdo/to'lovni qaytarish orqali |
| 11.8 | **Qo'lda kiritilgan yozuv o'sha kuni ichida tahrirlanadi yoki o'chiriladi** (audit'ga yoziladi); ertasiga faqat teskari yozuv bilan |
| 11.9 | Har yozuvda: sana, summa, valyuta, hisob, kirim/chiqim, kategoriya, izoh, ilova (chek surati) |
| 11.10 | Kategoriyalar: ijara, kommunal, maosh, reklama, yetkazib berish, boshqa — yangisini qo'shish mumkin |

### Joylashuvi

| Qism | Manzil |
|------|--------|
| Sahifa | `/cashbook` · `/cashbook/new` |
| API | `GET /cash-entries` · `POST /cash-entries` · `PATCH /cash-entries/:id` · `GET /cashbook/balances` · `POST /cashbook/exchange` |
| Jadval | `cash_accounts` · `cash_entries` · `cash_categories` |
| Modul | `Cashbook` |

---

## 12. Kalkulator

| # | Qaror |
|---|-------|
| 12.1 | Rejimlar: **oddiy amallar** va **valyuta aylantirish** (USD ↔ UZS, do'kon kursi avtomatik, qo'lda o'zgartirish mumkin) |
| 12.2 | **TZ §3.7 dagi "chegirma, ustama va bo'lib to'lash" rejimlari olib tashlandi.** Sabab: chegirma maydoni yo'q (7.3), ustama nasiya formasining o'zida kiritiladi (9.3), oylik to'lov esa jadval tuzilganda avtomatik hisoblanadi (9.5) — kalkulatorda takrorlash keraksiz |
| 12.3 | **Serverga so'rov yubormaydi** — butunlay brauzerda. Internet uzilsa ham ishlaydi |
| 12.4 | Moliyaviy yozuv yaratmaydi; natijani savdo formasiga o'tkazish mumkin |
| 12.5 | Oxirgi 10 ta hisob brauzer xotirasida saqlanadi, serverga yuborilmaydi |
| 12.6 | Istalgan ekrandan ochiladigan suzuvchi tugma + savdo formasida narx maydoni yonida |

### Joylashuvi

API va jadval **yo'q** — faqat frontend komponenti.

---

## 13. Hisobotlar

| # | Qaror |
|---|-------|
| 13.1 | **Foyda savdo kunida to'liq tan olinadi** (nasiyada ham). "Bugun qancha ishladim" degan savolga to'g'ri javob beradi |
| 13.2 | Pul oqimi kassa hisobotida **alohida** ko'rsatiladi — foyda va pul oqimi aralashmaydi |
| 13.3 | **Yalpi foyda** (sotuv − tannarx) va **sof foyda** (yalpi − xarajatlar) yonma-yon ko'rsatiladi |
| 13.4 | **Eksport (CSV/XLSX) keyingi relizga** qoldiriladi — MVP'da hisobotlar faqat ekranda |
| 13.5 | **Oldingi davr bilan solishtirish** — har ko'rsatkich yonida `+33%` / `−12%` |
| 13.6 | **Savdo va foyda dinamikasi grafigi** |
| 13.7 | **Mahsulot bo'yicha foyda jadvali** — qaysi model qancha sotildi va qancha foyda keltirdi |
| 13.8 | **Qarzdorlar ro'yxati** — kim qancha qarzdor, qachon to'lashi kerak, necha kun kechikkan; muddati o'tganlar tepada |
| 13.9 | Davrlar: kunlik, haftalik, oylik, yillik, ixtiyoriy oraliq |
| 13.10 | **Hisobotlar saqlanmaydi — har safar hisoblanadi.** Saqlansa, savdo qaytarilganda eski hisobot noto'g'ri bo'lib qoladi |

### Joylashuvi

| Qism | Manzil |
|------|--------|
| Sahifa | `/reports` |
| API | `GET /reports/summary` · `/reports/sales` · `/reports/profit` · `/reports/debts` · `/reports/inventory` · `/reports/top-products` |
| Jadval | Yangi jadval yo'q |
| Modul | `Reports` |

---

## 14. Dashboard

| # | Qaror |
|---|-------|
| 14.1 | **Bitta so'rov** (`GET /dashboard`) hamma ma'lumotni qaytaradi — telefon internetida tez ochilishi uchun |
| 14.2 | **Faqat bugungi kun.** Kengroq davr uchun `/reports` sahifasiga o'tiladi |
| 14.3 | Telefonda birinchi ekranda: **bugungi savdo va foyda** · **bugun/ertaga to'lovi keladiganlar** · **kassadagi pul (qoldiqlar)** |
| 14.4 | Muddati o'tgan qarzlar, ombor qiymati, kam qolgan mahsulotlar, so'nggi amallar va grafik — pastroqda, lekin dashboard'da qoladi (TZ §3.1 to'liq bajariladi) |
| 14.5 | Dashboard tepasida **bugungi kurs** (CBU va do'kon) hamda kurs eskirgan bo'lsa ogohlantirish |
| 14.6 | Tezkor amal: **faqat "Yangi savdo"** — barcha sahifalarda pastda suzib turadi (TZ §5 talabi) |
| 14.7 | Yangilanish: sahifa ochilganda + pastga tortib qo'lda. Avtomatik yangilanish yo'q — trafik va batareyani tejaydi |

### Joylashuvi

| Qism | Manzil |
|------|--------|
| Sahifa | `/dashboard` |
| API | `GET /dashboard` |
| Modul | `Reports` ichida |

---

## 15. Hujjatlar (PDF) va fayllar

| # | Qaror |
|---|-------|
| 15.1 | **Faqat nasiya shartnomasi PDF'i** yaratiladi. TZ §3.8 dagi "qarz jadvali PDF"i olib tashlandi |
| 15.2 | **Shartnoma PDF'i MinIO'da saqlanadi** — mijozga bergan nusxa bilan aynan bir xil qoladi |
| 15.3 | Jadval qayta tuzilsa (9.10) **yangi versiya saqlanadi, eskisi ham qoladi** |
| 15.4 | Hujjatlardagi ziddiyat hal qilindi: `ARCHITECTURE.md` §7 dagi "doimiy storage talab qilinmaydi" bandi shartnoma uchun **o'zgartiriladi** |
| 15.5 | Fayl **hech qachon ochiq havolada bo'lmaydi** — API 15 daqiqalik vaqtinchalik havola beradi |
| 15.6 | Fayl turlari: passport rasmi (mijoz), chek surati (to'lov), mahsulot rasmi (katalog), ilova (kassa yozuvi) |
| 15.7 | Cheklov: **10 MB**, avtomatik siqish **yo'q** — fayl asl sifatida saqlanadi |
| 15.8 | Shartnoma PDF mazmuni: logo va do'kon ma'lumoti, shartnoma raqami va sanasi, mijoz + passport, mahsulot + IMEI, summa/boshlang'ich/qarz, to'liq jadval, imzo joylari |

### Joylashuvi

| Qism | Manzil |
|------|--------|
| API | `POST /documents/contracts/:id/pdf` · `GET /files/:id` (vaqtinchalik havola) · `POST /files` |
| Jadval | `documents` · `files` |
| Modul | `Documents` · `Storage` (MinIO adapteri) |

---

## 16. Aniqlashtirishlar (v0.2.1 — 2026-08-09 audit)

Loyiha auditidan keyin hujjatlarda javobsiz qolgan 14 ta savol yopildi.
Har qaror uchun **sabab** va **kelajakda nima uchun buzmasligi** yozilgan.

| # | Qaror | Sabab |
|---|-------|-------|
| 16.1 | **Savdo valyutasini foydalanuvchi aniq tanlaydi**, default `UZS`. Birinchi mahsulotdan taxmin qilinmaydi. Qoralama davomida o'zgartirish mumkin, tasdiqdan keyin yo'q | §1.9 savdo valyutasini birlamchi qiladi ("boshqa valyutadagi mahsulot **savdo kursida** aylantiriladi"). USD tannarxli telefonni so'mda sotish — eng ko'p uchraydigan holat. Taxminiy model USD telefon + UZS aksessuar holatida bir ma'noli javob bermaydi |
| 16.2 | **`store_rate_markup` — foiz.** Ustun `store_rate_markup_percent Decimal(5,2)`. `store_rate = round(cbu_rate × (1 + p/100))`, butun so'mgacha | Absolyut ustama kurs o'sishi bilan jimgina siqiladi (200 so'm: 12 000 da 1.67%, 15 000 da 1.33%). §3.2 "avtomatik hisoblanadi" deydi — avtomatik qiymat qo'lda qayta sozlashni talab qilmasligi kerak. `default_down_payment_percent Decimal(5,2)` bilan bir xil tip |
| 16.3 | **0% boshlang'ich to'lov ruxsat etiladi**, ogohlantirish chiqadi, taqiq yo'q | Loyihaning izchil naqshi: §6.9 va §7.8 — biznes qarorida *ogohlantiradi, taqiqlamaydi*. Qat'iy taqiq faqat matematik invariant uchun (§9.6). §3.9 default 30% — oldindan to'ldirish, cheklov emas |
| 16.4 | **`RETURNED` mahsulot qayta sotiladi.** Ega "Sotuvga qaytarish" tugmasini bosadi → `status = AVAILABLE`, **`return_reason` o'chirilmaydi**. Nuqsonli bo'lsa → `WRITTEN_OFF`. Savdo formasida "qaytarilgan mahsulot" belgisi ko'rinadi | Schema buni allaqachon qo'llab-quvvatlaydi: `return_reason` — `status` dan **alohida ustun**, ya'ni "holat o'zgaradi, sabab qoladi". §8.3 qaytgan mahsulotni ombor qiymatiga **to'liq** qo'shishni talab qiladi — sotib bo'lmaydigan mahsulotni to'liq baholash noto'g'ri. Aks holda `RETURNED` — chiqish yo'li yo'q o'lik holat |
| 16.5 | **Bekor qilish asl savdo sanasiga yoziladi.** Faqat oxirgi **7 kun** ichidagi savdolarga qo'llanadi; eskisi uchun faqat qaytarish | §8 ta'rifi: "hisobotda savdo **umuman bo'lmagandek**". Bugungi sanaga yozilsa — ikki kunning aylanmasi buziladi, ta'rif bajarilmaydi. §8.7 ("o'z sanasiga") qaytarish bandi va sababi qaytarishga xos: mahsulot **bugun** qaytdi — haqiqiy hodisa. Bekor qilishda hodisa yo'q. 7 kun — §7.5 dagi mavjud oyna, yangi konstanta emas |
| 16.6 | **Kurs eskirishi: bugungi sana uchun qator yo'q bo'lsa — darhol eskirgan.** Sun'iy chegara yo'q. UI: 1 kun → sariq, ≥3 kun → qizil. Savdo hech qachon to'xtamaydi (§1.5) | §3.3 "har kun uchun bitta qator" bir ma'noli signal beradi. Har qanday chegara (2-3 kun) — **jim oyna**: "noto'g'ri kursda savdo qilamiz, lekin aytmaymiz". Chegara UI keskinligida bo'lsin, haqiqat aytilishida emas |
| 16.7 | **CBU retry:** 09:00 → +15 daq → +1 soat → +3 soat (jami 4 urinish). Server ishga tushganda ham (vaqt ≥ 09:00 va bugungi qator yo'q bo'lsa) bitta urinish | Yangi tushuncha kiritilmaydi — ARCHITECTURE §10 eslatma jarayoni uchun aynan shu naqshni ("har kuni + server ishga tushganda") allaqachon belgilagan. §1.5 ilova to'xtamasligini kafolatlagani uchun cheksiz retry keraksiz |
| 16.8 | **`source = MANUAL` bo'lgan kursni cron ustidan yozmaydi.** `cbu_rate` va `fetched_at` yangilanishi mumkin, `store_rate` — hech qachon. UI'da "CBU kursiga qaytarish" alohida amali | Ikki ustunning mavjudligining butun sababi shu: §3.1 `cbu_rate` ni "ma'lumot uchun", `store_rate` ni "savdoda ishlatiladi" deb ajratgan. §3.5 `updated_by_id` ni talab qiladi — fon jarayoni odam qarorini bekor qilsa, u ustun yolg'on ma'lumot saqlaydi. Zarar assimetriyasi: cron yozsa — ega **sezmaydi**; yozmasa — ko'radi va o'zi hal qiladi |
| 16.9 | **`cost_currency` = `product.currency`** (DB `CHECK` + kod). Ustunlar **saqlanib qoladi** | §1.2 so'zma-so'z: "mahsulotga bitta valyuta — tannarx ham, sotuv narxi ham". Ustunlar takrorlanish emas, **snapshot**: `sale_items` o'zini o'zi tushuntiradi (§1.7). Assimetriya: ustun bor + cheklov bor → kelajakda cheklovni olib tashlash bitta migratsiya; ustun yo'q bo'lsa → qo'shish + barcha tarixiy qatorlarni to'ldirish |
| 16.10 | **Shartnoma PDF: MVP-1 (naqd) uchun yo'q, MVP-2 (nasiya) uchun MUST HAVE.** Nasiya moduli PDF'siz tugallangan hisoblanmaydi | §6.5 passport ma'lumotining **yagona maqsadi** — PDF'da chiqishi. PDF olib tashlansa §6.5, §6.6, §6.7 maqsadsiz qoladi. §15.8 mazmunni 8 bandda batafsil yozgan — bu daraja "keyinroq" uchun yozilmaydi. Imzolangan qog'ozsiz nasiya amalda undirib bo'lmaydi |
| 16.11 | **Ortiqcha to'lov tizimga kiritilmaydi.** Summa maydoni qarz qoldig'idan ortiq qiymat qabul qilmaydi. Ortiqcha naqd mijozga **qaytim** sifatida qaytariladi — jismoniy amal, moliyaviy yozuv emas | Matematik zanjir: §10.2 "avans/mijoz balansi tushunchasi yo'q" + §11.3 "kassa yozuvlari jismoniy naqd pulga teng". Ortiqcha pul kassaga yozilsa → u mijozning puli → **majburiyat (balans)** → §10.2 buzildi. Yozilmasa, lekin kassada qolsa → §11.3 buzildi. Yagona ziddiyatsiz yechim — pul kassada qolmaydi |
| 16.12 | **Qisman qaytarilgan nasiya:** `Δqarz = qaytgan_naqd_qiymat × (1 + markup_amount / cash_price)`, asl kursda (§8.1). Faqat `UNPAID` qatorlardan, **oxirgisidan boshlab teskari** ayriladi. `UNPAID` yig'indisidan oshsa — shartnoma yopiladi, pul qaytarishni ega hal qiladi (§8.5). Audit (§9.11) + yangi PDF versiyasi (§15.3) | Yechim bitta ham yangi qoida ixtiro qilmaydi — §8.1, §9.10, §9.11, §8.5 ni birlashtiradi. Ustama proporsional kamayadi, chunki §9.3 uni "naqd narx **ustiga**" qo'yadi — u naqd narxning funksiyasi. §9.12 ("ustama qaytarilmaydi") zid emas: u **erta yopish** haqida, unda mahsulot mijozda qoladi. Oxirgi qatordan teskari — chunki §10.1 to'lovni eng eskidan taqsimlaydi, kamayish esa buning teskarisi bo'lishi kerak |
| 16.13 | **Hosting O'zbekiston hududida.** PostgreSQL va MinIO shu yerda. Backup — shifrlangan holda | Passport seriyasi/raqami/**JSHSHIR**/rasm (§6.5, §6.6) — shaxsga doir ma'lumot; O'zbekiston qonunchiligi lokalizatsiyani talab qiladi (yuridik tasdiq kerak). CBU API va foydalanuvchi mahalliy — kechikish kam. §0.2 `StorageProvider` porti tufayli provayder almashtirish bitta env o'zgaruvchisi — qulflanmaydi |
| 16.14 | **`UserRole` enum'i `OWNER` ga qisqartiriladi.** `MANAGER`/`SELLER` olib tashlanadi. Lekin ruxsat mexanizmi to'liq quriladi: `@Roles()` dekoratori + global **default DENY**. Matritsa `PERMISSIONS.md` da kelajak uchun saqlanadi | Amalga oshirilmagan enum qiymati — sinovdan o'tmagan xavfsizlik kodi, ya'ni xavfsizlik illyuziyasi. Assimetriya: `ALTER TYPE ... ADD VALUE` — bir daqiqalik ish; enum'dan qiymat olib tashlash — tip qayta yaratish va ma'lumot ko'chirish. §2.3 "ruxsat tekshiruvi kodda bor, bitta rol bilan ishlaydi" — mexanizm bor, rol bitta: talab to'liq bajariladi |

### Kelajakda o'zgarishi mumkin bo'lgan qarorlar

Quyidagilar — **biznes siyosati**, texnik zaruriyat emas. Ular schema'ga
tegmaydi, shuning uchun keyin o'zgartirish arzon:

| # | Qaror | Qayerda o'zgaradi |
|---|-------|-------------------|
| 16.2 | Foiz ↔ absolyut ustama | `ExchangeRates` moduli, bitta formula |
| 16.12 | Ustamaning proporsional kamayishi | `recalculateScheduleAfterReturn()`, bitta qator |
| 16.3 | 0% boshlang'ich to'lov ruxsati | Validatsiya, bitta shart |
| 16.5 | Bekor qilish uchun 7 kunlik oyna | Konstanta |

---

## 17. Blocker qarorlari (v0.2.1 — kodlashdan oldin)

Audit 20 ta ziddiyat aniqladi. Quyidagilar kod yozilishidan **oldin**
hal qilinishi shart bo'lganlari.

| # | Qaror | Sabab |
|---|-------|-------|
| 17.1 | **`sales.number` — nullable.** Qoralamada `null`, tasdiqlash tranzaksiyasi ichida ajratiladi. `confirm` = **UPDATE**, CREATE emas. Raqam `sale_counters(year, last_seq)` jadvalidan `UPDATE … SET last_seq = last_seq + 1 RETURNING last_seq` bilan olinadi | ARCHITECTURE §6 raqamni tasdiqlashda ajratadi, lekin schema `NOT NULL` — qoralama saqlanmaydi. `MAX(number)+1` naqshi ikki parallel tasdiqlashda bir xil raqam beradi. Qator qulfi bilan sanagich — aniq va tekshiriladigan. Nullable raqam o'chirilgan qoralamalardan raqam teshiklari ham qoldirmaydi |
| 17.2 | **Kassaga pul faqat `Payment` orqali tushadi.** Savdo tasdiqlash tranzaksiyasi `payments` yozuvlarini yaratadi (CASH/CARD → darhol `CONFIRMED`, TRANSFER → `PENDING_VERIFICATION`); `cash_entries` esa faqat `Payment → CONFIRMED` o'tishida, `source_type = PAYMENT` bilan. **`CashSourceType.SALE` va `CashEntry.sale_id` olib tashlanadi** | ARCHITECTURE §6 4-qadami kassaga to'g'ridan-to'g'ri yozadi, TZ §12 esa "faqat `TASDIQLANGAN` to'lov kassaga tushadi" deydi. Ikki yo'l qolsa — pul **ikki marta** sanaladi va bu jim xato. Yagona yo'l TRANSFER holatini ham to'g'ri qamraydi |
| 17.3 | **Nasiya savdo summalari:** `sale_items.unit_price` = naqd narx (ustamasiz); `sales.total` = Σ(naqd narx); `contract.cash_price = sales.total`; `principal = cash_price + markup_amount − down_payment`. **Foyda:** yalpi foyda = Σ(narx − tannarx) — ustamasiz; **nasiya ustamasi daromadi = Σ(markup_amount) alohida satr**; sof foyda = yalpi + ustama − xarajatlar. Ustama savdo kunida to'liq tan olinadi | §13.1 foydani savdo kunida to'liq tan oladi, §9.4 ustama daromadini alohida ko'rsatishni talab qiladi. Agar ustama `sales.total` ga qo'shilsa — yalpi foyda uni yutib yuboradi va §9.4 buziladi. Bu formula ikkala talabni ham buzmaydi |
| 17.4 | **Qaytarish modeli:** teskari `sales` qatori — **yagona haqiqat manbai**. `status = REVERSAL`, `total` **manfiy**, `number` = asl raqam + `-R1`, `-R2`. Asl savdodagi `sale_items.returned_quantity` va `PARTIALLY_RETURNED`/`RETURNED` statuslari — **hosila kesh**; faqat o'sha tranzaksiya ichida yangilanadi va izohda kesh ekani yoziladi | Bitta fakt uch joyda saqlanardi, bu README'dagi "hisoblanadigan qiymat saqlanmaydi" qoidasini buzardi. Teskari qatorning `status`, `total` ishorasi va `number` formati aniqlanmagani hisobot SQL'ini yozib bo'lmaydigan qilardi |
| 17.5 | **Ombor poygasi (§5.5) mexanizmi:** seriyali — `UPDATE inventory_items SET status='SOLD' WHERE id = $1 AND status = 'AVAILABLE'`, `rowCount = 0` bo'lsa xato. Partiyali — `UPDATE inventory_batches SET quantity_remaining = quantity_remaining − $n WHERE id = $1 AND quantity_remaining >= $n`. Izolyatsiya darajasi — `READ COMMITTED` | "Tekshiriladi" degani mexanizm emas. `SELECT` keyin `UPDATE` — klassik TOCTOU poygasi: `READ COMMITTED` da ikkala tranzaksiya ham "mavjud" ko'radi. Shartli `UPDATE` qulfsiz va atomik — "birinchi tasdiqlagan oladi" ni aynan bajaradi |
| 17.6 | **Idempotency:** `Idempotency-Key` sarlavhasi barcha moliyaviy `POST` uchun majburiy; `idempotency_keys` jadvali. Tafsilot — `API.md` §4 | Telefon internetida so'rov yuborilib javob yo'qolishi oddiy hol; foydalanuvchi tugmani qayta bosadi. UI'da bloklash yetarli emas — so'rov allaqachon serverga yetgan bo'lishi mumkin. Natija: ikki savdo, ikki to'lov |
| 17.7 | **API konventsiyalari `docs/API.md` da** — xato formati, HTTP kodlari, pagination, filtr, saralash, rate limiting, fayl validatsiyasi, optimistik qulf, **pul JSON'da string** | Har modul o'z konventsiyasini yaratsa, keyin 15 ta joyni bir vaqtda tuzatish kerak. Ayniqsa pul serializatsiyasi: Prisma `Decimal` ni to'g'ridan-to'g'ri JSON'ga berish `number` (float!) yoki ichki obyekt beradi — ikkalasi ham xato |
| 17.8 | **DB `CHECK` cheklovlari qo'shiladi** (qo'llangan: `apps/api/prisma/migrations/20260809191223_constraints_v0_2_1/`): valyuta mosligi, manfiy bo'lmagan qoldiq, `returned_quantity ≤ quantity`, to'lovda `sale_id` yoki `contract_id`, `amount > 0`, `principal` formulasi, holat izchilligi | Schema izohlari ikki joyda "kod darajasida tekshiriladi" deydi, lekin bazada **bitta ham** `CHECK` yo'q. Loyihaning butun falsafasi moliyaviy yaxlitlikka qurilgan; bitta xato kod yoki migratsiya bazani jim ravishda buzuq holatga o'tkazadi |
| 17.9 | **Barcha `DateTime` → `@db.Timestamptz(3)`.** `@db.Date` maydonlar kalendar sana bo'lib qoladi. "Bugun" doim `Asia/Tashkent` da hisoblanadi | Hozir 66 ta ustun `timestamp(3)` — **timezone'siz**. Toshkent vaqti bilan 00:00–05:00 orasidagi savdolar hisobotda kechagi kunga tushadi. Migratsiya bitta va baza bo'sh — hozir arzon, keyin qimmat |
| 17.10 | **Naqd savdo to'liq to'lanadi:** `kind = CASH` savdo tasdiqlanishi uchun Σ(to'lovlar, savdo valyutasiga aylantirilgan) = `sales.total`. Kam bo'lsa — nasiyaga o'tkazish kerak | Hujjatlarda naqd savdodagi qarz uchun na model, na formula bor (shartnoma yo'q, jadval yo'q, allocation yo'q), mijoz esa ixtiyoriy (§6.1) — qarz kimda ekani ham noma'lum. §10.2 "avans/balans yo'q" falsafasi bilan izchil |
| 17.11 | **Orqaga qo'yilgan sana o'sha kunning do'kon kursini oladi** (`exchange_rates.date = sold_at::date`); o'sha kun uchun qator bo'lmasa — undan oldingi eng yaqin qator. To'lovda ham xuddi shunday (§10.4) | §1.8 "qaytarish asl kursda" falsafasi bilan izchil: hodisa qaysi kunda sodir bo'lgan bo'lsa, o'sha kunning kursi. Tekshiriladigan va tushuntiriladigan qoida |
| 17.12 | **Shaxsiy foydalanish — pul bo'lmagan xarajat.** `cash_entries` ga **tushmaydi**. `stock_movements(PERSONAL_USE)` + `inventory_items.status = WRITTEN_OFF`. Sof foyda hisobida tannarx yig'indisi alohida xarajat satri sifatida qo'shiladi. `CashSourceType.PERSONAL_USE` va seed'dagi `shaxsiy-foydalanish` **kassa** kategoriyasi olib tashlanadi | Shaxsiy foydalanishda kassadan hech qanday pul chiqmaydi. `cash_entries(OUT)` yozilsa, kassa qoldig'i haqiqiy naqddan kam ko'rsatadi — bu §11.3 da aniq nomlangan muammoning aynan o'zi. Xuddi shu mantiq ombor yo'qotishlariga (`LOST`, `DEFECTIVE`) ham qo'llanadi |
| 17.13 | **Notifikatsiya unique kaliti:** `@@unique([scheduleId, channel, type, scheduledFor])`; `scheduleId` majburiy | Hozirgi `[scheduleId, channel, type]` kaliti bilan jadval qatori qayta rejalashtirilsa (§9.10), yangi sana uchun eslatma **hech qachon** yuborilmaydi. `scheduleId` nullable bo'lgani uchun `NULL` qatorlar umuman deduplikatsiya qilinmaydi |
| 17.14 | **`roundMoney` `Decimal` bilan qayta yoziladi** (`ROUND_HALF_UP`). `money.ts` faqat formatlash uchun qoladi | Yaxlitlash — hisob, formatlash emas: ARCHITECTURE §4 o'zi "yaxlitlash **yozishdan oldin** qilinadi" deydi. `Number()` + `toFixed()` binar float xatosiga uchraydi (`(1.005).toFixed(2) === "1.00"`). Xato jamlanib, `payment_allocations` yig'indisi `amount_due` ga teng bo'lmaydi va §9.6 tekshiruvi yolg'on xato beradi |
| 17.15 | **Jadval tuzish qoidalari:** yaxlitlash qoldig'i **oxirgi qatorga** qo'shiladi (Σ = `principal` aniq bajarilsin); oy kuni keyingi oyda mavjud bo'lmasa (31 → fevral) — **o'sha oyning oxirgi kuni** olinadi | §9.6 jadval summasi qarzga teng bo'lishini talab qiladi, lekin 1 000 000 / 3 kabi holatda yaxlitlash 0.01 farq beradi va savdo tasdiqlanmaydi. Sana qoidasisiz 31-yanvarda tuzilgan jadval fevralda yiqiladi |
| 17.16 | **Yetishmayotgan endpointlar qo'shiladi:** `DELETE /sales/:id` (faqat qoralama), `DELETE /cash-entries/:id`, `POST /auth/change-password`, `GET /audit-logs`, `POST /categories/:id/merge`, `POST /brands/:id/merge`, `GET/POST /cash-categories`, `POST /inventory/:id/restock`, `POST /stocktakes/:id/cancel`, `GET /health/live`, `GET /health/ready` | Har biri mavjud talabga mos keladi (§7.7, §11.8, §4.4, §11.10, §16.4, §2.2), lekin API ro'yxatida yo'q edi |
| 17.17 | **MVP ikkiga bo'linadi:** MVP-1 — auth, sozlama, kurs, katalog, ombor, mijoz, **naqd savdo**, kassa, dashboard. MVP-2 — nasiya, to'lov, qaytarish, hisobotlar, shartnoma PDF | To'rtta murakkab tranzaksion modulni (savdo, qaytarish, nasiya, to'lov) parallel yozish — loyihaning eng katta xavfi. MVP-1 bilan do'kon allaqachon daftardan voz kechadi va tizim real sinovdan o'tadi |
| 17.18 | **Kichik tuzatishlar:** `POST /sales/:id/reverse` → `/return` + `/cancel` (§7 va §8 dagi ziddiyat); `reversed_sale_id` → **`reverses_sale_id`**; `Settings.base_currency` olib tashlanadi (§1.1 qat'iy); `sales.subtotal` olib tashlanadi (§7.3 chegirma yo'q, `subtotal ≡ total`); qaytarishda shartnoma → **`CANCELLED`** (`CLOSED` faqat qarz to'liq to'langanda) | Hujjatlar orasidagi nomuvofiqliklar. Ular kichik, lekin "manba haqiqat" hujjatining ichki ziddiyati uning maqomini zaiflashtiradi |

---

## 18. 3-bosqich qarorlari (2026-08-10 — katalog va ombordan oldin)

| #    | Qaror | Sabab |
|------|-------|-------|
| 18.1 | **Mahsulot rasmi (§4.10) 3-bosqichda yo'q** — u 9-bosqichda `Storage` moduli bilan birga keladi | §4.10 MinIO'ni talab qiladi, `StorageProvider` porti esa hali yozilmagan va §22 uni 9-bosqichga (shartnoma PDF'i bilan birga) qo'ygan. Bitta ixtiyoriy maydon uchun MinIO o'rnatish, vaqtinchalik havola (§15.5) va fayl validatsiyasini katalog bosqichiga tortish — bosqichni ikki barobar kattalashtiradi. Rasmsiz mahsulot to'liq ishlaydi; `products.image_file_id` ustuni schema'da **allaqachon bor**, ya'ni keyin qo'shish bitta forma maydoni, migratsiya emas |
| 18.2 | **IMEI skaneri (§4.9) MVP'da yo'q** — qo'lda kiritish | `FRONTEND.md` §14 qo'lda kiritishni allaqachon zaxira deb nomlagan. Kamera skaneri shtrix-kod kutubxonasi, ruxsat so'rash va qurilmalarda sinovni talab qiladi, lekin **ma'lumot modeliga umuman tegmaydi**: `imei_1`/`imei_2` ikkala holatda ham oddiy matn. Ya'ni skaner — sof kiritish usuli va uni keyin API'ga tegmasdan qo'shish mumkin |
| 18.4 | **CBU kursini kun davomida qo'lda yangilash mumkin** — `POST /exchange-rates/sync`. 09:00 dagi avtomatik olish (§3.3) o'z joyida qoladi; bu uni **almashtirmaydi, to'ldiradi**. Amal cron bilan **aynan bir xil kodni** ishlatadi, farqi ikkitasi: odam boshlagani uchun §3.10 bo'yicha audit yoziladi (`EXCHANGE_RATE_SYNCED`), va CBU javob bermasa `503 EXCHANGE_RATE_FETCH_FAILED` qaytadi. §16.8 bu yerda ham amal qiladi: `MANUAL` do'kon kursi ustidan yozilmaydi, faqat `cbu_rate` yangilanadi va natija `MANUAL_PRESERVED` deb qaytariladi | CBU kun ichida kursni o'zgartirsa yoki 09:00 dagi urinishlar (§16.7) muvaffaqiyatsiz tugasa, ega ertagacha eskirgan kurs bilan savdo qilardi — §16.6 buni ko'rsatadi, lekin tuzatish yo'lini bermasdi. Mantiqni cron bilan bo'lishish ataylab: ikkiga bo'linsa, §16.8 himoyasi bitta yo'lda unutilishi mumkin. Uch amal aniq ajratilgan — `PUT :date` kursni **qo'yadi**, `reset-to-cbu` saqlangan qiymatdan **qayta hisoblaydi**, `sync` esa CBU'dan **yangi qiymat oladi** |
| 18.5 | **Mahsulot nomi ham takrorlanmaydi** — `display_name` bo'yicha registrga sezgir bo'lmagan tekshiruv, `pg_advisory_xact_lock(hashtext(lower(nom)))` ostida | §4.3 dublikat oldini olishni kategoriya va brend uchun talab qiladi, lekin haqiqiy zarar mahsulot darajasida bo'ladi: bir xil telefon ikkita shablonga bo'linsa, qoldiq ikkiga bo'linadi va foyda hisobotini o'qib bo'lmaydi. `products` da unique indeks yo'q (nom brend + model + xotira + rangdan yig'iladi, ya'ni u hosila ma'lumot va migratsiya bilan qotirilsa brend nomi o'zgarganda buzilardi) — shuning uchun to'siq **advisory lock** bilan: `SELECT` va `INSERT` orasidagi TOCTOU poygasi §18.3 dagi IMEI triggeri bilan aynan bir xil mexanizmda hal qilinadi. Qulf `void` qaytargani uchun `$executeRaw` ishlatiladi; `$queryRaw` "Failed to deserialize column of type 'void'" beradi (jonli tekshiruvda aniqlangan) |
| 18.6 | **Arxivdagi kategoriya/brendga mahsulot bog'lanmaydi** (`CATALOG_TAXONOMY_ARCHIVED`, 422 + maydon nomi), lekin tekshiruv faqat qiymat **o'zgarganda** ishlaydi | Arxivlash — "endi ishlatilmaydi" degani (§4.8), ya'ni yangi mahsulotni unga bog'lash xato. Shartsiz tekshiruv esa tuzoq bo'lardi: brend keyinroq arxivlansa, unga bog'langan **mavjud** mahsulotning rangini tuzatib bo'lmay qolardi. Xato `404` emas, `422` va `field` bilan qaytadi — u butun sahifaning holati emas, forma tanlovi haqida (`FRONTEND.md` §5.2) |
| 18.7 | **Ombor bo'sh emas ekan `type` va `currency` qotadi** (`CATALOG_PRODUCT_HAS_STOCK`) | Tannarx valyutasi triggeri (§16.9) faqat yozish paytida ishlaydi. Mahsulotni USD dan UZS ga o'tkazish mavjud `inventory_items` qatorlarini jimgina noto'g'ri qoldirardi: `cost_price` o'sha, `cost_currency` esa endi mahsulotnikidan farq qiladi. Bazada bu holat uchun cheklov yo'q va bo'lishi ham qiyin (tarixiy qatorlarni buzmasdan), shuning uchun to'siq ilova darajasida. Barcha birliklar sanaladi, faqat `AVAILABLE` emas — sotilgan telefonning tannarxi ham foyda hisobida ishlatiladi |
| 18.3 | **IMEI ustunlararo takrorlanishi trigger bilan to'siladi** (§5.3) | Ustunlardagi `@unique` faqat o'z ustuni ichida ishlardi: `A.imei_1 = B.imei_2` ruxsat etilardi, ya'ni bitta telefon bazada ikki marta tura olardi. Trigger uchala identifikatorni (`imei_1`, `imei_2`, `serial_number`) barcha qatorlarning uchalasi bilan solishtiradi. Tekshirishdan oldin qiymat bo'yicha `pg_advisory_xact_lock` olinadi — usiz `READ COMMITTED` da ikkita parallel qabul bir-birini ko'rmasdan o'tib ketardi (§17.5 rad etgan TOCTOU naqshi). Katalog bo'sh ekan bu bitta migratsiya; ma'lumot to'plangach dublikatlarni ajratish ancha qimmat |

---

## 19. 4-bosqich qarorlari (2026-08-11 — mijozlar)

| #    | Qaror | Sabab |
|------|-------|-------|
| 19.1 | **Qarz mijoz kartasida hali yo'q** (§6.11) — maydon ham, so'rov ham qo'shilmadi; u savdo va to'lov modullari bilan birga (5- va 7-bosqich) keladi | §6.12 qarzni **faqat tranzaksiyalardan** hisoblashni talab qiladi, tranzaksiyalar esa hali yo'q. "0 so'm qarz" deb ko'rsatish texnik jihatdan to'g'ri, lekin ma'nosi yolg'on bo'lardi: ega buni "qarzi yo'q mijoz" deb o'qiydi, aslida esa tizim hali savdoni umuman bilmaydi. Bu 2-bosqichda dashboard bilan qilingan tanlovning o'zi — bo'lmagan raqamni chizmaslik |
| 19.2 | **Passport matni kiritiladi (§6.5), rasmi esa 9-bosqichda** (§6.6, §6.7) | §18.1 dagi mahsulot rasmi bilan aynan bir xil sabab: rasm `Storage` modulini, vaqtinchalik havolani (§15.5) va fayl validatsiyasini talab qiladi. Matn maydonlari esa shartnoma PDF'i (§16.10) uchun yetarli va ular hech qanday yangi infratuzilma talab qilmaydi. `passport_file_id` ustuni schema'da allaqachon bor |
| 19.3 | **Telefon normalizatsiyasi `contracts/phone.ts` da** — `+` bilan boshlansa chet el raqami, aks holda `+998` qo'shiladi; eski trunk prefiksi (`8 90 …`) faqat uzunlik aynan mos kelganda qabul qilinadi | §6.2 "takrorlanmaydi" kafolati `phone_primary` ustunidagi `@unique` ga tayanadi, u esa normalizatsiya izchilligiga. Funksiya `slugifyCatalogName` kabi **ikkala ilovada** ishlatiladi: forma saqlanadigan qiymatni oldindan ko'rsatadi, server esa aynan o'shani yozadi. Trunk prefiksining kengroq qoidasi ataylab yozilmadi — qo'shni davlatlarda ham `8` trunk prefiksi va raqam uzunligi boshqacha |
| 19.4 | **Passport qiymatlari audit jurnaliga yozilmaydi** — faqat `hasPassport` fakti | §16.13 shaxsga doir ma'lumotni lokalizatsiya qilishni talab qiladi; audit jurnali esa `UPDATE`/`DELETE` dan himoyalangan (`PERMISSIONS.md` §4), ya'ni unga tushgan JSHSHIR **abadiy** qoladi va uni o'chirib bo'lmaydi. Jurnalning vazifasi — kim nimani o'zgartirganini ko'rsatish; buning uchun qiymatning o'zi shart emas |
| 19.5 | **`GET /customers/:id/history` hozircha yo'q** | U savdo va to'lovlardan iborat. Bo'sh massiv qaytaradigan endpoint "bu mijozda savdo bo'lmagan" degan yolg'on xulosaga asos berardi — §18 dagi `restock` bilan bir xil mulohaza (holat hali paydo bo'lmagan bo'lsa, endpoint ham kerak emas) |
| 19.6 | **Passport seriyasi va raqami — erkin matn**, faqat uzunlik va belgilar to'plami tekshiriladi (lotin harflari, raqam, tire; seriya ≤ 10, raqam 3–20 belgi, katta harfga keltiriladi). **JSHSHIR — istisno:** aynan 14 raqam | §6.5 bu maydonlarni ataylab "matn maydonlari" deb ta'riflagan. Dastlabki kodda qat'iy naqsh bor edi (`AA` + 7 raqam) va u hujjatdan chetga chiqardi: ID-karta, chet el pasporti hamda eski namunadagi hujjat rad etilardi. Zarar zanjiri uzun — passportsiz mijoz kiritilmaydi, mijozsiz nasiya rasmiylashtirilmaydi (§6.1), ya'ni validatsiya savdoni to'xtatardi. Buning evaziga yutuq yo'q: maydonning yagona iste'molchisi — PDF (§16.10), u esa qiymatni **ko'chiradi**, tekshirmaydi. JSHSHIR boshqacha: 14 raqam formatning taxmini emas, tushunchaning ta'rifi; chet el fuqarosida u umuman yo'q va maydon `null` bo'lib qolaveradi |
| 19.7 | **Do'kon logosi (§3.6) 9-bosqichda** — `Storage` moduli bilan birga. `settings.logo_file_id` ustuni va `FileKind.SHOP_LOGO` schema'da allaqachon bor; `PATCH /settings` uni **qabul qilmaydi** | §18.1 (mahsulot rasmi) va §19.2 (passport rasmi) bilan aynan bir xil sabab: rasm MinIO'ni, vaqtinchalik havolani (§15.5) va fayl validatsiyasini (`API.md` §7) talab qiladi. Logosiz do'kon sozlamalari to'liq ishlaydi. Bu qator ataylab yozilmoqda: qolgan ikkita rasm kechiktirilgani hujjatda bor edi, logo esa yo'q edi — ya'ni u "unutilgan" bo'lib ko'rinardi |

---

## 20. 5-bosqich qarorlari (2026-08-13 — naqd savdo va kassa)

| #    | Qaror | Sabab |
|------|-------|-------|
| 20.1 | **Nasiya savdo bu bosqichda yo'q** — `createSaleDraftSchema.kind` faqat `CASH` qabul qiladi, formada `kind` tanlovi umuman ko'rsatilmaydi | §22 nasiyani 7-bosqichga qo'ygan, chunki u shartnoma va to'lov jadvalini talab qiladi (§9.1, §9.5). Ularsiz `INSTALLMENT` savdo qarzni hech qayerda qoldirmasdan "yo'qotardi": ombor kamayadi, kassaga pul tushmaydi, qarz esa hech qanday jadvalda ko'rinmaydi. Naqd savdoda §17.10 buni to'sadi — to'lovlar summasi savdo summasiga teng bo'lmasa tasdiqlanmaydi |
| 20.2 | **Savdo kartasida "Qaytarish" va "Bekor qilish" tugmalari yo'q** — karta faqat o'qish uchun | Qaytarish moduli 6-bosqichda (§22). Bosilganda "endpoint topilmadi" beradigan tugma — §19.5 dagi bo'sh `history` endpointi bilan bir xil xato: mavjud bo'lmagan imkoniyatni ko'rsatish. Tasdiqlangan savdo o'zgarmasligi (§21) esa ekranda shundoq ham ko'rinadi |
| 20.3 | **Kalkulyator (§12.6) suzuvchi tugma emas** — u savdo formasida narx maydonining yonidan ochiladi | `FRONTEND.md` §4 ekranda **bitta** suzuvchi tugmaga ruxsat beradi va u — "Yangi savdo" (§14.6). Ikkinchi suzuvchi tugma telefonda birinchisining ustiga tushardi yoki pastki navigatsiyani yopardi. §12.6 dagi "har ekrandan" talabi shu bilan qisman bajarilmadi va bu ataylab: kalkulyator kerak bo'ladigan yagona ekran — savdo formasi (§7.10), qolgan joyda u hech qanday maydonni to'ldirmaydi |
| 20.4 | **Valyuta aylantirish `contracts/money.ts` ga ko'chirildi** (`convertMoney`), server `convert` esa uni chaqiradi | To'lov boshqa valyutada bo'lsa, savdo formasi "qancha qoldi" ni ko'rsatishi kerak, server esa §17.10 ni aynan shu hisob bilan tekshiradi. Ikki joyda ikki xil yozilsa, ega "qoldi: 0" ni ko'rib tugmani bosardi va `SALE_PAYMENT_MISMATCH` olardi — hech kim tushuntira olmaydigan holat. Bu §19.3 (telefon normalizatsiyasi) va `slugifyCatalogName` bilan bir xil naqsh: qoida bitta, ikkala ilova ishlatadi (`FRONTEND.md` §6.1). Hisob butunlay `BigInt` ustida — `Decimal.div` dan farqi faqat 20-chi ahamiyatli raqamda bo'lishi mumkin, u esa pul aniqligidan ancha past |
| 20.5 | **Valyuta ayirboshlash (§11.6) UI'siz qoldi** — `POST /cashbook/exchange` bor, ekrani yo'q | §22 uni "Kengaytirish" (10-bosqich) ro'yxatiga qo'ygan, MVP-1 ga emas. Endpoint kassa modulining ichki mantiqi bilan birga yozilgani uchun qoldirildi (uni olib tashlash `CashExchange` jadvalini ham yetim qilardi), lekin ekran qo'shilmadi: ayirboshlash kunlik ish emas va usiz kassa to'liq ishlaydi |
| 20.6 | **Telefonda pastki navigatsiya beshta elementga bo'lindi** — Boshqaruv · Savdo · Ombor · Mijozlar · **Yana** (varaqda: Katalog, Kassa, Sozlamalar, Xavfsizlik) | `FRONTEND.md` §4 aynan shu tuzilmani talab qiladi. 4-bosqichda oltita element bir qatorda edi va hali sig'ardi; savdo bilan kassa qo'shilgach ettita bo'lardi — 375px kenglikda bosish maydoni 44px dan tor bo'lib qolardi (`design.md` §6) |
| 20.7 | **Savdo sanasi:** bugungi kun tanlansa **hozirgi vaqt** yuboriladi, orqaga qo'yilganda esa o'sha kunning tush payti (`12:00+05:00`) | Sana maydoni faqat kunni beradi. Bugungi kun uchun `00:00` yuborilsa, savdo bir necha soat orqaga surilardi va kunlik ro'yxatda tartib buzilardi; orqadagi kun uchun esa `00:00` zona chegarasida oldingi kunga tushib ketishi mumkin. Toshkentda yozgi vaqt yo'q, ofset doimiy |
| 20.8 | **"Tasdiqlash" avval qoralamani saqlaydi** — yangi savdo bo'lsa `POST /sales`, keyin `POST /sales/:id/confirm` | Tasdiqlash marshruti savdo `id` sini talab qiladi (`ARCHITECTURE.md` §6 — tranzaksiya mavjud qoralama ustida ishlaydi). Egadan avval "Saqlash", keyin "Tasdiqlash" bosishini talab qilish — ikki bosishlik ortiqcha qadam, va u unutilgan qoralamalar qoldirardi. `Idempotency-Key` forma ochilganda bir marta yaratilgani uchun takroriy bosish ikkinchi savdo yaratmaydi (§17.6) |
| 20.9 | **Kassa yozuviga ilova (chek surati, §11.9) qo'shilmadi** | §18.1, §19.2 va §19.7 bilan bir xil sabab: fayl `Storage` modulini talab qiladi va u 9-bosqichda. `cash_entries` da fayl ustuni schema'da allaqachon bor, ya'ni keyin qo'shish forma maydoni bo'ladi, migratsiya emas |

---

## 21. 6-bosqich qarorlari (2026-08-13 — platforma va tenant izolyatsiyasi)

`TZ.md` §25 va `ARCHITECTURE.md` multi-tenant bo'limi HisobAI'ni bitta
do'kon CRM'idan SaaS platformaga aylantiradi. Ular MVP-1 yozilib
bo'lgandan **keyin** qo'shilgani uchun mavjud kod bilan bir qator
ziddiyat yuzaga keldi. Quyidagi qarorlar shu ziddiyatlarni yopadi va
hujjat ziddiyatida ustun turadi (hujjat boshidagi qoida).

> **§1–§20 dagi "Joylashuvi" jadvallari yangilanmaydi.** Ular
> 2026-08-05/06 muhokamasining yozuvi — o'sha paytdagi sahifa, endpoint
> va jadval nomlarini ko'rsatadi. §21 ulardan ikkitasini o'zgartiradi:
> `settings` → `shops` (§21.4) va `exchange_rates` → `cbu_rates` +
> `shop_exchange_rates` (§21.5). Joriy joylashuv doim
> `ARCHITECTURE.md` §7–§8 va §14 da.
>
> **Bosqich raqamlari haqida.** §21.1 §22 ga yangi 6-bosqichni qo'shadi
> va undan keyingilarini bittaga suradi. Yuqoridagi §18–§20 dagi qarorlar
> **o'sha paytdagi** raqamlarni ishlatadi va ular ataylab tuzatilmaydi —
> qabul qilingan qaror yozuvi, joriy reja emas. Amaliy tarjima: eski
> "9-bosqich" (`Storage`, PDF) endi **10-bosqich**, eski "7-bosqich"
> (nasiya) endi **8-bosqich**, eski "10-bosqich" (kengaytirish) endi
> **11-bosqich**. Joriy reja doim `TZ.md` §22 da.

| #    | Qaror | Sabab |
|------|-------|-------|
| 21.1 | **Tenant qatlami MVP-2 dan OLDIN, 6-bosqich sifatida quriladi.** §22 dagi keyingi bosqichlar bittaga suriladi | MVP-2 — qaytarish, nasiya, to'lov va hisobotlar, ya'ni loyihaning eng murakkab tranzaksion mantiqi (§17.17). Agar u avval single-tenant yozilsa, keyin har bir tranzaksiya, har bir hisobot so'rovi va har bir `CHECK` cheklovi qayta ko'rib chiqiladi. Hozir esa real ma'lumot yo'q va backfill migratsiyasi arzon. Qo'shimcha yutuq: 6-bosqichdan keyin yozilgan har bir yangi so'rov avtomatik shop-scoped bo'ladi va dasturchi buni unutib qo'yolmaydi |
| 21.2 | **Rol nomlari:** `SUPERADMIN` (platforma) va `SHOP_ADMIN` (do'kon). Mavjud `OWNER` → `SHOP_ADMIN` ga qayta nomlanadi. Kelajakdagi rollar — `MANAGER` va `SELLER` | §25.2 `OWNER` ni MVP'dan chiqaradi, `PERMISSIONS.md` esa butun matritsani `OWNER` ustiga qurgan — ikkalasi bir vaqtda to'g'ri bo'lolmaydi. `OWNER` va `SHOP_ADMIN` bitta narsani anglatadi, shuning uchun qo'shimcha rol emas, **qayta nomlash**. `CASHIER` (§25.2) ishlatilmaydi: `PERMISSIONS.md` allaqachon `SELLER` deb yozgan va ikki nomni parallel yuritish keyinchalik matritsani o'qib bo'lmas qiladi |
| 21.3 | **SUPERADMIN `users` da emas, alohida `platform_admins` jadvalida** — alohida sessiya jadvali, alohida cookie, alohida login | §25.3 va §25.20 SUPERADMIN'ning tenant business data'siga kira olmasligini **invariant** deb e'lon qiladi. Bitta `users` jadvali va `role` bilan bu invariant har so'rovdagi `if (role === SUPERADMIN)` tekshiruviga tayanadi — bitta unutilgan joy uni buzadi. Alohida jadvalda esa SUPERADMIN'da `shopId` **umuman yo'q**, ya'ni shop-scoped so'rov u uchun texnik jihatdan bajarilmaydi. Kod tekshiruviga emas, strukturaga tayangan kafolat — §17.8 dagi "oxirgi himoya qatlami" mulohazasi bilan bir xil |
| 21.4 | **`settings` jadvali `shops` ga aylanadi** — do'kon ma'lumoti (§3.6) va biznes sozlamalari (§3.7–3.9, §16.2) bitta qatorda | `settings` hozir `id Int @id @default(1)` — ataylab bitta qator. Tenant modelida har Shop'ning o'z nomi, ish vaqti, kam qoldiq chegarasi, nasiya standartlari va kurs ustamasi bo'ladi. Ikkita jadval (`shops` + `shop_settings`) 1:1 bo'lardi va har o'qishda `join` talab qilardi; ajratish uchun sabab yo'q |
| 21.5 | **Kurs ikkiga bo'linadi:** `cbu_rates(date)` — platforma darajasida, `shop_exchange_rates(shop_id, date)` — do'kon darajasida | CBU kursi butun O'zbekiston uchun bitta va uni har Shop qatorida takrorlash sync'ni N marta yozishga majbur qilardi. Do'kon kursi esa aynan Shop'ga tegishli: §16.2 uni `store_rate_markup_percent` dan hisoblaydi, u endi `shops` da. §16.8 (`MANUAL` daxlsizligi), §16.6 (eskirganlik) va §17.11 (orqadagi sana) shop qatorida amal qiladi; `cbu_rates` esa faqat sync yozadigan ma'lumot jadvali |
| 21.6 | **§25.18 (Shop status) va §25.19 (account status) birlashtiriladi.** Yagona status — **`users.status`**: `ACTIVE` · `SUSPENDED` · `DISABLED`. (`shop-admins` — faqat API resurs nomi, jadval emas: SHOP_ADMIN §21.3 bo'yicha `users` da yashaydi) | 1 SHOP_ADMIN = 1 SHOP (§25.7) bo'lgan modelda ikkita mustaqil status to'rtta mantiqiy kombinatsiya beradi va ularning ikkitasi ma'nosiz ("account faol, shop to'xtatilgan" — kim va nima uchun?). §25.18 ning o'zi ham "MVP'da alohida permission sifatida belgilanadi" deb ochiq qoldirgan. Branch modeli qo'shilganda (§25.8) Shop statusi mustaqil ma'no oladi — o'shanda ajratiladi |
| 21.7 | **Tenant izolyatsiyasi Prisma client extension bilan avtomatik**, servis kodida qo'lda `where: { shopId }` yozilmaydi. Kontekst yo'q bo'lsa so'rov **xato beradi** | 93 ta API faylida har bir so'rovga qo'lda filtr yozish — kafolat emas, intizom, va bitta unutilgan joy §25.11 dagi IDOR'ni beradi. `AsyncLocalStorage` kontekstidan avtomatik enjeksiya buni sinf darajasida hal qiladi. Kontekstsiz so'rov **jimgina hamma Shop'ni qaytarmasligi** ataylab: "bo'sh filtr = hamma qator" — aynan shu naqsh tenant tizimlarida ma'lumot sizishining eng ko'p uchraydigan sababi. Chiqish yo'li aniq nomlangan (`runWithoutShopScope`) va faqat `Platform` moduli ishlatadi |
| 21.8 | **`$queryRaw` / `$executeRaw` so'rovlari extension'dan tashqarida qoladi** — ularga `shop_id` sharti qo'lda qo'shiladi va ro'yxati testda qotiriladi. Kod bazasida ular **uchta**: `sale_counters` ajratish (§17.1), mahsulot nomi advisory lock (§18.5) va `health` dagi `SELECT 1` (tenant jadvaliga tegmaydi). DB triggerlari (§18.3 IMEI, §17.8 `CHECK`) — alohida qatlam, ular migratsiyada SQL darajasida qayta yoziladi | Prisma extension'i `query` hodisasini faqat model metodlarida ushlaydi; raw SQL undan o'tmaydi. Ro'yxat aniq sanaladi va testda qotiriladi, chunki "xavfli istisnolar ro'yxati" noaniq bo'lsa u himoya emas, xotirjamlik illyuziyasi. **Ombor shartli `UPDATE` (§17.5) bu ro'yxatda yo'q** — dastlabki tahrirda u raw SQL deb yozilgan edi, aslida `updateMany` bilan yozilgan va extension uni qamraydi (`ARCHITECTURE.md` §6 dagi SQL — mexanizm izohi, kod nusxasi emas). Advisory lock kalitiga `shop_id` qo'shiladi: usiz bitta Shop'dagi qabul boshqasinikini kutib turardi |
| 21.9 | **Savdo raqami hisoblagichi Shop bo'yicha mustaqil** — `sale_counters` PK `(shop_id, year)` | §7.6 raqamni "yil + ketma-ket raqam" deb ta'riflaydi va u mijozga ko'rinadigan hujjat raqami. Umumiy hisoblagichda ikkinchi do'kon `2026-00001` dan emas, birinchi do'kon qayerda to'xtagan bo'lsa o'shandan boshlardi — ya'ni raqam boshqa tenant'ning savdo hajmini oshkor qilardi |
| 21.10 | **SHOP_ADMIN account Shop'siz yaratiladi** (§25.5), shuning uchun `users.shop_id` **nullable**. Shop-scoped endpointga Shop'siz kirilsa `SHOP_SETUP_REQUIRED` qaytadi | §25.6 setup oqimini talab qiladi, ya'ni "Shop'siz foydalanuvchi" — vaqtinchalik emas, **normal** holat. Uni 403 bilan qaytarish frontendga "ruxsat yo'q" deb tushuntirardi va u `/app/setup-shop` ga yo'naltira olmasdi. Alohida xato kodi bu ikki holatni ajratadi (`FRONTEND.md` §5.2 mantiqida) |
| 21.11 | **`idempotency_keys` ham shop-scoped bo'ladi:** unique `(shop_id, key)`, va takrorlash yo'lida `request_hash` bilan birga **`user_id` mosligi** ham tekshiriladi | Jadval biznes ma'lumoti emas, shuning uchun §25.10 ro'yxatiga tushmagan edi — lekin uning `response_body` ustunida savdo tasdiqlash va to'lov javoblari, ya'ni **boshqa Shop'ning biznes ma'lumoti** saqlanadi. Hozirgi kodda kalit global PK va `claim()` faqat `request_hash` ni solishtiradi (`common/idempotency.interceptor.ts`): bir tenantli tizimda bu xavfsiz edi, ko'p tenantlida esa mos `request_hash` bilan boshqa tenant javobini o'qish yo'li ochiq qolardi. Ikkala chora ham qo'yiladi — kalit ajratilishi to'qnashuvni, `user_id` tekshiruvi esa qolgan yo'lni yopadi |
| 21.12 | **`push_subscriptions` shop-scoped** (§25.10 da sanalgan) | Eslatma jarayoni (§10) obunani `payment_schedules` orqali topadi, foydalanuvchi orqali emas. Shop kontekstisiz bir do'konning to'lov eslatmasi boshqasining qurilmasiga yuborilishi mumkin edi — xabarda esa mijoz ismi va summa bor (§18) |
| 21.13 | **Tenant chegarasi ikki qatlamda: Prisma extension (ergonomika) + PostgreSQL RLS (kafolat).** Har shop-scoped jadvalda `ENABLE` va **`FORCE ROW LEVEL SECURITY`**, siyosat `shop_id = NULLIF(current_setting('app.current_shop_id', true), '')::uuid`. Ustun default ham shu ifoda | §21.7 extension'ni tanlaganda bitta narsa hisobga olinmagan edi: **Prisma tip tizimi**. Extension `shopId` ni runtime'da kirita oladi, lekin `ProductUncheckedCreateInput.shopId` baribir majburiy bo'lib qoladi va servis uni qo'lda yozishga majbur — ya'ni §21.7 ning butun maqsadi ("dasturchi unutib qo'yolmaydi") bajarilmaydi. Prisma maydonni create tipida ixtiyoriy qilishining **yagona** yo'li — unda `@default(...)` bo'lishi. Default `current_setting` bo'lsa: (a) tip muammosi yo'qoladi, (b) kontekst yo'q bo'lsa `current_setting(…, true)` `NULL` qaytaradi va `NOT NULL` buziladi — ya'ni §14.4 talab qilgan "kontekstsiz so'rov xato beradi" baza darajasida bajariladi, (c) RLS qo'shish deyarli tekinga tushadi. RLS esa §21.8 dagi raw SQL teshigini butunlay yopadi va chegarani ORM'dan bazaga ko'chiradi — bu §17.8 dagi "kod xatosidan himoyaning oxirgi qatlami" falsafasining aynan o'zi |
| 21.14 | **Sessiya o'zgaruvchisi `set_config('app.current_shop_id', $1, true)` bilan qo'yiladi** — `SET LOCAL` matn interpolatsiyasi bilan emas | `SET LOCAL` parametr qabul qilmaydi, ya'ni qiymatni satrga qo'shish kerak bo'lardi. Qiymat bizning sessiyamizdan kelgan UUID bo'lsa ham, SQL'ga qiymat yopishtirish naqshi kod bazasida qoldirilmaydi — keyin kimdir uni boshqa joyda nusxalaydi. `set_config` oddiy funksiya, parametr bog'lanadi; uchinchi argument `true` — tranzaksiya doirasi (`SET LOCAL` bilan bir xil) |
| 21.15 | **O'qishlar extension ichida shaffof tranzaksiyaga o'raladi** — servislar `this.prisma.product.findMany(...)` yozishda davom etadi | RLS ishlashi uchun `app.current_shop_id` har ulanishda qo'yilgan bo'lishi shart, `set_config(..., true)` esa tranzaksiya talab qiladi. Yozuvlarda muammo yo'q — ularning hammasi allaqachon `$transaction` ichida (23 ta joy). O'qishlar esa yo'q: 58 ta chaqiruv. Ularni qo'lda tranzaksiyaga o'rash — 58 ta joyni o'zgartirish va keyin **har yangi so'rovda esdan chiqarish** mumkin bo'lgan qadam, ya'ni §21.7 rad etgan holatning qaytishi. Shuning uchun o'rash `$allOperations` ichida: kontekst bor va tranzaksiya yo'q bo'lsa, amal **bazaviy** klientning tranzaksiyasida qayta yuboriladi (`tx[model][operation](args)`) — bazaviy klient orqali, aks holda extension o'zini cheksiz chaqirardi. **Muhim xavf:** RLS yoqilgan holda o'zgaruvchi qo'yilmasa, siyosat hech bir qatorga to'g'ri kelmaydi va so'rov **bo'sh natija** qaytaradi — xato emas. Jim bo'sh natija xatodan battar, shuning uchun extension o'zgaruvchi qo'yilmaganini o'zi aniqlaydi va `SHOP_CONTEXT_MISSING` tashlaydi; bazaga umuman bormaydi |
| 21.16 | **`hisobai_app` va `hisobai_migrate` DB rollari shu bosqichda yaratiladi** | Ular `PERMISSIONS.md` §4 va `ARCHITECTURE.md` §12 da allaqachon talab qilingan, lekin bazada **faqat `postgres` superuser bor** — ya'ni "audit_logs o'zgarmas" kafolati (§12) bugungi kunda hech narsa bilan ta'minlanmagan, e'lon bo'lib qolgan. Endi buni kechiktirib bo'lmaydi: RLS jadval egasi va superuser uchun **chetlab o'tiladi**. `FORCE ROW LEVEL SECURITY` egani ham qamraydi, lekin superuser baribir o'tadi — shuning uchun ilova cheklangan rol ostida ulanishi **majburiy shart**, ixtiyoriy yaxshilanish emas |
| 21.17 | **`NULLIF(current_setting(…), '')` — `NULLIF` ataylab, uni soddalashtirib olib tashlash mumkin emas** | PostgreSQL'da maxsus (`app.*`) parametr **hech qachon qo'yilmagan** bo'lsa `current_setting(…, true)` `NULL` qaytaradi. Lekin `set_config(…, true)` bir marta ishlagach, tranzaksiya tugaganda qiymat `NULL` ga emas, **bo'sh satrga** qaytadi. Natijasi ulanish hovuzida halokatli darajada nomuvofiq bo'lardi: yangi ulanishda kontekstsiz so'rov jim bo'sh natija beradi (§21.15 tasvirlagan holat), ilgari ishlatilgan ulanishda esa `invalid input syntax for type uuid: ""` deb qulaydi. Ya'ni bir xil xatoning ikki xil ko'rinishi, va qaysi biri chiqishi ulanishning tarixiga bog'liq — bunday xatoni ishlab chiqarishda tutib bo'lmaydi. `NULLIF` ikkala yo'lni bitta aniqlangan holatga keltiradi. Bu implementatsiya paytida aniqlandi; §21.13 ning dastlabki tahriri `NULLIF` siz yozilgan edi |
| 21.18 | **Shop'siz hisobning account amallari `runWithoutShopScope()` ichida audit qilinadi.** `AuditService.record(tx, …)` `shopId` ni majburiy argument sifatida oladi; u `null` bo'lsa chaqiruv scope'siz bajariladi va `audit_logs.shop_id` `NULL` bo'lib yoziladi | Implementatsiya paytida aniqlangan holat: Shop'siz `SHOP_ADMIN` (§21.10 — normal holat) parolini o'zgartirsa, tranzaksiya faqat chiqarilgan modellarga (`User`, `Session`) tegadi, lekin audit yozuvi `AuditLog` ga tushadi — u chiqarilmagan. Kontekst yo'q, shuning uchun `set_config` ishlamaydi va `decideOperation` `SHOP_CONTEXT_MISSING` tashlaydi — natijada **parol o'zgarishi butunlay rollback bo'lardi**. Ikki yo'l bor edi: bunday amallarni umuman audit qilmaslik yoki scope'siz yozish. Birinchisi §2.2 ("audit har amalni kim qilganini yozadi") ni buzadi va aynan xavfsizlik uchun muhim amalni (parol o'zgarishi) jurnaldan chiqarib tashlardi. Ikkinchisi ishlaydi, chunki `audit_logs` siyosati `IS NOT DISTINCT FROM` bilan yozilgan: kontekst yo'q bo'lganda `NULL` qatorlar yoziladi ham, o'qiladi ham. Bu `runWithoutShopScope()` ning **ikkinchi qonuniy ishlatuvchisi** — §14.4 uni faqat `Platform` moduliga ruxsat bergan edi, endi ro'yxat ikkita |
| 21.19 | **`cbuRate` `PUT /exchange-rates/:date` kirish sxemasidan olib tashlandi** | §21.5 dan keyin CBU kursi platforma darajasidagi `cbu_rates` jadvalida va barcha Shop'lar uchun umumiy. Eski sxema uni qo'lda qo'yishga ruxsat berardi — bir tenantli tizimda zararsiz, ko'p tenantlida esa bitta do'kon **hammaning** CBU qiymatini o'zgartira olardi. Bu §25.9 ni buzadigan cross-tenant yozuv. Do'kon o'z kursini `store_rate` orqali baribir to'liq boshqaradi (§16.8), ya'ni imkoniyat yo'qolmaydi |
| 21.20 | **Fon jarayonlari `runWithShopScope(shop.id, …)` bilan Shop'ma-Shop aylanadi**, `runWithoutShopScope()` bilan emas | CBU sync (§10) HTTP so'rovi emas, ya'ni ambient kontekst yo'q. `runWithoutShopScope()` mantiqan yaqin ko'rinadi, lekin u RLS'ni butunlay ochib yubormaydi — aksincha, `set_config` ishlamagani uchun siyosat hech bir qatorga mos kelmaydi va `shop_exchange_rates` ga yozuv **jimgina hech narsa qilmaydi**. Shuning uchun fan-out har Shop uchun alohida kontekst ochadi — bu HTTP yo'lidagi `ShopContextInterceptor` bilan **aynan bir xil primitiv**, faqat N marta chaqiriladi. Har Shop o'z tranzaksiyasida va o'z `try/catch` ida: bitta do'konning xatosi qolganlarini kursisiz qoldirmasin |
| 21.21 | **Ilova ishlash vaqtida `DATABASE_URL_APP` orqali ulanadi; `DATABASE_URL` ga fallback YO'Q** — u bo'lmasa `PrismaService` konstruktori yiqiladi | §21.16 `hisobai_app` rolini talab qiladi, lekin talab kod ichida majburlanmasa u tavsiya bo'lib qolardi. Fallback aynan shu yerda xavfli: `DATABASE_URL` development'da superuser'ga ishora qiladi (`migrate dev` shadow-baza uchun kerak), superuser esa `FORCE ROW LEVEL SECURITY` ni ham chetlab o'tadi. Ya'ni bitta yozilmagan env qatori RLS qatlamini **jimgina** o'chirib qo'yardi va hamma narsa ishlayotgandek ko'rinardi. Ishga tushmaslik — to'g'ri xulq |
| 21.22 | **Advisory lock kaliti ikki argumentli: `pg_advisory_xact_lock(hashtext(shop_id), hashtext(nom))`** | §21.8 raw SQL extension'dan tashqarida qolishini aytadi; advisory lock esa butun **baza** bo'ylab global va RLS unga umuman qo'llanmaydi. Faqat nom bo'yicha qulflanganda ma'lumot sizmasdi, lekin ikki begona do'kon bir vaqtda "iPhone 15 Pro" qo'shsa biri ikkinchisini kutib turardi — tenant'lar bir-birini sekinlashtiradigan yashirin bog'liqlik. Postgres ikkita `int4` kalitni o'zi qo'llab-quvvatlaydi, ya'ni satrlarni birlashtirib hash qilish kerak emas |
| 21.23 | **`CurrentUserDto` `shopId` ni qaytaradi** va yo'naltirish login javobining o'zidan hal qilinadi | §21.10 bo'yicha SHOP_ADMIN account Shop'siz yaratiladi, ya'ni "Shop'i yo'q" — normal holat, xato emas. Usiz frontend buni faqat birinchi biznes so'rovi `SHOP_SETUP_REQUIRED` (409) bilan qaytganda bilardi: foydalanuvchi avval bo'sh dashboard va xato bannerini ko'rardi. §25.13 ga zid emas — qoida `shopId` ni client **yuborishini** taqiqlaydi (server uni sessiyadan oladi), qaytarishni emas; bu foydalanuvchining o'z Shop'i |
| 21.24 | **Platforma paneli `AppShell` ni ishlatmaydi — `(superadmin)` o'z qobig'iga ega, va 401 manzil bo'yicha ikki xil kirish sahifasiga otiladi** | `AppShell` `GET /shops/me` so'raydi, kurs chizig'ini chizadi va "Yangi savdo" tugmasini ko'rsatadi — §25.3 bo'yicha SUPERADMIN uchun bularning **hech biri** mavjud emas. Umumiy qobiqni "rejim" bayrog'i bilan ikkiga bo'lish tenant chegarasini kod ichida xiralashtirardi. Sessiya tizimi ham ikkita (§21.3), ya'ni kirish sahifasi ham ikkita: platforma panelidagi 401 ni `/login` ga otish SUPERADMIN'ni hisobi umuman yo'q formaga olib borardi — u to'g'ri parol bilan ham kira olmasdi va sababi ko'rinmasdi |
| 21.25 | **`prisma migrate dev` bu loyihada ishlamaydi; yangi migratsiyalar SQL sifatida qo'lda yozilib `migrate deploy` bilan qo'llanadi** | `migrate dev` shadow-baza yaratib barcha migratsiyalarni unga qayta qo'llaydi, `20260813150000_rls_tenant_isolation_and_roles` esa `ALTER TABLE _prisma_migrations OWNER TO hisobai_migrate` bajaradi — shadow bazada bu jadval o'sha paytda hali yo'q. To'g'ri tuzatish `IF EXISTS` bilan himoyalash bo'lardi, lekin migratsiya allaqachon qo'llangan: uni tahrirlash checksum'ni o'zgartiradi va Prisma "modified migration" deb ogohlantiradi. Cheklov va aylanma yo'l `apps/api/prisma/README-test-db.md` da yozilgan |
| 21.26 | **Izolyatsiya testlari haqiqiy PostgreSQL va `hisobai_app` roli ostida ishlaydi; `DATABASE_URL_TEST` berilmasa o'zlarini o'tkazib yuboradi** | Mocklangan test tenant chegarasini **umuman** kuzata olmaydi: qator filtri PostgreSQL RLS bilan majburlanadi, ilova kodi bilan emas. Superuser ostida ishlatilsa ham test yolg'on yashil bo'lardi (`FORCE ROW LEVEL SECURITY` superuser'ga qo'llanmaydi) — shuning uchun to'plamda `rolbypassrls = false` ni talab qiladigan alohida tekshiruv bor. Bazasiz mashinada `pnpm test` baribir yashil bo'lishi kerak, aks holda to'plam kundalik ishda o'chirib qo'yilardi |
| 21.27 | **Tenant chegarasidan TASHQARIDAGI jadvallarda filtr servis darajasida yoziladi va test bilan qulflanadi.** Birinchi qo'llanishi — `GET /auth/login-attempts` endi faqat chaqiruvchining o'z emaili bo'yicha | `SHOP_SCOPE_EXEMPT_MODELS` dagi 8 model uchun na RLS, na Prisma extension ishlaydi — ular ataylab chiqarilgan (login Shop konteksti paydo bo'lishidan oldin o'qiladi). Ya'ni bu jadvallarda "chegara avtomatik" degan kafolat **yo'q** va uni unutish oson: `login_attempts` filtrsiz o'qilgani uchun har bir do'kon egasi boshqa egalarning emaili, IP'si va qurilmasini ko'rardi — ekranda esa u "sizning kirishlaringiz" deb turardi. Umumiy qoida: chiqarilgan modelga tegadigan har bir o'qish `where` ni ONGLI yozadi va uni test `where` ning o'zini o'qib tekshiradi (natijani emas — mock'langan `findMany` har qanday filtr bilan ham "ishlaydi") |
| 21.28 | **Izolyatsiya testida qamrov ikkiga bo'linadi: xulq-atvor — 5 vakil modelda, RLS majburlanishi — 27 jadvalning HAMMASIDA** (ro'yxat DMMF'dan olinadi, `pg_class`/`pg_policy` o'qiladi) | `ARCHITECTURE.md` §12 tenant testini "namuna emas, parametrlangan" bo'lishini talab qiladi va sababini ham aytadi: keyin qo'shilgan resurs testsiz qolmasin. Har bir jadval uchun uchidan-uchiga fixture yozish esa FK zanjiri bor modellarda butun savdo tuzishga aylanib ketardi — narxi qamrovga arzimaydi. Yechim: qimmat qismi (yozish/o'qish/yangilash xulqi) vakil modellarda qoladi, arzon qismi (RLS yoqilgan + `FORCE` + siyosat bor) esa bazaning o'z katalogidan hamma jadval bo'yicha o'qiladi. Uchalasi ham tekshiriladi: `FORCE` siz jadval egasi chegarasiz bo'lardi, siyosatsiz jadval esa "xavfsiz" ko'rinib, aslida noto'g'ri sozlangan bo'lardi |
| 21.29 | **Kompozit-FK bolalar jadvallari uchun uchidan-uchiga izolyatsiya fixture'i 8-bosqichga qoldirilgan edi — endi `PaymentSchedule` orqali BAJARILDI** (§23.12) | Ular §21.28 dagi RLS majburlanishi tekshiruvi bilan **allaqachon** qamralgan (27 jadvalning ichida), lekin xulq-atvor darajasida sinalmagan va 5 vakil modeldan strukturaviy farq qiladi: `shop_id` denormalizatsiyalangan + ota jadvalga kompozit FK. Hozir fixture yozish butun savdo/shartnoma zanjirini qurishni talab qiladi — 8-bosqichda esa bu zanjir moduli bilan birga baribir yoziladi va fixture o'sha yerda tabiiy ravishda arzon bo'ladi. §18.1, §19.2 va §19.7 dagi bilan bir xil mulohaza: ishni u tabiiy joyiga qo'yish, uni ikki marta yozmaslik. **Qoldirilgani ataylab yozib qo'yilmoqda** — aks holda u "unutilgan" ko'rinardi |

---

## 22. 7-bosqich qarorlari (2026-08-14 — qaytarish va bekor qilish)

| §     | Qaror | Sabab |
| ----- | ----- | ----- |
| 22.1 | **Qaytarish va bekor qilish bitta servisda, lekin ikkita endpoint va ikkita ekran** | Mexanizm bir xil (teskari `sales` qatori), biznes ma'nosi esa boshqa (§8) va `ARCHITECTURE.md` §14.5 umumiy `POST /sales/:id/reverse` ni ataylab rad etadi. Kodda ularni ajratish esa uchta shartni takrorlashga olib kelardi: sana, ombor holati va qamrov. Shuning uchun farqlar bitta `kind` parametrida jamlangan va ular yonma-yon ko'rinib turadi — servis izohida jadval sifatida |
| 22.2 | **Teskari qatorning `sale_items` lari ham yoziladi, `quantity` musbat; manfiy ishora faqat `sales.total` da** | §17.4 faqat `total` ning manfiyligini talab qiladi. Qatorlarni umuman yozmaslik ham mumkin edi (asl savdodagi `returned_quantity` bor), lekin o'sha ustun — **kesh**, teskari qator esa haqiqat manbai: "nima qaytdi" degan savolga kesh emas, qatorlar javob berishi kerak. Miqdorni manfiy yozish esa `stock_movements` bilan ziddiyat tug'dirardi — u yerda ham miqdor musbat, yo'nalishni `type` bildiradi |
| 22.3 | **Tannarx snapshoti teskari qatorga ham ko'chiriladi** | Usiz qaytarish "sotuv summasi manfiy, tannarx nol" bo'lib yozilardi va hisobotda qaytarish **foyda keltirgandek** ko'rinardi. §7.11 snapshot'ning butun ma'nosi shunda: keyingi narx o'zgarishi eski yozuvni buzmasin |
| 22.4 | **Raqam asl raqamdan hosil bo'ladi (`-R1`), `sale_counters` ga tegilmaydi** | §17.4 formatni belgilaydi. Hisoblagichdan raqam olish "bu yil nechta savdo bo'ldi" degan savolga yolg'on javob berardi: teskari yozuv yangi savdo emas. Tartib raqami mavjud teskari qatorlar sonidan olinadi, ya'ni ikkinchi qisman qaytarish `-R2` bo'ladi |
| 22.5 | **Pul to'lovlar bo'yicha KETMA-KET qaytariladi, proporsional emas** | Qisman qaytarishda summani barcha to'lovlarga ulushlab bo'lish har bir hisobdan tiyin-tiyin pul chiqarardi — kassani sanab tizim bilan solishtirish imkonsiz bo'lardi (§11.3 dagi muammoning o'zi). Ketma-ket qamrash to'liq qaytarishda baribir barcha to'lovlarni aniq nolga chiqaradi (§8.1), qisman qaytarishda esa bitta hisobdan tushunarli summa chiqadi |
| 22.6 | **Qisman qaytarilgan to'lov `CONFIRMED` bo'lib qoladi; faqat to'liq qoplangani `REVERSED` bo'ladi** | "Yarim qaytarilgan to'lov" degan holat `PaymentStatus` da yo'q va uni ixtiro qilish hisobotni buzardi. Pulning bir qismi mijozda, qolgani do'konda — buni kassa yozuvlari aniq ko'rsatadi, to'lov statusi esa faqat "bu to'lov butunlay bekor qilindimi" degan savolga javob beradi |
| 22.7 | **Tasdiqlanmagan o'tkazma qaytarishda `REJECTED` bo'ladi, undan pul chiqmaydi** | §17.2 bo'yicha `PENDING_VERIFICATION` to'lov kassaga umuman tushmagan, ya'ni qaytariladigan pul ham yo'q. Uni `REVERSED` qilish "pul kelgan edi, qaytardik" degan yolg'on iz qoldirardi; `REJECTED` esa aynan bo'lgan narsani aytadi — pul kelmadi va endi kutilmaydi |
| 22.8 | **Qisman qaytarilgan savdo bekor qilinmaydi** | Bekor qilish "jismonan hech narsa bo'lmagan" degani, qisman qaytarish esa mahsulot haqiqatan qaytganini allaqachon qayd etgan. Ikkalasi bitta savdoda rost bo'la olmaydi. Foydalanuvchiga aytiladigan yo'l aniq: qolganini ham qaytarish |
| 22.9 | **Bekor qilishda ombor `AVAILABLE` bo'ladi, `RETURNED` emas va sabab yozilmaydi** | §16.4 "qaytarilgan mahsulot" belgisi savdo formasida ko'rinadi va u xaridorga aytiladigan ma'lumot. Bekor qilingan savdoda telefon do'kondan umuman chiqmagan — uni qaytgan mahsulot deb belgilash mijozga yolg'on aytish bo'lardi |
| 22.10 | **Nasiya savdoni qaytarish (§8.5, §16.12) 7-bosqichda YO'Q edi** — **8-bosqichda (D qismi) bajarildi**, §23.4–23.6 ga qarang | Shartnoma va to'lov jadvali moduli 8-bosqichda. §16.12 qarzni "to'lanmagan jadval qatorlaridan, oxirgisidan boshlab" kamaytirishni talab qiladi — 7-bosqichda bu jadval hali mavjud emas edi va savdo baribir faqat naqd bo'lgan (§20.1) |
| 22.11 | **Qaytarish paneli modal emas — kartaning ichida ochiladi** | Telefonda foydalanuvchi qatorlarni tanlab, miqdorni kiritadi va shu payt yuqoridagi jadvalga qarab turadi. Modal uni to'sib qo'yardi. Ikkala amal bitta panelda, chunki foydalanuvchi ular ORASIDAN tanlaydi — har birining ostida farqi yozib qo'yilgan, aks holda "qaysi birini bosishim kerak edi" degan savol javobsiz qolardi |

---

## 23. 8-bosqich qarorlari (2026-08-14 — nasiya va to'lovlar)

| §     | Qaror | Sabab |
| ----- | ----- | ----- |
| 23.1 | **Nasiya hisob-kitobi `contracts` paketida, ikkala tomon uchun umumiy** (`splitMoney`, `percentOfMoney`, `prorateMoney`, `addMonthsClamped`, `generateMonthlySchedule`) | Jadval ekranda tuziladi, serverda esa §9.6 bo'yicha tekshiriladi. Ikki joyda ikki xil yozilsa, ega ekranda "hammasi to'g'ri" ni ko'rib tugmani bosadi va server `INSTALLMENT_SCHEDULE_SUM_MISMATCH` bilan rad etadi — hech kim tushuntira olmaydigan holat. `convertMoney` bilan aynan bir xil sabab. Hisob butunlay `BigInt` da (§17.14): `Number` arifmetikasi tiyinni yo'qotib, §9.6 tekshiruvini yolg'on yiqitardi |
| 23.2 | **Jadval API'ga doim QATORLAR ro'yxati bo'lib uzatiladi, "oylik" degan rejim emas** | §9.5 uch usulni sanaydi (avtomatik, qo'lda, aralash), lekin ular faqat qatorlar QAYERDA tuzilishi bilan farq qiladi: avtomatik variantda ularni `generateMonthlySchedule` tuzadi va foydalanuvchi tahrirlaydi — "aralash" aynan shu. Server uchun uchalasi bir xil ko'rinadi va §9.6 tekshiruvi bitta joyda qoladi. Rejimni serverga o'tkazish generator mantig'ini ikki marta yozishni talab qilardi |
| 23.3 | **`payment_allocations` alohida jadval; `amount_paid` shunchaki oshirilmaydi** | §10.6 to'lovni qaytarganda qarz **aynan** tiklanishini talab qiladi. Faqat kesh oshirilsa, bir necha to'lov aralashgan qatorda "qaysi qatordan qancha ayirish kerak" degan savolga javob yo'q bo'lardi va ulushni qayta hisoblash yaxlitlash tufayli asl summadan farq qilishi mumkin edi. Taqsimot qatorlari aniq javob beradi: nimani qo'shgan bo'lsak, o'shani olib tashlaymiz |
| 23.4 | **Nasiya savdo qaytarilganda pul AVTOMATIK qaytarilmaydi** (naqd savdoda esa qaytariladi) | §8.5 buni ochiq aytadi: to'langan pulni qaytarish/qaytarmaslikni **ega** hal qiladi. Mijoz bir necha oy to'lagan bo'lishi mumkin va bu summani nima qilish — muzokara masalasi, hisob-kitob emas. Ega qaroridan keyin har bir to'lovni alohida `POST /payments/:id/reverse` bilan qaytaradi. Naqd savdoda aksincha: pul bitta amalda to'liq to'langan (§17.10), ya'ni qaytarish ham bir ma'noli |
| 23.5 | **Qisman qaytarishda qarz qaytgan qiymat + ustamaning PROPORSIONAL ulushi miqdorida kamayadi** (§16.12) | Ustama butun savdoga qo'yilgan (§9.3). Uni to'liq qoldirish qaytarilgan mahsulot uchun ustama undirish bo'lardi; butunlay olib tashlash esa qolgan mahsulot uchun ustamani bekor qilardi. Ulush `prorateMoney` bilan aniq hisoblanadi — `percentOfMoney` yaramaydi, chunki nisbat ixtiyoriy bo'lishi mumkin (masalan 1/3) |
| 23.6 | **Kamayish faqat to'lanmagan qatorlardan va OXIRGISIDAN boshlab ayriladi; yetmagan qism qaytarilmaydi** | §16.12 ning aynan matni. To'langan va qisman to'langan qatorga tegib bo'lmaydi (§9.10 — ularga taqsimotlar bog'langan). Oxirgidan boshlash mijozning eng yaqin to'lov muddatini joyida qoldiradi: u allaqachon pul rejalashtirgan. Yetmagan qism uchun shartnoma yopiladi (`CLOSED`, `CANCELLED` emas — savdoning qolgan qismi kuchda) va ortig'i §8.5 ga havola qilinadi: tizim o'zi so'ralmagan pul chiqarmaydi |
| 23.7 | **Erta yopish (§9.12) alohida mexanizm emas — oddiy to'lov sifatida yoziladi** | Shartnomani `AllocationService` qarz nolga tushganda o'zi yopadi (§17.18). Alohida yo'l yozilsa, kassaga pul tushishi ikkinchi marta boshqacha yozilardi va §17.2 ("kassaga pul faqat to'lov orqali tushadi") ikkinchi yo'l bilan buzilardi |
| 23.8 | **Qarz qoldig'i yaxlitlanmaydi va formulasi bitta joyda** (`outstandingOfRows`) | Dastlab u ikki joyda ikki xil hisoblanardi: mapper har qatorni alohida yaxlitlardi, to'lov tranzaksiyasi esa aniq hisoblardi. Natijada §16.11 bo'yicha yopilgan shartnoma ekranda hali ham "1 so'm qarzi bor" bo'lib ko'rinardi. Yaxlitlash aynan shu himoyani o'chirib qo'yardi: 0.50 so'm "1 so'm" bo'lib, ifodalab bo'lmaydigan qoldiq abadiy qarz bo'lib osilib qolardi |
| 23.9 | **`POST /installments` yo'q; `DELETE` ham yo'q** | Shartnoma savdo tasdiqlanganda o'sha tranzaksiya ichida yaratiladi (§9.1). Alohida endpoint shartnomasiz nasiya savdo yaratish yo'lini ochib qo'yardi. O'chirish ham yo'q: savdo qaytarilganda shartnoma `CANCELLED` bo'ladi (§17.18) |
| 23.10 | **Jadvalni qayta tuzishda tegilmagan qatorlar tartib raqamini SAQLAB qoladi** | Ularga to'lov tarixi bog'langan; raqamni surish "3-oy to'landi" degan yozuvni boshqa oyga ko'chirardi. Yangi qatorlar esa zich davom etadi, ya'ni ekranda "3-oy" haqiqatan uchinchi qator bo'ladi |
| 23.11 | **`overdue` filtri xotirada qo'llanadi, SQL'da emas** (§9.8) | Kechikish saqlanmaydi, sanadan hisoblanadi va "bugun" do'kon vaqt zonasida aniqlanadi (§1.3). SQL'da `AT TIME ZONE` bilan yozilgan shart `due_date` indeksidan foydalana olmasdi. Sahifa hajmi `limit` bilan cheklangani uchun xotirada filtrlash qimmat emas |

| 23.12 | **Kompozit-FK naqshi izolyatsiya to'plamida `PaymentSchedule` orqali qamraldi** (§21.29 yopildi) | Bu jadvalda `shop_id` IKKI yo'ldan kelishi mumkin: ustun default'idan (`current_setting`) va otaning qiymatidan (kompozit FK). Ular zid bo'lsa FK yozuvni to'sishi, RLS esa qatorni ko'rsatmasligi kerak — vakil modellar (Customer, Category, …) bu yo'lni umuman sinamaydi. Fikstura butun zanjirni quradi: savdo → shartnoma → jadval qatori. Qolgan shunday jadvallar (`SaleItem`, `PaymentAllocation`, `StocktakeLine`) aynan bir xil naqsh va bir xil RLS siyosatidan foydalanadi, ya'ni ular uchun alohida zanjir qurish qamrovga yangi narsa qo'shmaydi |
| 23.13 | **Kurs tranzaksiyadan TASHQARIDA o'qiladi** (`confirm`, `payments.create`) | Ilovani haqiqatan ishga tushirganda topildi: savdo umuman tasdiqlanmasdi. Tranzaksiya ochilganda `set_config` o'sha tranzaksiyaning ulanishida ishlaydi (§21.14), `decideOperation` esa tranzaksiya ichida o'qishni o'ramaydi (self-deadlock bo'lmasin deb) — lekin `ExchangeRatesService` o'z `PrismaService` ini ishlatadi, ya'ni so'rov `app.current_shop_id` qo'yilmagan BOSHQA ulanishga tushadi va RLS hamma qatorni to'sadi. 387 mocklangan test buni ko'ra olmaydi: ularda RLS umuman ishtirok etmaydi. **Umumiy qoida:** tranzaksiya ichidan boshqa servisning `PrismaService` iga so'rov yubormaslik — yo `tx` ni uzatish, yo qiymatni oldindan o'qish. Qoida `transaction-scope-audit.spec.ts` bilan qulflangan: u manba matnini o'qiydi, chunki xato faqat RLS yoqilgan haqiqiy bazada ko'rinadi va mock'langan test uni printsipial ravishda ko'ra olmaydi |
| 23.14 | **Mijoz raqami to'qnashuvida "kimda bor" degan javob tranzaksiyadan TASHQARIDA olinadi** | §23.13 ning ikkinchi qurboni, audit paytida topildi. Ikki sabab: (1) tranzaksiya ichidan `this.prisma` boshqa ulanishga tushadi va RLS mijozni topmaydi — xabar "raqam band" degan umumiy matnga tushib qolardi, ya'ni §6.3 talab qilgan ism yo'qolardi; (2) unique buzilishidan keyin tranzaksiyaning o'zi abort holatida, ya'ni `tx` orqali so'rash ham ishlamasdi. Yechim: xato yuqoriga uzatiladi va `update()` uni tashqarida boyitadi |

---

## Ochiq savollar

| Mavzu | Savol |
|-------|-------|
| 15 | SMTP provider tanlash (Gmail app-parol / Resend / Brevo) |
| 2 | CBU API endpointining aniq manzili va javob formati tekshirilishi kerak |
| 16.13 | Hosting lokalizatsiyasi bo'yicha yuridik tasdiq |
