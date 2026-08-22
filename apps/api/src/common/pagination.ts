import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, decodeCursor, encodeCursor } from '@hisobai/contracts';
import type { Page } from '@hisobai/contracts';

/**
 * Kursor-asosli pagination yordamchisi (`API.md` §5.1).
 *
 * Saralash ustuni har doim `id` bilan ikkilamchi tartiblanadi: bir xil
 * qiymatli qatorlarda (masalan bir soniyada yaratilgan ikki savdo) tartib
 * beqaror bo'lsa, yozuv ikki marta chiqishi yoki umuman tushib qolishi
 * mumkin.
 */

export interface CursorArgs {
  take: number;
  skip?: number;
  cursor?: { id: string };
}

export function normalizeLimit(raw: unknown): number {
  const value = typeof raw === 'string' ? Number.parseInt(raw, 10) : Number(raw);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_PAGE_LIMIT;
  return Math.min(Math.trunc(value), MAX_PAGE_LIMIT);
}

/**
 * Prisma `findMany` uchun argumentlar. Bitta ortiqcha qator so'raladi —
 * `hasMore` ni qo'shimcha `count` so'rovisiz aniqlash uchun.
 */
export function toPrismaCursor(cursor: string | undefined, limit: number): CursorArgs {
  const decoded = cursor ? decodeCursor(cursor) : null;
  if (!decoded) return { take: limit + 1 };
  return { take: limit + 1, skip: 1, cursor: { id: decoded.id } };
}

/**
 * `findMany` natijasini sahifaga aylantiradi.
 *
 * `sortValue` — kursorga yoziladigan saralash qiymati; keyingi sahifada
 * qaysi nuqtadan davom etishni bildiradi.
 */
export function toPage<T extends { id: string }>(
  rows: T[],
  limit: number,
  sortValue: (row: T) => string,
  totalCount: number,
): Page<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data.at(-1);

  return {
    data,
    hasMore,
    nextCursor: hasMore && last ? encodeCursor({ value: sortValue(last), id: last.id }) : null,
    totalCount,
  };
}
