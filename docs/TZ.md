# HisobAI CRM — Texnik topshiriq (v0.2)

> **v0.2 haqida.** Bu hujjat v0.1 (Baraka Mobile CRM) ustiga `DECISIONS.md`dagi
> 2026-08-05/06 dizayn muhokamasi natijalarini qo'llaydi. Jadvallardagi
> `§` ustuni qaror raqamini ko'rsatadi — batafsil sabab `DECISIONS.md`da.
> Ziddiyat chiqsa **`DECISIONS.md` ustun turadi**.

## 1. Maqsad

**HisobAI** — telefon do'konlari uchun naqd va nasiya savdolarini, mahsulot
omborini, mijozlar qarzdorligini, pul harakatini va biznes tahlilini yagona
web-ilovada yurituvchi CRM.

Tizim daftardagi qo'lda hisobni almashtiradi, moliyaviy ma'lumotlar
izchilligini saqlaydi va egaga tezkor boshqaruv qarorlarida yordam beradi.

## 2. Foydalanuvchi va foydalanish muhiti

| §   | Talab                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1 | MVP'da **bitta foydalanuvchi** (do'kon egasi), lekin ma'lumotlar bazasi ko'p foydalanuvchini ko'taradi: `users` jadvali + `role` maydoni |
| 2.3 | UI'da rol tanlash yo'q; ruxsat tekshiruvi kodda bor, bitta rol bilan ishlaydi                                                            |
| 2.2 | Audit har amalni **qaysi foydalanuvchi** qilganini yozadi — keyin rol qo'shish qayta qurish talab qilmaydi                               |

- Yopiq tizim: faqat login/parol bilan kirish.
- Asosiy qurilmalar: telefon va noutbuk brauzeri.
- Responsive PWA: telefon ekranida qulay, noutbukda to'liq ish maydoni.
- Light va dark mode; tanlov saqlanadi va tizim mavzusiga moslasha oladi.
- O'zbekcha interfeys.

## 3. Valyuta tizimi

Bu v0.2 ning eng katta o'zgarishi. Valyuta deyarli har bir moliyaviy
jadvalga tegadi, shuning uchun u boshidan quriladi.

| §    | Qoida                                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------- |
| 1.1  | **Bazaviy valyuta — UZS.** Barcha hisobot, foyda va dashboard so'mda jamlanadi                              |
| 1.2  | **Mahsulotga bitta valyuta** — tannarx ham, sotuv narxi ham o'sha valyutada                                 |
| 1.9  | **Bitta savdo — bitta valyuta.** Boshqa valyutadagi mahsulot savatga qo'shilsa, savdo kursida aylantiriladi |
| 1.3  | **Qarz savdo valyutasida qoladi.** USD'da sotilgan mahsulot qarzi USD'da qoladi                             |
| 1.7  | Kurs har savdo va har to'lovda **snapshot** sifatida saqlanadi va hech qachon qayta hisoblanmaydi           |
| 1.8  | Qaytarish va bekor qilish **asl kursda** bajariladi — teskari yozuv savdoni aniq nolga chiqaradi            |
| 1.6  | **Kassada so'm va dollar qoldig'i alohida** yuritiladi                                                      |
| 1.10 | Yaxlitlash: USD 2 kasr xonagacha, UZS butun songacha (tiyin ishlatilmaydi)                                  |

### Kurs manbai

