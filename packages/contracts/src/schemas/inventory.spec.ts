import { describe, expect, it } from 'vitest';

import { MAX_RECEIVE_ROWS } from '../catalog';
import { Currency } from '../enums';
import { inventoryQuerySchema, movementQuerySchema, receiveSchema } from './inventory';

/**
 * Qabul sxemasi bazadagi cheklovlarni takrorlaydi, chunki `CHECK` va
 * trigger xatolari **qaysi qator** haqida ekanini ayta olmaydi. 50 ta
 * IMEI kiritilgan formada bu farq hal qiluvchi: foydalanuvchi xatoni
 * topa olishi kerak.
 */

const PRODUCT_ID = 'c619c9c0-8ecb-4119-97ac-08e74001fa2d';

const base = { productId: PRODUCT_ID, costCurrency: Currency.USD };
const item = (over: Record<string, unknown> = {}) => ({ costPrice: '100', ...over });

/** Birinchi xatoning yo'li — `items.3.imei1` ko'rinishida. */
function firstIssuePath(result: { success: boolean; error?: { issues: { path: unknown[] }[] } }) {
  return result.error?.issues[0]?.path.join('.');
}

describe('receiveSchema — shakl', () => {
  it('seriyali birliklar bilan o‘tadi', () => {
    const result = receiveSchema.safeParse({
      ...base,
      items: [item({ imei1: '353917104876543' })],
    });
    expect(result.success).toBe(true);
  });

  it('partiya bilan o‘tadi', () => {
    const result = receiveSchema.safeParse({
      ...base,
      batch: { quantityReceived: 10, unitCost: '5' },
    });
    expect(result.success).toBe(true);
  });

  it('ikkalasi birga — rad etiladi', () => {
    const result = receiveSchema.safeParse({
      ...base,
      items: [item({ imei1: '353917104876543' })],
      batch: { quantityReceived: 10, unitCost: '5' },
    });
    expect(result.success).toBe(false);
  });

  it('ikkalasi ham yo‘q — rad etiladi', () => {
    expect(receiveSchema.safeParse(base).success).toBe(false);
  });

  it('notanish maydon rad etiladi (mass assignment)', () => {
    const result = receiveSchema.safeParse({
      ...base,
      items: [item({ imei1: '353917104876543' })],
      supplierId: 'x',
    });
    expect(result.success).toBe(false);
  });
});

describe('receiveSchema — qator invariantlari', () => {
  it('IMEI ham, seriya raqami ham yo‘q — rad etiladi', () => {
    const result = receiveSchema.safeParse({ ...base, items: [item()] });
    expect(result.success).toBe(false);
  });

  it('seriya raqami yetarli — IMEI shart emas', () => {
    const result = receiveSchema.safeParse({
      ...base,
      items: [item({ serialNumber: 'SN-12345' })],
    });
    expect(result.success).toBe(true);
  });

  it('IMEI-2 IMEI-1 bilan bir xil — rad etiladi', () => {
    const result = receiveSchema.safeParse({
      ...base,
      items: [item({ imei1: '353917104876543', imei2: '353917104876543' })],
    });
    expect(result.success).toBe(false);
  });

  it('IMEI 15 raqam bo‘lmasa rad etiladi', () => {
    for (const bad of ['35391710487654', '3539171048765431', '35391710487654a']) {
      expect(receiveSchema.safeParse({ ...base, items: [item({ imei1: bad })] }).success).toBe(
        false,
      );
    }
  });

  it('tannarx nol yoki manfiy bo‘lmaydi', () => {
    for (const bad of ['0', '-5']) {
      const result = receiveSchema.safeParse({
        ...base,
        items: [item({ imei1: '353917104876543', costPrice: bad })],
      });
      expect(result.success).toBe(false);
    }
  });
});

/**
 * Bazadagi trigger payload ichidagi takrorni ham ushlaydi (lokal bazada
 * tekshirilgan), lekin u qaysi qator ekanini bilmaydi. Shu sabab bu
 * tekshiruv sxemada ham bor va **aynan qator yo'lini** ko'rsatadi.
 */
