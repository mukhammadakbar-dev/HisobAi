# Baraka Mobile CRM — Texnik topshiriq (v0.1)

## 1. Maqsad

**HisobAI** uchun naqd va nasiya savdolarini, mahsulot omborini, mijozlarning qarzdorligini, pul harakatini va biznes tahlilini yagona web-ilovada yuritish.

Tizim daftardagi qo'lda hisobni almashtiradi, moliyaviy ma'lumotlar izchilligini saqlaydi va egaga tezkor boshqaruv qarorlarida yordam beradi.

## 2. Foydalanuvchi va foydalanish muhiti

- Bitta rol: **Admin (do'kon egasi)**.
- Yopiq tizim: faqat login/parol bilan kirish.
- Asosiy qurilmalar: telefon va noutbuk brauzeri.
- Responsive PWA: telefon ekranida qulay, noutbukda to'liq ish maydoni.
- Light va dark mode; tanlov saqlanadi va tizim mavzusiga moslasha oladi.
- Brend: **HisobAI**. Berilgan logo login sahifasi, yon menyu va kerakli eksportlarda ishlatiladi.

## 3. MVP funksional modullari

### 3.1 Dashboard

Admin tizimga kirganda quyidagilarni ko'radi:

- bugungi savdo soni va jami aylanma;
- naqd va nasiya savdolari kesimi;
- bugungi pul kirimi va chiqimi;
- bugungi yalpi foyda;
- jami olinadigan qarz, bugun va ertaga to'lovi keladigan qarzlar;
- muddati o'tgan qarzlar;
- ombor qiymati, kam qolgan mahsulotlar va so'nggi amallar;
- davr bo'yicha savdo dinamikasi grafigi.

### 3.2 Mahsulotlar va ombor

Tizim ikki turdagi mahsulotni yuritadi:

1. **Seriyali mahsulot** — telefon, noutbuk va boshqa IMEI/serial raqamli qurilma. Har bir fizik birlik alohida yozuv bo'ladi.
2. **Miqdorli mahsulot** — aksessuarlar. Ular miqdor bo'yicha yuritiladi.

Mahsulot kartasida quyidagilar saqlanadi:

- kategoriya, brend, model, xotira, rang va tavsif;
- IMEI/serial raqam (kerak bo'lsa bir nechta IMEI);
- kelish tannarxi va tavsiya etilgan sotuv narxi;
- ombordagi holati: mavjud, rezerv, sotilgan, qaytarilgan;
- qabul qilingan sana va izoh.

Imkoniyatlar:

- yangi mahsulot qabul qilish;
- IMEI yoki nom bo'yicha tezkor qidirish;
- qoldiq, ombor qiymati va kutilayotgan foydani ko'rish;
- zaxira limiti belgilangan mahsulotlar uchun kam qoldiq ogohlantirishi;
- mahsulot harakati auditi: qabul, sotuv, qaytarish, tahrirlash.

### 3.3 Mijozlar

Mijoz profili:

- F.I.Sh.;
- telefon raqami;
- manzil va izoh (ixtiyoriy);
- joriy qarz va to'lovlar tarixi;
- unga sotilgan mahsulotlar hamda faol nasiya shartnomalari.

Telefon raqami bo'yicha dublikatlar oldi olinadi. Bir mijozda bir nechta nasiya savdosi bo'lishi mumkin.

### 3.4 Savdo

Yangi savdo oqimi:

1. Ombordan mahsulot(lar) tanlanadi.
2. Naqd yoki nasiya savdo turi belgilanadi.
3. Sotuv narxi, chegirma va yakuniy summa kiritiladi.
4. Nasiya tanlanganda mijoz, boshlang'ich to'lov, muddat va to'lov jadvali kiritiladi.
5. Savdo tasdiqlangach, mahsulot ombordan chiqadi, moliyaviy yozuvlar avtomatik yaratiladi.

Qo'llab-quvvatlanadi:

- bitta savdoga bir yoki bir nechta mahsulot qo'shish;
- naqd, ilova/bank transferi va aralash to'lov usullari;
- chegirma;
- savdoni qaytarish yoki bekor qilish — moliya va ombor harakati teskari yozuvlar bilan tiklanadi;
- qaytarib bo'lmaydigan audit tarixi.

Transfer to'lovi uchun admin to'lovni mijoz yuborgan Telegram cheki asosida qo'lda tasdiqlaydi. Tizimda to'lov "kutilmoqda" holatida yaratilishi, chek skrinshotini biriktirish va tasdiqlangach "qabul qilindi" deb o'tkazish mumkin. Telegram bilan avtomatik integratsiya bu MVP scope'iga kirmaydi.

### 3.5 Nasiya va qarzdorlik

Nasiya yozuvi quyidagilarni o'z ichiga oladi:

- savdo summasi, boshlang'ich to'lov va qolgan qarz;
- to'lov jadvalidagi sana va summa;
- har bir qisman to'lov;
- holat: faol, yopilgan, muddati o'tgan, bekor qilingan.

Admin jadvalni ikki usulda tuza oladi: oylik davriylik asosida yoki istalgan sana va istalgan summa bo'yicha qo'lda. Bitta nasiya savdosida bu usullar aralash ham qo'llanishi mumkin.

Tizim qarz qoldig'ini faqat tranzaksiyalardan hisoblaydi; admin qoldiqni qo'lda tahrirlay olmaydi. Bu hisobotlarning ishonchliligini saqlaydi.

### 3.6 Push eslatmalar

- Nasiya jadvalidagi to'lov muddatidan **1 kun oldin** admin brauzeriga push yuboriladi.
- Muddat kelgan kuni va muddati o'tganda dashboard ichida ham ogohlantirish ko'rsatiladi.
- Push uchun admin ilovani/PWA'ni o'rnatib, bildirishnomaga ruxsat bergan bo'lishi kerak.
- Xabarda mijoz ismi, to'lov summasi va muddat bo'ladi; nozik ma'lumot ortiqcha oshkor qilinmaydi.
- Mijozga ham to'lov muddatidan 1 kun oldin **SMS** eslatma yuboriladi. SMS provider productionga chiqish vaqtida ulanadi; tizimda xabar yuborilganligi va holati qayd etiladi.

### 3.7 Pul kirim-chiqimi va kalkulator

Moliyaviy modul kassadagi real pul oqimini savdo ma'lumotidan ajratib boshqaradi.

- Avtomatik kirim: naqd/transfer savdosi va nasiya to'lovlari.
- Qo'lda kiritiladigan chiqimlar: ijara, yetkazib berish, reklama, maosh, kommunal, boshqa.
- Qo'lda kiritiladigan boshqa kirimlar ham bo'ladi.
- Har bir yozuvda sana, summa, to'lov turi, kategoriya, izoh va ilova/foto bo'ladi.
- Hisobotda aylanma, kassaga kirgan pul, kassadan chiqqan pul, sof pul oqimi, tannarx va yalpi foyda alohida ko'rsatiladi.
- Ichki kalkulator: oddiy amallar, chegirma, ustama va bo'lib to'lash hisoblari. U moliyaviy yozuv yaratmaydi; natijani savdo formasiga o'tkazish mumkin.

### 3.8 Hisobotlar

Dashboard hamda alohida hisobot sahifasida kunlik, haftalik, oylik, yillik va ixtiyoriy sana oralig'idagi hisobotlar:

- umumiy savdo aylanmasi;
- naqd/nasiya/aralash savdolar;
- real pul kirimi va chiqimi;
- yalpi foyda va mahsulot bo'yicha foyda;
- nasiya qarzlari: faol, muddatli, muddati o'tgan va undirilgan;
- ombor qoldig'i va qiymati;
- eng ko'p sotilgan brend, model va kategoriya;
- savdolar, qarzdorlar va tranzaksiyalarni jadval ko'rinishida eksport qilish (CSV/XLSX — keyingi kichik reliz).
- nasiya savdosi yoki qarz jadvali bo'yicha PDF hujjatini yaratish va saqlash. Printer orqali chiqarish talab qilinmaydi.

## 4. AI tahlil moduli

AI faqat CRM ichidagi ruxsat berilgan, agregatsiyalangan biznes ma'lumotlari asosida maslahat beradi. U savdo, qarz yoki moliyaviy yozuvlarni o'zi o'zgartirmaydi.

MVP use-case'lari:

- "Bugun nima bo'ldi?" — kunlik qisqa xulosa;
- tanlangan davr bo'yicha savdo, foyda, qarz va pul oqimi tahlili;
- oldingi davrga nisbatan o'sish/pasayish va asosiy omillar;
- sekin sotilayotgan hamda tez tugayotgan mahsulotlar;
- muddati yaqin yoki o'tgan qarzlar bo'yicha ustuvorlik ro'yxati;
- tabiiy tilda savol-javob, masalan: "Bu oy iPhone sotuvim qancha bo'ldi?".

AI javobida hisoblangan raqamlar, davr va qaysi ma'lumotga tayanilgani ko'rsatiladi. Murakkab bashoratlar tarixiy ma'lumot yetarli to'plangandan keyin alohida relizda qo'shiladi.

## 5. Dizayn va UX talablari

- Sodda, tez va kam bosqichli interfeys.
- Telefon uchun pastki navigatsiya; noutbukda chap yon menyu.
- Tezkor "Yangi savdo" tugmasi har doim ko'rinadigan bo'ladi.
- Brendga mos, oq-qora asosli dizayn hamda logo aksentidan foydalangan cheklangan rang palitrasi.
- Rangning o'zi yagona signal emas: qarz, xatolik va muvaffaqiyat matn/ikonka bilan ham belgilanadi.
- O'zbekcha interfeys, valyuta: UZS va minglik ajratgichlari.

## 6. Ishonchlilik va xavfsizlik

- Administrator paroli hash ko'rinishida saqlanadi; xavfsiz sessiya/cookie ishlatiladi.
- Login urinishlari cheklanadi.
- Barcha muhim yozuvlarda yaratilgan va yangilangan vaqt saqlanadi.
- Tasdiqlangan savdo va to'lovlar o'chirilmaydi; faqat teskari yozuv (bekor qilish/qaytarish) bilan tuzatiladi.
- Avtomatik PostgreSQL backup, xatolik loglari va monitoring production bosqichiga kiradi.

## 7. Texnik arxitektura

| Qism | Standart |
| --- | --- |
| Frontend | React, Next.js, TypeScript, responsive PWA |
| Backend | Node.js LTS, NestJS, TypeScript |
| Ma'lumotlar bazasi | PostgreSQL |
| API | REST API, OpenAPI/Swagger hujjatlari |
| Background jobs | NestJS queue/cron: qarz tekshiruvi, push, hisobot hisoblari |
| Push | Web Push + service worker, subscription'lar PostgreSQL'da |
| Mijoz xabarlari | SMS provider uchun alohida notification adapter; provider productionda ulanadi |
| AI | Alohida NestJS service orqali, faqat read-only tahliliy so'rovlar |
| Joylashtirish | Docker, HTTPS, environment variables, avtomatik backup |

Tavsiya etilgan backend modullari: Auth, Users, Products, Inventory, Customers, Sales, Installments, Payments, Cashbook, Reports, Notifications, AI Insights va Audit.

## 8. Bosqichma-bosqich yetkazib berish

1. **Asosiy CRM:** login, mahsulot/ombor, mijoz, naqd/nasiya savdo, qarz to'lovlari, dashboard va bazaviy hisobotlar.
2. **Moliyaviy nazorat:** pul kirim-chiqimi, transfer cheklarini biriktirish/tasdiqlash, qaytarish/bekor qilish, kalkulator, PDF va to'liq audit.
3. **PWA va notification:** offline-friendly qobiq, push subscription, admin hamda mijozga muddat eslatmalari.
4. **AI tahlil:** xavfsiz read-only analitika, biznes xulosalari va savol-javob.
5. **Production tayyorgarligi:** testlar, monitoring, backup/restore sinovi, CI/CD va deploy.

## 9. Hozirgi scope'dan tashqari

- Yetkazib beruvchilar katalogi va ularga bo'lgan qarzni yuritish.
- Chek yoki shartnomani printerda chop etish.

## 10. Tashqi integratsiyalar bo'yicha izoh

- SMS yuborish uchun provider keyinroq ulanadi. Development va test muhitida `SmsProvider` test adapteri faqat log yozadi; productionda esa mos provider adapteri environment variable orqali tanlanadi.