| §         | Qoida                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------- |
| 3.1       | **Ikkita kurs saqlanadi:** CBU kursi (avtomatik, ma'lumot uchun) va **do'kon kursi** (savdo va to'lovlarda ishlatiladi) |
| 3.2       | Do'kon kursi CBU'dan ustama bilan avtomatik hisoblanadi yoki qo'lda kiritiladi; ikkalasi UI'da yonma-yon ko'rinadi      |
| 3.3       | CBU kursi har kuni **09:00 (Toshkent)** da olinadi; har kun uchun bitta qator                                           |
| 1.5 · 3.4 | **Kurs eskirsa savdo to'xtamaydi:** oxirgi ma'lum kurs ishlatiladi + ekran tepasida ogohlantirish chizig'i              |
| 3.5       | Kurs tarixi saqlanadi: sana, CBU kursi, do'kon kursi, manba (`CBU`/`MANUAL`), olingan vaqt, kim o'zgartirgan            |

## 4. Kirish va xavfsizlik

| §    | Talab                                                                                                                 |
| ---- | --------------------------------------------------------------------------------------------------------------------- |
| 2.4  | Parol **Argon2id** bilan hash qilinadi                                                                                |
| 2.7  | **Sessiya 30 kun.** Sozlamalarda faol sessiyalar ro'yxati (qurilma, IP, oxirgi kirish) va ularni o'chirish imkoni     |
| 2.8  | Sessiya cookie'si `HttpOnly`, `Secure`, `SameSite`; CSRF himoyasi qo'llanadi                                          |
| 2.9  | Login urinishi cheklanadi: **5 marta xato → 15 daqiqa blok** (IP va email bo'yicha)                                   |
| 2.10 | **Kirish jurnali:** muvaffaqiyatli va muvaffaqiyatsiz urinishlar yoziladi (vaqt, IP, qurilma), sozlamalarda ko'rinadi |
| 2.5  | **Parol tiklash — email orqali havola** (SMTP; provider tanlanishi kutilmoqda)                                        |
| 2.6  | SMTP ulangunicha zaxira — server komandasi orqali parol o'rnatish                                                     |

## 5. Sozlamalar

| §    | Sozlama                                                                                                                               |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 3.6  | Do'kon **nomi, logosi, manzili, telefoni** — PDF, login sahifasi va eksportlarda                                                      |
| 3.7  | **Ish vaqti va dam olish kunlari** — hisobot o'rtachalari uchun va dam olish kunida eslatma yubormaslik uchun                         |
| 3.8  | **Umumiy kam qoldiq chegarasi** — mahsulotga alohida chegara qo'yilmasa shu ishlatiladi                                               |
| 3.9  | **Standart nasiya shartlari** (muddat, boshlang'ich to'lov foizi) — formada oldindan to'ldiriladi, har savdoda o'zgartirilishi mumkin |
| 3.10 | **Kurs va moliyaviy sozlamalar** o'zgarishi audit'ga yoziladi (kim, qachon, nimadan nimaga)                                           |

## 6. Katalog (mahsulot shablonlari)

**Mahsulot (shablon)** va **ombor birligi (fizik narsa)** qat'iy ajratiladi.
Sabab: bir xil modelni har safar boshqa narxda olasiz — tannarx shablonda
tursa, foyda noto'g'ri hisoblanadi.

| §    | Talab                                                                                                                                     |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1  | **Haqiqiy tannarx har ombor birligida** (yoki miqdorli mahsulotda — partiyada) saqlanadi                                                  |
| 4.2  | Mahsulot kartasidagi tannarx — **faqat ma'lumot uchun** (oxirgi/o'rtacha), qabul formasida oldindan to'ldiriladi                          |
| 4.3  | **Kategoriya va brend — alohida jadvallar**, avtoto'ldirish bilan. Dublikat oldi olinadi                                                  |
| 4.4  | Yangi kategoriya/brendni mahsulot formasidan qo'shish mumkin; sozlamalarda tahrirlash va birlashtirish                                    |
| 4.5  | Maydonlar: kategoriya, brend, model, **xotira**, **rang**, turi (seriyali/miqdorli), valyuta, tavsiya narxi, kam qoldiq chegarasi, tavsif |
| 4.6  | **Nomi avtomatik yig'iladi:** brend + model + xotira + rang → "Apple iPhone 15 Pro 256GB Qora"                                            |
| 4.7  | Aksessuarlarda xotira va rang bo'sh qoladi                                                                                                |
| 4.8  | **Mahsulot o'chirilmaydi — arxivlanadi.** Yangi savdoda ko'rinmaydi, eski yozuvlar butun qoladi                                           |
| 4.9  | **IMEI/shtrix-kodni telefon kamerasi bilan skanerlash** — qabul va savdo formasida                                                        |
| 4.10 | **Mahsulot shabloniga rasm** biriktirish                                                                                                  |

## 7. Ombor

| §    | Talab                                                                                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1  | **Seriyali mahsulot** — har fizik birlik alohida yozuv, o'z tannarxi va holati bilan                                                                      |
| 5.2  | **Miqdorli mahsulot** — **partiya** bo'yicha: miqdor + donasiga tannarx. Har partiya boshqa narxda keladi, foyda aniq hisoblanishi kerak                  |
| 5.3  | **IMEI-1 va IMEI-2** (ikkinchisi ixtiyoriy). Ikkalasi bo'yicha qidiriladi, ikkalasi ham takrorlanmaydi                                                    |
| 5.4  | Holatlar: `MAVJUD` · `SOTILGAN` · `QAYTARILGAN` · `CHIQARILGAN`. **"Rezerv" holati yo'q**                                                                 |
| 5.5  | Savdo qoralamasi mahsulotni ushlab turmaydi. Bir xil IMEI ikki qoralamada bo'lishi mumkin — **birinchi tasdiqlagan oladi**, ikkinchisiga xato qaytariladi |
| 5.6  | **Inventarizatsiya** ekrani: jismonan sanab, tizimdagi qoldiq bilan solishtirish; farq sababi bilan tuzatiladi                                            |
| 5.7  | Tuzatish sababi: `yo'qolgan` · `nuqsonli` · `xato hisob` · `boshqa`. Hisobotda sabablar ajratiladi                                                        |
| 5.8  | **Shaxsiy foydalanishga olish** — mahsulot ombordan chiqadi, tannarx miqdorida xarajat sifatida yoziladi                                                  |
| 5.9  | **Ombor qiymati bugungi do'kon kursida** baholanadi. Foyda hisobi esa savdo paytidagi snapshot kursda qoladi — o'tgan davr hisoboti o'zgarmaydi           |
| 5.10 | Har o'zgarish yoziladi va hech qachon o'chirilmaydi: `QABUL` · `SOTUV` · `QAYTARISH` · `TUZATISH` · `SHAXSIY`                                             |
| 5.11 | Qabul qilish bitta tranzaksiyada; bir nechta IMEI'ni birdaniga kiritish mumkin                                                                            |

## 8. Mijozlar

| §         | Talab                                                                                                                                                          |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 6.1       | Naqd savdoda mijoz **ixtiyoriy**, nasiyada **majburiy**                                                                                                        |
| 6.2       | Telefon **E.164 formatiga normalizatsiya** qilinadi (`+998901234567`) va takrorlanmaydi                                                                        |
| 6.3       | Kiritishda dublikat tekshiriladi: "Bu raqam Alisher Karimovda bor. O'shami?"                                                                                   |
| 6.4       | **Asosiy telefon** (majburiy, SMS shunga ketadi, unique) + **qo'shimcha telefon** (ixtiyoriy). Ikkalasi bo'yicha qidiriladi                                    |
| 6.5       | **Passport ma'lumoti:** seriya, raqam, JSHSHIR. Nasiya shartnomasi PDF'ida chiqadi                                                                             |
| 6.6 · 6.7 | **Passport rasmi** biriktiriladi; hech qachon ochiq havolada bo'lmaydi — faqat vaqtinchalik, autentifikatsiyalangan havola; **kim ko'rgani audit'ga yoziladi** |
| 6.8       | Kafil ma'lumoti **kiritilmaydi** (scope'dan tashqari)                                                                                                          |
| 6.9       | **"Ehtiyot bo'ling" belgisi** + sababi. Nasiya savdo boshlanganda ogohlantiradi, lekin **taqiqlamaydi**                                                        |
| 6.10      | To'lov intizomi ko'rsatkichi **hisoblanmaydi** — to'lovlar tarixi baribir ko'rinadi                                                                            |
| 6.11      | **Joriy qarz USD va UZS alohida** ko'rsatiladi                                                                                                                 |
| 6.12      | Qarz **hech qachon qo'lda yozilmaydi** — faqat tranzaksiyalardan hisoblanadi                                                                                   |
| 6.13      | Savdosi bor mijoz o'chirilmaydi — **arxivlanadi**                                                                                                              |

## 9. Savdo

### Ikki bosqichli oqim

`QORALAMA` — istalgancha o'zgartiriladi, o'chiriladi, hech narsaga ta'sir qilmaydi.
`TASDIQLANGAN` — o'zgartirilmaydi va o'chirilmaydi; faqat qaytarish bilan tuzatiladi.

### Tasdiqlash tranzaksiyasi (§7, hammasi bitta tranzaksiyada)

1. Mahsulotlar hali mavjudmi — tekshiriladi
2. Savdo va uning qatorlari yaratiladi, **kurs snapshot** va **tannarx snapshot** yoziladi
3. Ombor birligi `SOTILGAN` bo'ladi / miqdor kamayadi + ombor harakati yoziladi
4. To'langan summa kassaga kirim bo'ladi (valyutasi bo'yicha tegishli hisobga)
5. Nasiya bo'lsa, shartnoma va to'lov jadvali shu yerda yaratiladi
6. Audit yozuvi

Bittasi xato bersa — hech biri saqlanmaydi.

| §    | Talab                                                                                                                       |
| ---- | --------------------------------------------------------------------------------------------------------------------------- |
| 7.1  | **Aralash to'lov:** bitta savdoga bir nechta to'lov, har biri o'z usuli, valyutasi va holati bilan                          |
| 7.3  | **Alohida chegirma maydoni yo'q** — sotuv narxi to'g'ridan-to'g'ri o'zgartiriladi                                           |
| 7.4  | Savdo qatorida **tavsiya narx ham snapshot** qilinadi; chegirma hisoboti `tavsiya narx − haqiqiy narx` sifatida hisoblanadi |
| 7.5  | **Savdo sanasini 7 kungacha orqaga** qo'yish mumkin; audit'ga yoziladi                                                      |
| 7.6  | **Savdo raqami:** yil + ketma-ket raqam (`2026-00147`), har yil boshida qaytadan                                            |
| 7.7  | **Qoralamani saqlash** mumkin — ombor va kassaga ta'sir qilmaydi                                                            |
| 7.8  | **Tannarxdan past sotishda ogohlantirish** chiqadi, lekin taqiqlamaydi                                                      |
| 7.9  | **Savat ichida har qatorning foydasi** ko'rsatiladi                                                                         |
| 7.10 | **Kalkulator savdo formasida** ochiladi, natijani narx maydoniga o'tkazadi                                                  |
| 7.11 | Har qatorda: mahsulot, miqdor, sotuv narxi, **tannarx snapshot**, tavsiya narx snapshot                                     |

Transfer to'lovi Telegram cheki asosida qo'lda tasdiqlanadi. Telegram bilan
avtomatik integratsiya scope'da yo'q.

## 10. Qaytarish va bekor qilish

Ikki xil holat qat'iy ajratiladi:

- **Bekor qilish** — savdo xato kiritilgan, jismonan hech narsa bo'lmagan. Hisobotda savdo umuman bo'lmagandek.
- **Qaytarish** — mahsulot haqiqatan qaytib keldi. Hisobotda savdo ham, qaytarish ham ko'rinadi.

Asl savdo **hech qachon o'chirilmaydi** — ustiga teskari yozuv qo'shiladi.

| §   | Talab                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 8.1 | Qaytarish **asl savdoning kursida** — savdo aniq nolga chiqadi, soxta kurs foydasi paydo bo'lmaydi                                              |
| 8.2 | Qaytgan mahsulot omborga **"qaytarilgan" belgisi + sababi** bilan qaytadi                                                                       |
| 8.3 | Qaytgan mahsulot ombor qiymatida to'liq hisoblanadi                                                                                             |
| 8.4 | **Qisman qaytarish** mumkin — tanlangan qatorlar; miqdorli mahsulotda qisman miqdor ham                                                         |
| 8.5 | **Nasiya savdo qaytarilsa:** shartnoma yopiladi, mahsulot omborga qaytadi. To'langan pulni qaytarish/qaytarmaslikni **admin qo'lda hal qiladi** |
| 8.6 | **Sabab majburiy** (nuqson / mijoz fikri o'zgardi / xato kiritildi / boshqa), audit'ga yoziladi                                                 |
| 8.7 | **Qaytarish o'z sanasiga yoziladi**, savdo sanasiga emas. O'tgan davr aylanmasi o'zgarmaydi                                                     |
| 8.8 | **Muddat cheklovi yo'q** — 8.7 tufayli kerak emas                                                                                               |

## 11. Nasiya va qarzdorlik

| §    | Talab                                                                                                                                                      |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 9.1  | Shartnoma savdo tasdiqlanganda **o'sha tranzaksiya ichida** yaratiladi                                                                                     |
| 9.2  | Shartnoma valyutasi = savdo valyutasi, **o'zgarmaydi**                                                                                                     |
| 9.3  | **Alohida ustama maydoni:** naqd narx ko'rsatiladi, ustiga ustama qo'shiladi — summa yoki foiz                                                             |
| 9.4  | Hisobotda **"nasiya ustamasidan daromad"** alohida ko'rinadi                                                                                               |
| 9.5  | Jadval **oylik avtomatik**, **qo'lda** yoki **aralash** tuziladi                                                                                           |
| 9.6  | **Jadval summasi qarzga teng bo'lishi shart** — teng bo'lmasa savdo tasdiqlanmaydi                                                                         |
| 9.7  | Holatlar: `FAOL` · `YOPILGAN` · `BEKOR QILINGAN`                                                                                                           |
| 9.8  | **"Muddati o'tgan" saqlanmaydi — sanadan hisoblanadi.** Saqlansa uni yangilab turadigan jarayon kerak bo'ladi va u ishlamay qolsa holat yolg'on ko'rsatadi |
| 9.9  | **Jarima yo'q.** Kechikish faqat ogohlantirish sifatida ko'rsatiladi                                                                                       |
| 9.10 | **Jadvalni qayta tuzish faqat to'lanmagan qatorlarda.** To'langan yoki qisman to'langanga tegib bo'lmaydi                                                  |
| 9.11 | Qayta tuzish sababi bilan audit'ga yoziladi; umumiy qarz o'zgarmaydi — faqat sanalar/summalar taqsimoti                                                    |
| 9.12 | **Erta yopish:** qolgan summa ko'rsatiladi, mijoz to'laydi, shartnoma yopiladi. Ustama qaytarilmaydi                                                       |

## 12. To'lovlar

| Holat            | Ma'nosi                                                      |
| ---------------- | ------------------------------------------------------------ |
| `TEKSHIRILMOQDA` | Transfer bildirilgan, admin hali tasdiqlamagan               |
| `TASDIQLANGAN`   | Pul qabul qilindi — qarz kamayadi, kassaga tushadi           |
| `RAD ETILGAN`    | Tasdiqlanmadi — moliyaviy hisobga umuman kirmaydi            |
| `QAYTARILGAN`    | Ilgari tasdiqlangan to'lov teskari yozuv bilan bekor qilindi |

Naqd to'lov darhol `TASDIQLANGAN`. **Faqat `TASDIQLANGAN` to'lov qarzni
kamaytiradi va kassaga tushadi.**

To'lov yozuvida uchalasi saqlanadi: **haqiqatda berilgan summa va valyutasi**,
**o'sha paytdagi do'kon kursi**, **qarzdan qancha ayrilgani**. Shunda hisob
har qanday tekshiruvda qayta tiklanadi.

| §    | Talab                                                                                                                      |
| ---- | -------------------------------------------------------------------------------------------------------------------------- |
| 10.1 | To'lov **eng eski to'lanmagan qatordan boshlab avtomatik taqsimlanadi**; ortgani keyingisiga o'tadi                        |
| 10.2 | **Ortiqcha to'lov qabul qilinmaydi:** ogohlantiradi va faqat qarz miqdoricha oladi. "Avans/mijoz balansi" tushunchasi yo'q |
| 10.3 | **Chek rasmi ixtiyoriy** — tasdiqlash uchun shart emas                                                                     |
| 10.4 | **To'lov sanasini 7 kungacha orqaga** qo'yish mumkin; audit'ga yoziladi                                                    |
| 10.5 | Kassaga **haqiqiy pul o'z valyutasida** yoziladi, qarzdan esa shartnoma valyutasida ayriladi                               |
| 10.6 | To'lovni qaytarish teskari kassa yozuvi yaratadi va qarzni tiklaydi                                                        |

## 13. Kassa (pul kirim-chiqimi)

Savdo ma'lumoti va haqiqiy pul — bir xil narsa emas. Nasiyaga sotilgan telefon
aylanmada bor, lekin kassada pul yo'q.

| §           | Talab                                                                                                                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 11.1 · 11.3 | **Alohida hisoblar:** "Naqd UZS", "Naqd USD", "Karta/bank UZS" va h.k. Sabab: karta puli kassa yashigida yo'q — bir joyga qo'shilsa, kun oxirida naqd pulni sanaganda tizim bilan hech qachon to'g'ri kelmaydi |
| 11.2        | Yangi hisob qo'shish mumkin; hisobotda hammasi bazaviy valyutada jamlanadi                                                                                                                                     |
| 11.4        | **Boshlang'ich qoldiq** — har hisob uchun bir marta, alohida yozuv turi. Daromad deb sanalmaydi                                                                                                                |
| 11.5        | Ombor uchun ham shunday: mavjud mahsulotlar qabul qilish orqali kiritiladi                                                                                                                                     |
| 11.6        | **Valyuta ayirboshlash — alohida amal:** qaysi hisobdan qancha chiqdi, qaysi hisobga qancha kirdi, qanday kurs bo'yicha. Daromad emas; kurs farqi hisobotda alohida ko'rinadi                                  |
| 11.7        | **Avtomatik yozuvlar qo'lda tahrirlanmaydi** — tuzatish faqat savdo/to'lovni qaytarish orqali                                                                                                                  |
| 11.8        | **Qo'lda kiritilgan yozuv o'sha kuni ichida tahrirlanadi yoki o'chiriladi** (audit'ga yoziladi); ertasiga faqat teskari yozuv bilan                                                                            |
| 11.9        | Har yozuvda: sana, summa, valyuta, hisob, kirim/chiqim, kategoriya, izoh, ilova (chek surati)                                                                                                                  |
| 11.10       | Kategoriyalar: ijara, kommunal, maosh, reklama, yetkazib berish, boshqa — yangisini qo'shish mumkin                                                                                                            |

## 14. Kalkulator

| §    | Talab                                                                                                                                                                                                |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 12.1 | Rejimlar: **oddiy amallar** va **valyuta aylantirish** (USD ↔ UZS, do'kon kursi avtomatik, qo'lda o'zgartirish mumkin)                                                                               |
| 12.2 | v0.1 dagi "chegirma, ustama va bo'lib to'lash" rejimlari **olib tashlandi** — chegirma maydoni yo'q (7.3), ustama nasiya formasida (9.3), oylik to'lov jadval tuzilganda avtomatik hisoblanadi (9.5) |
| 12.3 | **Serverga so'rov yubormaydi** — butunlay brauzerda. Internet uzilsa ham ishlaydi                                                                                                                    |
| 12.4 | Moliyaviy yozuv yaratmaydi; natijani savdo formasiga o'tkazish mumkin                                                                                                                                |
| 12.5 | Oxirgi 10 ta hisob brauzer xotirasida saqlanadi, serverga yuborilmaydi                                                                                                                               |
| 12.6 | Istalgan ekrandan ochiladigan suzuvchi tugma + savdo formasida narx maydoni yonida                                                                                                                   |

## 15. Hisobotlar

| §     | Talab                                                                                                                  |
| ----- | ---------------------------------------------------------------------------------------------------------------------- |
| 13.1  | **Foyda savdo kunida to'liq tan olinadi** (nasiyada ham) — "bugun qancha ishladim" degan savolga to'g'ri javob beradi  |
| 13.2  | Pul oqimi kassa hisobotida **alohida** ko'rsatiladi — foyda va pul oqimi aralashmaydi                                  |
| 13.3  | **Yalpi foyda** (sotuv − tannarx) va **sof foyda** (yalpi − xarajatlar) yonma-yon                                      |
| 13.5  | **Oldingi davr bilan solishtirish** — har ko'rsatkich yonida `+33%` / `−12%`                                           |
| 13.6  | **Savdo va foyda dinamikasi grafigi**                                                                                  |
| 13.7  | **Mahsulot bo'yicha foyda jadvali** — qaysi model qancha sotildi va qancha foyda keltirdi                              |
| 13.8  | **Qarzdorlar ro'yxati** — kim qancha qarzdor, qachon to'lashi kerak, necha kun kechikkan; muddati o'tganlar tepada     |
| 13.9  | Davrlar: kunlik, haftalik, oylik, yillik, ixtiyoriy oraliq                                                             |
| 13.10 | **Hisobotlar saqlanmaydi — har safar hisoblanadi.** Saqlansa, savdo qaytarilganda eski hisobot noto'g'ri bo'lib qoladi |
| 13.4  | **Eksport (CSV/XLSX) keyingi relizga** — MVP'da hisobotlar faqat ekranda                                               |

## 16. Dashboard

| §    | Talab                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------- |
| 14.1 | **Bitta so'rov** hamma ma'lumotni qaytaradi — telefon internetida tez ochilishi uchun                                           |
| 14.2 | **Faqat bugungi kun.** Kengroq davr uchun hisobotlar sahifasiga o'tiladi                                                        |
| 14.3 | Telefonda birinchi ekranda: **bugungi savdo va foyda** · **bugun/ertaga to'lovi keladiganlar** · **kassadagi pul**              |
| 14.4 | Muddati o'tgan qarzlar, ombor qiymati, kam qolgan mahsulotlar, so'nggi amallar va grafik — pastroqda, lekin dashboard'da qoladi |
| 14.5 | Tepasida **bugungi kurs** (CBU va do'kon) hamda kurs eskirgan bo'lsa ogohlantirish                                              |
| 14.6 | Tezkor amal: **faqat "Yangi savdo"** — barcha sahifalarda pastda suzib turadi                                                   |
| 14.7 | Yangilanish: sahifa ochilganda + pastga tortib qo'lda. Avtomatik yangilanish yo'q — trafik va batareyani tejaydi                |

## 17. Hujjatlar va fayllar

| §    | Talab                                                                                                                                                                |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 15.1 | **Faqat nasiya shartnomasi PDF'i** yaratiladi. v0.1 dagi "qarz jadvali PDF"i olib tashlandi                                                                          |
| 15.2 | **Shartnoma PDF'i saqlanadi** — mijozga berilgan nusxa bilan aynan bir xil qoladi                                                                                    |
| 15.3 | Jadval qayta tuzilsa **yangi versiya saqlanadi, eskisi ham qoladi**                                                                                                  |
| 15.5 | Fayl **hech qachon ochiq havolada bo'lmaydi** — API 15 daqiqalik vaqtinchalik havola beradi                                                                          |
| 15.6 | Fayl turlari: passport rasmi, chek surati, mahsulot rasmi, kassa yozuvi ilovasi                                                                                      |
| 15.7 | Cheklov: **10 MB**, avtomatik siqish **yo'q** — fayl asl sifatida saqlanadi                                                                                          |
| 15.8 | Shartnoma PDF mazmuni: logo va do'kon ma'lumoti, shartnoma raqami va sanasi, mijoz + passport, mahsulot + IMEI, summa/boshlang'ich/qarz, to'liq jadval, imzo joylari |

Printerda chop etish talab qilinmaydi.

## 18. Bildirishnomalar

- Nasiya jadvalidagi to'lov muddatidan **1 kun oldin** admin brauzeriga push yuboriladi.
- Muddat kelgan kuni va muddati o'tganda dashboard ichida ogohlantirish ko'rsatiladi.
- Push uchun admin PWA'ni o'rnatib, bildirishnomaga ruxsat bergan bo'lishi kerak.
- Xabarda mijoz ismi, to'lov summasi va muddat bo'ladi; nozik ma'lumot ortiqcha oshkor qilinmaydi.
- Mijozga ham muddatdan 1 kun oldin **SMS** eslatma yuboriladi. SMS provider productionga chiqishda ulanadi; yuborilganlik va holat qayd etiladi.
- Dam olish kunida eslatma yuborilmaydi (3.7).

## 19. AI tahlil moduli

AI faqat CRM ichidagi ruxsat berilgan, agregatsiyalangan biznes ma'lumotlari
asosida maslahat beradi. U savdo, qarz yoki moliyaviy yozuvlarni o'zi
o'zgartirmaydi.

MVP use-case'lari:

- "Bugun nima bo'ldi?" — kunlik qisqa xulosa;
- tanlangan davr bo'yicha savdo, foyda, qarz va pul oqimi tahlili;
- oldingi davrga nisbatan o'sish/pasayish va asosiy omillar;
- sekin sotilayotgan hamda tez tugayotgan mahsulotlar;
- muddati yaqin yoki o'tgan qarzlar bo'yicha ustuvorlik ro'yxati;
- tabiiy tilda savol-javob: "Bu oy iPhone sotuvim qancha bo'ldi?".

AI javobida hisoblangan raqamlar, davr va qaysi ma'lumotga tayanilgani
ko'rsatiladi. Murakkab bashoratlar tarixiy ma'lumot yetarli to'plangandan
keyin alohida relizda qo'shiladi.

## 20. Dizayn va UX

- Sodda, tez va kam bosqichli interfeys.
- Telefon uchun pastki navigatsiya; noutbukda chap yon menyu.
- Tezkor "Yangi savdo" tugmasi har doim ko'rinadi (14.6).
- Brendga mos, oq-qora asosli dizayn va cheklangan rang palitrasi.
- Rangning o'zi yagona signal emas: qarz, xatolik va muvaffaqiyat matn/ikonka bilan ham belgilanadi.
- Valyuta ko'rsatilishi: UZS minglik ajratgich bilan butun son, USD 2 kasr xona (1.10).

## 21. Ishonchlilik

- Barcha muhim yozuvlarda yaratilgan va yangilangan vaqt saqlanadi.
- Tasdiqlangan savdo va to'lovlar o'chirilmaydi; faqat teskari yozuv bilan tuzatiladi.
- Avtomatik PostgreSQL backup, xatolik loglari va monitoring production bosqichiga kiradi.

## 22. Bosqichma-bosqich yetkazib berish

1. **Poydevor:** monorepo, lint/format/test, lokal PostgreSQL, to'liq schema va migratsiya.
2. **Auth va sozlamalar:** users/role, sessiya, login cheklovi va jurnali, do'kon sozlamalari, valyuta kursi (CBU + do'kon kursi).
3. **Katalog va ombor:** kategoriya/brend, mahsulot, seriyali birlik va partiya, qabul, inventarizatsiya.
4. **Mijoz, savdo, nasiya, to'lov:** tasdiqlash tranzaksiyasi, jadval, to'lov taqsimoti, qaytarish va bekor qilish.
5. **Kassa va hisobotlar:** hisoblar, ayirboshlash, KPI, dashboard, audit.
6. **PWA va bildirishnoma:** offline qobiq, push, SMS test adapteri.
7. **Hujjatlar:** shartnoma PDF, fayl saqlash va vaqtinchalik havolalar.
8. **AI tahlil:** read-only analitika va savol-javob.
9. **Production:** testlar, monitoring, backup/restore sinovi, CI/CD, haqiqiy SMS va SMTP provideri.

## 23. Scope'dan tashqari

- Yetkazib beruvchilar katalogi va ularga bo'lgan qarz.
- Chek yoki shartnomani printerda chop etish.
- Kafil ma'lumoti (6.8).
- Telegram bilan avtomatik integratsiya.
- Mijoz balansi / avans (10.2).
- Nasiya jarimasi (9.9).
- To'lov intizomi reytingi (6.10).
- Hisobot eksporti — keyingi relizga (13.4).

## 24. Ochiq savollar

| Mavzu | Savol                                                                                         |
| ----- | --------------------------------------------------------------------------------------------- |
| SMTP  | Provider tanlash (Gmail app-parol / Resend / Brevo) — parol tiklash shunga bog'liq (2.5)      |
| CBU   | API endpointining aniq manzili va javob formati tekshirilishi kerak (3.3)                     |
| AI    | Provider va model yakuniy tanlovi productiondan oldingi xavfsizlik/xarajat baholashidan keyin |
