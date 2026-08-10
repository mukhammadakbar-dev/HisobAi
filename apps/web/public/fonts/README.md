# Shriftlar

`FRONTEND.md` §15.1 — shriftlar **self-host** qilinadi, Google Fonts'dan
yuklanmaydi. Sabab: do'konda internet uzilib turadi, PWA offline qobig'i
tashqi domendagi faylni ishonchli keshlay olmaydi, va foydalanuvchi IP'si
uchinchi tomon serveriga ketmaydi.

## Kerakli fayllar

| Fayl                | Og'irlik | Qayerda                 |
| ------------------- | -------- | ----------------------- |
| `inter-400.woff2`   | 400      | Interfeys matni         |
| `inter-500.woff2`   | 500      | Ta'kid, tugma           |
| `inter-600.woff2`   | 600      | Sarlavha                |
| `poppins-600.woff2` | 600      | Logotip, yirik sarlavha |

Qamrov: `latin` + `latin-ext` (o'zbek lotin alifbosidagi `ʻ` va `ʼ` uchun).
Boshqa og'irlik yuklanmaydi — §12 dagi 200 KB budjeti.

## Ulash

Fayllar qo'yilgandan keyin `src/app/layout.tsx` da:

```ts
import localFont from 'next/font/local';

const inter = localFont({
  src: [
    { path: '../../public/fonts/inter-400.woff2', weight: '400', style: 'normal' },
    { path: '../../public/fonts/inter-500.woff2', weight: '500', style: 'normal' },
    { path: '../../public/fonts/inter-600.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-sans-loaded',
  display: 'swap',
});
```

So'ng `globals.css` dagi `--font-sans` shu o'zgaruvchiga ishora qiladi.

**Hozircha** fayllar yo'q va zaxira stack ishlaydi
(`ui-sans-serif, system-ui, …`) — ilova to'liq ishlaydi, faqat tipografika
brend shriftida emas.
