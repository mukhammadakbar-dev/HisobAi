/**
 * Kursor-asosli pagination (`API.md` §5.1).
 *
 * Offset ishlatilmaydi: moliyaviy ro'yxatlar doimo o'sib turadi va
 * `?page=2` yuklanguncha yangi savdo qo'shilsa, foydalanuvchi bitta
 * yozuvni ikki marta ko'radi yoki umuman ko'rmaydi.
 */

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 200;

export interface PageQuery {
  /** Oldingi javobdagi `nextCursor`. */
  cursor?: string;
  limit?: number;
}

export interface Page<T> {
  data: T[];
  /** `null` bo'lsa — ro'yxat tugadi. */
  nextCursor: string | null;
  hasMore: boolean;
  /** Filtr bo'yicha to'liq natija soni — joriy sahifadagi emas. */
  totalCount: number;
}

/**
 * Kursor ichidagi ma'lumot. Saralash ustuni har doim `id` bilan ikkilamchi
 * tartiblanadi — aks holda bir xil qiymatli qatorlarda tartib beqaror
 * bo'lib, yozuv ikki marta chiqishi mumkin.
 */
export interface CursorPayload {
  /** Saralash ustunining qiymati (ISO sana yoki satr). */
  value: string;
  id: string;
}

/**
 * Base64url — sof TypeScript'da.
 *
 * `btoa`/`atob` ham, `Buffer` ham ishlatilmaydi: bu paketni ham Node
 * (api), ham brauzer (web) import qiladi va ikkalasida bir xil ishlashi
 * kerak. Qo'shimcha `lib: DOM` yoki `@types/node` ham talab qilinmaydi.
 */
const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function bytesToBase64Url(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    const triple = (b0 << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0);

    out += B64_ALPHABET[(triple >> 18) & 63];
    out += B64_ALPHABET[(triple >> 12) & 63];
    if (b1 !== undefined) out += B64_ALPHABET[(triple >> 6) & 63];
    if (b2 !== undefined) out += B64_ALPHABET[triple & 63];
  }
  return out;
}

function base64UrlToBytes(text: string): number[] | null {
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const char of text) {
    const index = B64_ALPHABET.indexOf(char);
    if (index === -1) return null;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return bytes;
}

/** UTF-8 kodlash — kursorda kirill yoki o'zbekcha harf bo'lishi mumkin. */
function utf8Encode(text: string): number[] {
  const bytes: number[] = [];
  // `for…of` to'liq kod nuqtalarini beradi (surrogat juftliklar birlashgan)
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

function utf8Decode(bytes: number[]): string {
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i++] ?? 0;
    if (b0 < 0x80) {
      out += String.fromCodePoint(b0);
    } else if (b0 < 0xe0) {
      out += String.fromCodePoint(((b0 & 0x1f) << 6) | ((bytes[i++] ?? 0) & 0x3f));
    } else if (b0 < 0xf0) {
      out += String.fromCodePoint(
        ((b0 & 0x0f) << 12) | (((bytes[i++] ?? 0) & 0x3f) << 6) | ((bytes[i++] ?? 0) & 0x3f),
      );
    } else {
      out += String.fromCodePoint(
        ((b0 & 0x07) << 18) |
          (((bytes[i++] ?? 0) & 0x3f) << 12) |
          (((bytes[i++] ?? 0) & 0x3f) << 6) |
          ((bytes[i++] ?? 0) & 0x3f),
      );
    }
  }
  return out;
}

export function encodeCursor(payload: CursorPayload): string {
  return bytesToBase64Url(utf8Encode(JSON.stringify(payload)));
}

export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const bytes = base64UrlToBytes(cursor);
    if (!bytes) return null;
    const parsed: unknown = JSON.parse(utf8Decode(bytes));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as CursorPayload).value === 'string' &&
      typeof (parsed as CursorPayload).id === 'string'
    ) {
      return parsed as CursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}
