import { Prisma } from '@prisma/client';

/**
 * Prisma xatolarini taniydigan yordamchilar.
 *
 * **Nega kerak.** `AllExceptionsFilter` Prisma xatolarini xaritalamaydi
 * va xaritalamasligi ham to'g'ri: `P2002` qaysi biznes qoidasi buzilganini
 * bilmaydi — u faqat "qandaydir unique indeks" deydi. Bir xil kod
 * kategoriya nomida `CATALOG_DUPLICATE_NAME`, IMEI'da esa
 * `INVENTORY_DUPLICATE_IMEI` degani. Ma'noni faqat chaqiruv joyi biladi.
 *
 * Shuning uchun har yozuv o'z xatosini o'zi ushlaydi. Ushlanmagani
 * `500 INTERNAL_ERROR` bo'lib chiqadi — bu foydalanuvchi uchun yolg'on:
 * server sog'lom, shunchaki ma'lumot qoidaga zid.
 */

/** `P2002` — unique cheklov buzildi (indeks yoki `RAISE ... ERRCODE '23505'`). */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

/**
 * `P2003` — tashqi kalit topilmadi.
 *
 * Katalogda odatiy hol: mavjud bo'lmagan `categoryId` yoki `brandId`
 * bilan mahsulot yaratish.
 */
export function isForeignKeyViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';
}

/** `P2025` — `WHERE` shartiga mos qator topilmadi (optimistik qulfda ham). */
export function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

/**
 * Buzilgan cheklov nomi yoki maydonlari.
 *
 * **Ishonchsiz** va shunday bo'lishi kutiladi: oddiy indeks buzilganda
 * Prisma `meta.target` ni to'ldiradi, `RAISE ... ERRCODE '23505'` dan
 * kelgan xatoda esa cheklov nomi umuman yo'q (`RAISE` da u yo'q).
 * Shuning uchun qaytgan qiymatga **qaror bog'lash mumkin emas** — u
 * faqat log va tashxis uchun.
 */
export function violatedTarget(error: unknown): string | null {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return null;

  const target = error.meta?.target;
  if (typeof target === 'string') return target;
  if (Array.isArray(target)) return target.join(', ');
  return null;
}
