import { describe, expect, it } from 'vitest';

import { ReversalReason } from '../enums';
import { cancelSaleSchema, returnSaleSchema } from './sale';

/**
 * Qaytarish sxemalari (§8).
 *
 * Bu yerda faqat **sxemaning o'zi hal qiladigan** qoidalar sinaladi —
 * qolgan hammasi (qolgan miqdor, savdo holati, muddat) serverda, chunki
 * sxema savdoni ko'rmaydi.
 */

const ITEM = { saleItemId: '6f1a4c2e-0d3b-4a7c-9e11-2b8f5c6d7a90', quantity: 1 };

describe('returnSaleSchema', () => {
  it('kamida bitta qator talab qiladi (§8.4)', () => {
    expect(
      returnSaleSchema.safeParse({ items: [], reason: ReversalReason.DEFECTIVE }).success,
    ).toBe(false);
  });

  it('miqdor musbat butun son bo‘lishi kerak', () => {
    for (const quantity of [0, -1, 1.5]) {
      const result = returnSaleSchema.safeParse({
        items: [{ ...ITEM, quantity }],
        reason: ReversalReason.DEFECTIVE,
      });
      expect(result.success, `miqdor ${String(quantity)} qabul qilinmasligi kerak`).toBe(false);
    }
  });

  // §8.6 — sabab majburiy, "boshqa" esa o'zi hech narsani tushuntirmaydi:
  // oradan bir oy o'tib auditda faqat "OTHER" qolib ketardi
  it('"Boshqa" sababda izoh majburiy', () => {
    expect(
      returnSaleSchema.safeParse({ items: [ITEM], reason: ReversalReason.OTHER }).success,
    ).toBe(false);

    expect(
      returnSaleSchema.safeParse({
        items: [ITEM],
        reason: ReversalReason.OTHER,
        note: 'Quti ochilmagan',
      }).success,
    ).toBe(true);
  });

  it('boshqa sabablarda izoh ixtiyoriy', () => {
    expect(
      returnSaleSchema.safeParse({ items: [ITEM], reason: ReversalReason.DEFECTIVE }).success,
    ).toBe(true);
  });

  // §8.7 — qaytarish O'Z sanasiga yoziladi, ya'ni sanani tanlash
  // imkoniyati o'sha talabni chetlab o'tish yo'lidan boshqa narsa emas
  it('sana maydonini qabul qilmaydi', () => {
    expect(
      returnSaleSchema.safeParse({
        items: [ITEM],
        reason: ReversalReason.DEFECTIVE,
        returnedAt: '2026-08-01T10:00:00.000Z',
      }).success,
    ).toBe(false);
  });
});

describe('cancelSaleSchema', () => {
  it('qatorlar tanlanmaydi — qisman bekor qilish yo‘q (§16.5)', () => {
    expect(
      cancelSaleSchema.safeParse({ reason: ReversalReason.ENTRY_ERROR, items: [ITEM] }).success,
    ).toBe(false);
  });

  it('sabab majburiy', () => {
    expect(cancelSaleSchema.safeParse({}).success).toBe(false);
    expect(cancelSaleSchema.safeParse({ reason: ReversalReason.ENTRY_ERROR }).success).toBe(true);
  });

  it('"Boshqa" sababda izoh majburiy', () => {
    expect(cancelSaleSchema.safeParse({ reason: ReversalReason.OTHER }).success).toBe(false);
    expect(
      cancelSaleSchema.safeParse({ reason: ReversalReason.OTHER, note: 'Ikki marta kiritildi' })
        .success,
    ).toBe(true);
  });
});
