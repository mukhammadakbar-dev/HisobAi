import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import { serializeDecimals } from './decimal-serializer.interceptor';

/**
 * ARCHITECTURE §4 — pul JSON'da hech qachon `number` bo'lmaydi.
 * Bu test aynan shu kafolatni ushlab turadi.
 */
describe('serializeDecimals', () => {
  it("Decimal ni satrga aylantiradi, aniqlikni yo'qotmaydi", () => {
    const value = new Prisma.Decimal('12500000.00');
    expect(serializeDecimals(value)).toBe('12500000');
    expect(typeof serializeDecimals(value)).toBe('string');
  });

  it("juda katta summada ham float'ga tushmaydi", () => {
    const value = new Prisma.Decimal('9007199254740993.45');
    expect(serializeDecimals(value)).toBe('9007199254740993.45');
  });

  it('ichma-ich obyekt va massivlarni qamraydi', () => {
    const input = {
      total: new Prisma.Decimal('1500.50'),
      currency: 'USD',
      items: [
        { unitPrice: new Prisma.Decimal('750.25'), quantity: 2 },
        { unitPrice: new Prisma.Decimal('0.01'), quantity: 1 },
      ],
      nested: { rate: new Prisma.Decimal('12650.5000') },
    };

    expect(serializeDecimals(input)).toEqual({
      total: '1500.5',
      currency: 'USD',
      items: [
        { unitPrice: '750.25', quantity: 2 },
        { unitPrice: '0.01', quantity: 1 },
      ],
      nested: { rate: '12650.5' },
    });
  });

  it('Date va null tegilmaydi', () => {
    const date = new Date('2026-08-10T09:00:00.000Z');
    const result = serializeDecimals({ soldAt: date, note: null }) as Record<string, unknown>;
    expect(result.soldAt).toBe(date);
    expect(result.note).toBeNull();
  });

  it("oddiy qiymatlarni o'zgartirmaydi", () => {
    expect(serializeDecimals(42)).toBe(42);
    expect(serializeDecimals('matn')).toBe('matn');
    expect(serializeDecimals(true)).toBe(true);
    expect(serializeDecimals(undefined)).toBeUndefined();
  });
});
