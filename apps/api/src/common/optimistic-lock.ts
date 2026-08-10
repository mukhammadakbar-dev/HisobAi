import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@hisobai/contracts';
import type { Request } from 'express';

import { AppException } from './app.exception';

/**
 * Optimistik qulf (`API.md` §8).
 *
 * Bir vaqtda ikki qurilmadan tahrirlanadigan resurslarda (`PATCH /settings`,
 * `PATCH /sales/:id`, `PATCH /customers/:id`) client o'zi ko'rgan holat
 * vaqtini yuboradi. Server uni yozuvning hozirgi `updatedAt` qiymati bilan
 * solishtiradi — mos kelmasa `409 STALE_RESOURCE`.
 *
 * **Nega majburiy.** Ixtiyoriy qulf — qulf emas: uni yubormagan client
 * himoyasiz qoladi va buni hech kim sezmaydi. `Idempotency-Key` (§17.6)
 * ayni shu sababdan majburiy qilingan — bu yerda ham xuddi shu naqsh.
 * Token yo'q bo'lsa `428 PRECONDITION_REQUIRED` qaytadi: bu ishlab
 * chiquvchi xatosi, u birinchi so'rovdayoq ko'rinishi kerak.
 *
 * **Nega faqat tekshirish yetarli emas.** `SELECT` keyin `UPDATE` —
 * TOCTOU poygasi: `READ COMMITTED` da ikkala tranzaksiya ham "mos keladi"
 * deb ko'radi. Shuning uchun `updatedAt` `UPDATE` ning `WHERE` shartiga
 * qo'yiladi (§17.5 dagi ombor poygasi bilan bir xil mexanizm) — buning
 * uchun `Precondition.updatedAt` Prisma filtri sifatida tayyor turadi.
 */

/**
 * HTTP-date sekundgacha aniq (RFC 9110), `updatedAt` esa `timestamptz(3)` —
 * millisekundgacha. Sarlavha orqali kelgan qiymatga shu farq qo'shiladi,
 * aks holda 14:30:00.123 da yozilgan yozuv 14:30:00 tokeni bilan **har doim**
 * eskirgan ko'rinardi va sarlavha varianti umuman ishlamasdi.
 */
const HTTP_DATE_TOLERANCE_MS = 999;

const IF_UNMODIFIED_SINCE = 'if-unmodified-since';

export interface Precondition {
  /** Client ko'rgan holat vaqti. */
  readonly expected: Date;
  /** Qaysi manbadan olingani — solishtirish qat'iyligi shunga bog'liq. */
  readonly source: 'body' | 'header';
  /**
   * Prisma `where` uchun tayyor filtr: shartli `UPDATE` ichida
   * ishlatiladi va poygani atomik hal qiladi.
   */
  readonly updatedAt: Date | { lte: Date };
}

/**
 * So'rovdan qulf tokenini o'qiydi.
 *
 * Ikki manba (`API.md` §8): body ichidagi `expectedUpdatedAt` yoki
 * `If-Unmodified-Since` sarlavhasi. Ikkalasi ham bo'lsa **body ustun
 * turadi** — u millisekundgacha aniq va solishtiruvi qat'iyroq.
 */
export function readPrecondition(
  request: Request,
  expectedUpdatedAt: string | undefined,
): Precondition {
  if (expectedUpdatedAt !== undefined) {
    // Sxema formatni allaqachon tekshirgan; bu — kontrollerda sxema
    // ulanishi unutilgan holat uchun oxirgi qatlam.
    const expected = parseOrThrow(expectedUpdatedAt, 'expectedUpdatedAt');
    return { expected, source: 'body', updatedAt: expected };
  }

  const header = request.headers[IF_UNMODIFIED_SINCE];
  if (typeof header === 'string' && header.trim() !== '') {
    const expected = parseOrThrow(header, 'If-Unmodified-Since');
    return {
      expected,
      source: 'header',
      updatedAt: { lte: new Date(expected.getTime() + HTTP_DATE_TOLERANCE_MS) },
    };
  }

  throw new AppException(
    ErrorCode.PRECONDITION_REQUIRED,
    "Yozuvni o'zgartirish uchun sahifani yangilang.",
    HttpStatus.PRECONDITION_REQUIRED,
    'expectedUpdatedAt',
  );
}

/**
 * Shartli `UPDATE` yozib bo'lmaydigan joylar uchun tekshiruv
 * (masalan bir nechta jadval birgalikda o'zgaradigan amallar).
 *
 * Tranzaksiya **ichida**, o'zgarishdan oldin chaqirilsin: tashqarida
 * chaqirilsa tekshiruv bilan yozuv orasida boshqa tranzaksiya sig'adi.
 */
export function assertFresh(current: Date, precondition: Precondition): void {
  if (!matches(current, precondition)) {
    throw staleResource(current, precondition.expected);
  }
}

/** `updatedAt` filtri mos kelmagan shartli `UPDATE` shu xatoga aylanadi. */
export function staleResource(current: Date, expected: Date): AppException {
  return AppException.conflict(
    ErrorCode.STALE_RESOURCE,
    "Bu yozuv boshqa joyda o'zgartirildi. Sahifani yangilab, qaytadan urinib ko'ring.",
    {
      expectedUpdatedAt: expected.toISOString(),
      actualUpdatedAt: current.toISOString(),
    },
  );
}

/** `Precondition.updatedAt` filtri bilan bir xil mantiq — ikkisi ajralmasin. */
function matches(current: Date, precondition: Precondition): boolean {
  return precondition.source === 'body'
    ? current.getTime() === precondition.expected.getTime()
    : current.getTime() <= precondition.expected.getTime() + HTTP_DATE_TOLERANCE_MS;
}

function parseOrThrow(value: string, field: string): Date {
  const parsed = new Date(value.trim());
  if (Number.isNaN(parsed.getTime())) {
    throw AppException.badRequest(
      ErrorCode.VALIDATION_FAILED,
      "Yozuv vaqti noto'g'ri ko'rsatilgan. Sahifani yangilang.",
      field,
    );
  }
  return parsed;
}
