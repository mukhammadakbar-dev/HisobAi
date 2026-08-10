# HisobAI — Dizayn tizimi

Telefon do'konlari uchun CRM. Interfeys kuniga 8 soat, ko'pincha kassa yonida, tez-tez kichik ekranda ishlatiladi. Shuning uchun asosiy tamoyil: **raqam ko'rinishi bezakdan muhimroq**. Rang faqat ma'no tashiganda ishlatiladi (status, ogohlantirish, harakat), dekoratsiya uchun emas.

---

## 1. Brend fayllari

| Fayl               | Qayerda ishlatiladi                                   |
| ------------------ | ----------------------------------------------------- |
| `hisobai-logo.svg` | Header, login sahifa, hisobot PDF sarlavhasi, cheklar |
| `icon.svg`         | PWA/app icon, Telegram bot avatar, to'q fonli joylar  |
| `icon-light.svg`   | Oq/och fonli joylar, hujjat burchagi                  |
| `favicon.svg`      | Brauzer tabi (16–32px uchun optimallashtirilgan)      |

Logotip: **Poppins SemiBold**, harflari konturga aylantirilgan (shrift talab qilmaydi).
Ikonka: `H` monogrammasi — o'rta chizig'i ko'k, "hisob balansi" chizig'iga ishora qiladi.

**Qoidalar**

- Logotip atrofida bo'sh joy ≥ `H` harfi balandligining yarmi.
- Logotipni cho'zmang, soya/gradient qo'shmang, ranglarini almashtirmang.
- To'q fonda logotip butunlay oq (`#FFFFFF`) bo'ladi, "AI" qismi `#4A6FD0` ga o'tadi.
- Minimal o'lcham: logotip 96px kenglik, ikonka 16px.

---

## 2. Ranglar

### Brend

| Token          | HEX       | Vazifasi                                        |
| -------------- | --------- | ----------------------------------------------- |
| `ink`          | `#020D1F` | Asosiy matn, to'q fon, logotip                  |
| `brand`        | `#052572` | Brend ko'ki — logotip "AI", sarlavha aksentlari |
| `brand-action` | `#274FB5` | Tugma, link, faol holat (WCAG AA oq matn bilan) |
| `brand-soft`   | `#EEF2FB` | Tanlangan qator, badge foni                     |

`#052572` matn foni sifatida yaxshi, lekin tugma uchun qorong'i — bosiladigan elementlarda **`brand-action`** ishlatiladi.

### Ko'k shkala

```
50 #EEF2FB   100 #D8E1F6   200 #B0C2ED   300 #7E9AE0   400 #4A6FD0
500 #274FB5  600 #103A94   700 #052572   800 #041C57   900 #02133B
```

### Neytral shkala

```
0  #FFFFFF   50 #F7F8FA   100 #EEF0F4   200 #DDE1E8   300 #C2C8D3
400 #98A0AF  500 #6B7484  600 #4A5261   700 #2E3542   800 #171D28   900 #020D1F
```

- Sahifa foni `50`, karta foni `0`, chegara `200`, ikkilamchi matn `500`, asosiy matn `900`.

### Semantik va status ranglari

| Holat     | Rang                      | CRM'dagi ma'nosi                                  |
| --------- | ------------------------- | ------------------------------------------------- |
| `success` | `#17835A` / fon `#E7F5EF` | Sotildi, to'lov qabul qilindi                     |
| `warning` | `#B7791F` / fon `#FDF3E2` | Nasiya muddati yaqinlashdi, ombor tugayapti       |
| `danger`  | `#C02B2B` / fon `#FBEAEA` | Muddati o'tgan qarz, qaytarilgan tovar, o'chirish |
| `info`    | `#274FB5` / fon `#EEF2FB` | Bron, kutilmoqda, tizim xabari                    |
| `muted`   | `#6B7484` / fon `#EEF0F4` | Arxiv, faol bo'lmagan do'kon/tarif                |

Bitta ekranda 3 tadan ortiq status rangi bir vaqtda ko'rinmasin — aks holda hech biri ko'zga tashlanmaydi.

---

## 3. CSS o'zgaruvchilar (Tailwind v4)

