/**
 * Matn qidiruvi uchun kirishni tayyorlash (`API.md` §5.2).
 *
 * Prisma `contains` qiymatni parametr sifatida bog'laydi (ya'ni SQL
 * in'ektsiya yo'q), lekin uni `LIKE '%' || $1 || '%'` ichiga qo'yadi —
 * qiymatdagi `%` va `_` **joker belgi bo'lib qolaveradi**. Natijada
 * qidiruv o'zining teskarisiga aylanadi: `_` bitta belgili hamma narsaga,
 * `%` esa umuman hammasiga mos keladi. Ega buni "qidiruv ishlamayapti"
 * deb ham o'ylamaydi — ro'yxat to'la ko'rinadi.
 *
 * PostgreSQL'da `LIKE`/`ILIKE` ning standart qochish belgisi — teskari
 * chiziq, shuning uchun `ESCAPE` bandi va xom SQL kerak emas. Teskari
 * chiziqning o'zi ham qochiriladi, aks holda `\` bilan tugagan qidiruv
 * keyingi belgini yutib yuborardi.
 */
const LIKE_SPECIAL = /[\\%_]/gu;

export function escapeLike(value: string): string {
  return value.replace(LIKE_SPECIAL, (char) => `\\${char}`);
}

/** `contains` filtri — registrga sezgir emas va joker belgilarsiz. */
export function containsInsensitive(value: string): { contains: string; mode: 'insensitive' } {
  return { contains: escapeLike(value), mode: 'insensitive' };
}
