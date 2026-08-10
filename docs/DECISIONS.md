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
| 18.3 | **IMEI ustunlararo takrorlanishi trigger bilan to'siladi** (§5.3) | Ustunlardagi `@unique` faqat o'z ustuni ichida ishlardi: `A.imei_1 = B.imei_2` ruxsat etilardi, ya'ni bitta telefon bazada ikki marta tura olardi. Trigger uchala identifikatorni (`imei_1`, `imei_2`, `serial_number`) barcha qatorlarning uchalasi bilan solishtiradi. Tekshirishdan oldin qiymat bo'yicha `pg_advisory_xact_lock` olinadi — usiz `READ COMMITTED` da ikkita parallel qabul bir-birini ko'rmasdan o'tib ketardi (§17.5 rad etgan TOCTOU naqshi). Katalog bo'sh ekan bu bitta migratsiya; ma'lumot to'plangach dublikatlarni ajratish ancha qimmat |

---

## Ochiq savollar

| Mavzu | Savol |
|-------|-------|
| 15 | SMTP provider tanlash (Gmail app-parol / Resend / Brevo) |
| 2 | CBU API endpointining aniq manzili va javob formati tekshirilishi kerak |
| 16.13 | Hosting lokalizatsiyasi bo'yicha yuridik tasdiq |