describe('receiveSchema — payload ichidagi takroriy identifikator', () => {
  it('bir xil IMEI ikki qatorda — ikkinchi qatorga xato bog‘lanadi', () => {
    const result = receiveSchema.safeParse({
      ...base,
      items: [
        item({ imei1: '353917104876543' }),
        item({ imei1: '353917104876544' }),
        item({ imei1: '353917104876545' }),
        item({ imei1: '353917104876543' }),
      ],
    });

    expect(result.success).toBe(false);
    expect(firstIssuePath(result)).toBe('items.3.imei1');
  });

  it('USTUNLARARO takror ham ushlanadi: 0-qator imei_1 = 1-qator imei_2', () => {
    const result = receiveSchema.safeParse({
      ...base,
      items: [
        item({ imei1: '353917104876543' }),
        item({ imei1: '353917104876544', imei2: '353917104876543' }),
      ],
    });

    expect(result.success).toBe(false);
    expect(firstIssuePath(result)).toBe('items.1.imei2');
  });

  it('IMEI va seriya raqami bir xil qiymat bo‘lsa ham ushlanadi', () => {
    const result = receiveSchema.safeParse({
      ...base,
      items: [item({ imei1: '353917104876543' }), item({ serialNumber: '353917104876543' })],
    });

    expect(result.success).toBe(false);
    expect(firstIssuePath(result)).toBe('items.1.serialNumber');
  });

  it('turli identifikatorlar — o‘tadi', () => {
    const result = receiveSchema.safeParse({
      ...base,
      items: [
        item({ imei1: '353917104876543', imei2: '353917104876544' }),
        item({ imei1: '353917104876545', serialNumber: 'SN-1' }),
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe('receiveSchema — chegaralar', () => {
  it('kelajakdagi sana rad etiladi', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const result = receiveSchema.safeParse({
      ...base,
      receivedAt: tomorrow,
      items: [item({ imei1: '353917104876543' })],
    });

    expect(result.success).toBe(false);
    expect(firstIssuePath(result)).toBe('receivedAt');
  });

  it(`${String(MAX_RECEIVE_ROWS)} dan ortiq qator rad etiladi`, () => {
    const items = Array.from({ length: MAX_RECEIVE_ROWS + 1 }, (_, index) =>
      item({ imei1: String(100000000000000 + index) }),
    );
    expect(receiveSchema.safeParse({ ...base, items }).success).toBe(false);
  });
});

describe('ro‘yxat filtrlari (`API.md` §5.2)', () => {
  it('noma‘lum parametr rad etiladi — jimgina yutilmaydi', () => {
    expect(inventoryQuerySchema.safeParse({ stauts: 'AVAILABLE' }).success).toBe(false);
  });

  it('vergulli enum ro‘yxati massivga aylanadi', () => {
    const result = inventoryQuerySchema.safeParse({ status: 'AVAILABLE,SOLD' });
    expect(result.success).toBe(true);
    expect(result.data?.status).toEqual(['AVAILABLE', 'SOLD']);
  });

  it('bo‘sh enum ro‘yxati rad etiladi', () => {
    expect(inventoryQuerySchema.safeParse({ status: '' }).success).toBe(false);
  });

  it('noto‘g‘ri enum qiymati rad etiladi', () => {
    expect(inventoryQuerySchema.safeParse({ status: 'AVAILABLE,YOQ' }).success).toBe(false);
  });

  it('limit maksimumdan oshsa rad etiladi', () => {
    expect(inventoryQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });

  it('sort faqat oq ro‘yxatdan', () => {
    expect(inventoryQuerySchema.safeParse({ sort: 'costPrice' }).success).toBe(false);
    expect(inventoryQuerySchema.safeParse({ sort: '-receivedAt' }).success).toBe(true);
  });

  it('harakatlar filtri sanani kalendar ko‘rinishida oladi', () => {
    const result = movementQuerySchema.safeParse({ from: '2026-08-01', to: '2026-08-31' });
    expect(result.success).toBe(true);
    expect(movementQuerySchema.safeParse({ from: '2026-13-01' }).success).toBe(false);
  });
});
