/**
 * PDF shrifti (`docs/files/design.md` §4 — matn `Inter`).
 *
 * `Inter` repoda embed qilinadigan `.ttf`/`.otf` fayl sifatida yo'q — faqat
 * veb shrift (`--font-sans`). PDF'ga embed qilish uchun haqiqiy shrift
 * fayli kerak, shuning uchun ochiq litsenziyali **DejaVu Sans** olindi
 * (`dejavu-fonts-ttf`, Bitstream Vera litsenziyasi): u o'zbek lotin
 * apostroflarini (`ʻ` U+02BB, `ʼ` U+02BC — "o‘", "g‘", "‘", "’") to'liq
 * qamrab oladi, tekshirilgan `fontkit.hasGlyphForCodePoint`. `Inter`
 * o'zi ham shu belgilarni chizadi, lekin fayl yo'qligi PDF generatsiyasini
 * to'xtatib qo'ymasligi kerak (§15.8 — MUST HAVE).
 */

// `dejavu-fonts-ttf` paketida `exports` maydoni yo'q — subpath to'g'ridan-to'g'ri
// paket ichidagi haqiqiy faylga ishora qiladi (§ shrift, yuqoridagi izoh).
export const FONT_REGULAR = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans.ttf');
export const FONT_BOLD = require.resolve('dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf');
