import * as argon2 from 'argon2';

/**
 * Parol hash'lash (§2.4 — Argon2id).
 *
 * Argon2id tanlangan, chunki u ham GPU (Argon2d), ham yon-kanal
 * (Argon2i) hujumiga qarshi turadi. Parametrlar `argon2` paketining
 * standart qiymatlari — ular OWASP tavsiyalariga mos.
 */
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

/**
 * Parolni tekshiradi. Hash buzuq bo'lsa ham **xato tashlamaydi** —
 * `false` qaytaradi: aks holda bitta buzuq yozuv 500 xato berib,
 * mavjud foydalanuvchini oshkor qilardi.
 */
export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/**
 * Foydalanuvchi topilmaganda ham parolni "tekshirish" uchun soxta hash.
 *
 * Usiz mavjud bo'lmagan email darhol javob olardi, mavjudi esa Argon2
 * hisobidan keyin — javob vaqtining farqi bo'yicha email ro'yxatini
 * tuzib olish mumkin edi (foydalanuvchi sanash hujumi).
 */
export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=65536,t=3,p=4$c29tZS1zdGF0aWMtc2FsdA$8sQeCJ0nXKm0zvyoP9CumR3D9L4qYaL3UGWKQyJPqBk';
