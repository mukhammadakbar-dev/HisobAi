import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, decodeCursor } from '@hisobai/contracts';
import { describe, expect, it } from 'vitest';

import { normalizeLimit, toPage, toPrismaCursor } from './pagination';

interface Row {
  id: string;
  soldAt: string;
}

const rows = (count: number): Row[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `id-${String(index)}`,
    soldAt: `2026-08-${String(index + 1).padStart(2, '0')}`,
  }));

describe('normalizeLimit', () => {
  it('standart qiymat', () => {
    expect(normalizeLimit(undefined)).toBe(DEFAULT_PAGE_LIMIT);
    expect(normalizeLimit('')).toBe(DEFAULT_PAGE_LIMIT);
    expect(normalizeLimit('abc')).toBe(DEFAULT_PAGE_LIMIT);
    expect(normalizeLimit(0)).toBe(DEFAULT_PAGE_LIMIT);
    expect(normalizeLimit(-5)).toBe(DEFAULT_PAGE_LIMIT);
  });

  it('maksimumdan oshmaydi — DoS himoyasi', () => {
    expect(normalizeLimit(10_000)).toBe(MAX_PAGE_LIMIT);
    expect(normalizeLimit('25')).toBe(25);
  });
});

describe('toPage', () => {
  it("limitdan ortiq qator bo'lsa hasMore va kursor beradi", () => {
    const page = toPage(rows(11), 10, (row) => row.soldAt, 11);

    expect(page.data).toHaveLength(10);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).not.toBeNull();
    expect(page.totalCount).toBe(11);

    const decoded = decodeCursor(page.nextCursor as string);
    // Kursor OXIRGI qaytarilgan qatorni ko'rsatadi, 11-chisini emas
    expect(decoded).toEqual({ value: '2026-08-10', id: 'id-9' });
  });

  it('oxirgi sahifada kursor null', () => {
    const page = toPage(rows(4), 10, (row) => row.soldAt, 4);
    expect(page.data).toHaveLength(4);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
    expect(page.totalCount).toBe(4);
  });

  it("bo'sh ro'yxat", () => {
    const page = toPage([], 10, (row: Row) => row.soldAt, 0);
    expect(page).toEqual({ data: [], hasMore: false, nextCursor: null, totalCount: 0 });
  });
});

describe('toPrismaCursor', () => {
  it("kursorsiz — birinchi sahifa, bitta ortiqcha qator so'raladi", () => {
    expect(toPrismaCursor(undefined, 50)).toEqual({ take: 51 });
  });

  it("kursor bilan — o'zini o'tkazib yuboradi", () => {
    const cursor = toPage(rows(11), 10, (row) => row.soldAt, 11).nextCursor as string;
    expect(toPrismaCursor(cursor, 10)).toEqual({
      take: 11,
      skip: 1,
      cursor: { id: 'id-9' },
    });
  });

  it('buzuq kursor birinchi sahifaga tushadi, yiqilmaydi', () => {
    expect(toPrismaCursor('!!!buzuq!!!', 50)).toEqual({ take: 51 });
  });
});
