import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

import type { CookieOptions } from 'express';

/**
 * Sessiya tokeni (§2.7, §2.8).
 *
 * Token bazada **ochiq saqlanmaydi** — faqat SHA-256 hash'i. Sabab: baza
 * nusxasi sizib chiqsa, undagi qiymatlar bilan hech kim tizimga kira
 * olmasligi kerak. Parol uchun Argon2id kerak (u sekin bo'lishi shart),
 * token uchun esa SHA-256 yetarli: token 256 bitlik tasodifiy qiymat,
 * uni lug'at bo'yicha tanlab bo'lmaydi.
 */

/** 32 bayt = 256 bit entropiya. */
const TOKEN_BYTES = 32;

export function createSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** CSRF tokeni — `HttpOnly` emas, client o'qiy olishi kerak (`API.md` §1). */
export function createCsrfToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/**
 * Doimiy vaqtli solishtirish — token va parol tiklash havolasi uchun.
 *
 * `===` bilan solishtirish birinchi farq qilgan baytda to'xtaydi va
 * javob vaqti orqali to'g'ri prefiksni bit-bit tanlash imkonini beradi.
 */
export function safeEquals(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Cookie sozlamalari (§2.8, `API.md` §1).
 *
 * `secure` faqat productionda: development'da ilova `http://localhost` da
 * ishlaydi va `Secure` cookie umuman o'rnatilmay qolardi — ya'ni lokal
 * muhitda kirish ishlamas edi. Bu qoidani bo'shatish emas, muhitga
 * moslash: productionda HTTPS majburiy (`ARCHITECTURE.md` §12).
 */
export function sessionCookieOptions(isProduction: boolean, maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
    maxAge: maxAgeMs,
  };
}

export function csrfCookieOptions(isProduction: boolean, maxAgeMs: number): CookieOptions {
  return {
    // Client JavaScript o'qiydi va `X-CSRF-Token` sarlavhasida qaytaradi
    httpOnly: false,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/',
    maxAge: maxAgeMs,
  };
}