```css
/* app/globals.css */
@import 'tailwindcss';

@theme {
  --color-ink: #020d1f;
  --color-brand: #052572;
  --color-brand-action: #274fb5;
  --color-brand-soft: #eef2fb;

  --color-blue-50: #eef2fb;
  --color-blue-100: #d8e1f6;
  --color-blue-200: #b0c2ed;
  --color-blue-300: #7e9ae0;
  --color-blue-400: #4a6fd0;
  --color-blue-500: #274fb5;
  --color-blue-600: #103a94;
  --color-blue-700: #052572;
  --color-blue-800: #041c57;
  --color-blue-900: #02133b;

  --color-neutral-50: #f7f8fa;
  --color-neutral-100: #eef0f4;
  --color-neutral-200: #dde1e8;
  --color-neutral-300: #c2c8d3;
  --color-neutral-400: #98a0af;
  --color-neutral-500: #6b7484;
  --color-neutral-600: #4a5261;
  --color-neutral-700: #2e3542;
  --color-neutral-800: #171d28;
  --color-neutral-900: #020d1f;

  --color-success: #17835a;
  --color-warning: #b7791f;
  --color-danger: #c02b2b;
  --color-info: #274fb5;

  --font-display: 'Poppins', ui-sans-serif, system-ui;
  --font-sans: 'Inter', ui-sans-serif, system-ui;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-xl: 20px;
}
```

Ishlatilishi: `bg-brand-action`, `text-neutral-500`, `border-neutral-200`, `rounded-lg`.

---

## 4. Tipografika

| Rol               | Shrift                                       | Izoh                                                           |
| ----------------- | -------------------------------------------- | -------------------------------------------------------------- |
| Logotip / display | **Poppins SemiBold (600)**                   | Faqat logotip va yirik sarlavhalar. Uzun matnda ishlatilmaydi  |
| Interfeys matni   | **Inter** (400 / 500 / 600)                  | Barcha UI matni, jadval, forma                                 |
| Raqamlar          | Inter + `font-variant-numeric: tabular-nums` | Narx, qoldiq, IMEI — ustunlarda tik turishi uchun **majburiy** |

```css
.money,
table td,
.stat {
  font-variant-numeric: tabular-nums;
}
```

**O'lchamlar (px):** 12 (yordamchi) · 14 (asosiy UI) · 16 (forma inputi — mobilda zoom bo'lmasligi uchun minimum) · 20 · 24 · 32 (sahifa sarlavhasi)
**Qator balandligi:** matn 1.5, sarlavha 1.2.

Pul summasi har doim bir formatda: `1 250 000 so'm` (probel bilan ajratiladi, tiyin ko'rsatilmaydi).

---

## 5. Interval, burchak, soya

- **Interval:** 4px shkalasi — 4 / 8 / 12 / 16 / 24 / 32 / 48. Oraliq qiymat ishlatilmaydi.
- **Burchak:** input va tugma `10px`, karta va modal `14px`, badge `6px`, avatar to'liq dumaloq.
- **Soya:** faqat suzuvchi elementlarda (dropdown, modal, toast).
  ```css
  --shadow-card: 0 1px 2px rgba(2, 13, 31, 0.06);
  --shadow-pop: 0 8px 24px rgba(2, 13, 31, 0.12);
  ```
  Oddiy kartalarda soya emas, `border: 1px solid #DDE1E8` ishlatiladi.

---

## 6. Komponent qoidalari

- **Tugmalar:** asosiy — `bg-brand-action` + oq matn; ikkilamchi — oq fon + `neutral-300` chegara; xavfli — `danger`. Bir ekranda faqat **bitta** asosiy tugma.
- **Bosish maydoni:** minimum 44×44px (do'konda telefon bilan ishlanadi).
- **Fokus:** `outline: 2px solid #274FB5; outline-offset: 2px` — hech qachon o'chirilmaydi.
- **Jadval:** sarlavha qatori `neutral-50`, chegaralar `neutral-200`, summalar o'ngga tekislanadi.
- **Bo'sh holat:** "Ma'lumot yo'q" emas — nima qilish kerakligi yoziladi: "Hali sotuv yo'q. Birinchi sotuvni qo'shing."
- **Xatolik:** nima bo'lgani va nima qilish kerakligi aytiladi, uzr so'ralmaydi: "Telefon raqami band. Boshqa raqam kiriting."

---

## 7. Matn uslubi

- Faqat o'zbek tili, lotin alifbosi, gap boshi harfi (`Sotuvni saqlash`, `SOTUVNI SAQLASH` emas).
- Tugma nomi bajariladigan ishni aytadi: `Saqlash` emas — `Sotuvni saqlash`.
- Bir tushuncha — bir nom: `mijoz` hamma joyda mijoz, `klient` emas. Xuddi shunday: `qarz`, `nasiya`, `qoldiq`, `tarif`.
- Texnik atamalar foydalanuvchiga ko'rinmaydi: `xatolik 500` emas — `Server javob bermadi. Qayta urinib ko'ring.`
