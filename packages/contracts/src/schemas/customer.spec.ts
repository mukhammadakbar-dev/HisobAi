import { describe, expect, it } from 'vitest';

import { createCustomerSchema, customerQuerySchema, updateCustomerSchema } from './customer';

/**
 * Sxema ikkala tomonda ishlaydi (`FRONTEND.md` §6.1), shuning uchun
 * bu yerdagi qoidalar buzilsa, forma bilan server bir-biriga zid
 * javob beradi.
 */

const VALID = {
  fullName: 'Alisher Karimov',
  phonePrimary: '90 123 45 67',
  phoneSecondary: null,
  address: null,
  note: null,
  passportSeries: null,
  passportNumber: null,
  pinfl: null,
};

describe('createCustomerSchema', () => {
  it('§6.2 — telefon E.164 ga keltiriladi', () => {
    const parsed = createCustomerSchema.parse(VALID);

    expect(parsed.phonePrimary).toBe('+998901234567');
  });

  it("qo'shimcha telefon ham normallashadi", () => {
    const parsed = createCustomerSchema.parse({ ...VALID, phoneSecondary: '+998 91 000 11 22' });

    expect(parsed.phoneSecondary).toBe('+998910001122');
  });

  it("bo'sh qo'shimcha telefon — null, xato emas", () => {
    expect(createCustomerSchema.parse({ ...VALID, phoneSecondary: '' }).phoneSecondary).toBeNull();
  });

  it("xato terilgan qo'shimcha telefon jimgina o'chib ketmaydi", () => {
    const result = createCustomerSchema.safeParse({ ...VALID, phoneSecondary: '123' });

    expect(result.success).toBe(false);
  });

  it("asosiy telefonsiz mijoz bo'lmaydi (§6.4)", () => {
    expect(createCustomerSchema.safeParse({ ...VALID, phonePrimary: '' }).success).toBe(false);
  });

  it('§6.5 — passport katta harfga keltiriladi', () => {
    const parsed = createCustomerSchema.parse({
      ...VALID,
      passportSeries: 'aa',
      passportNumber: '1234567',
      pinfl: '12345678901234',
    });

    // Katta harf — PDF'da va qidiruvda bir xil ko'rinsin
    expect(parsed.passportSeries).toBe('AA');
    expect(parsed.passportNumber).toBe('1234567');
  });

  /**
   * §19.6 — format qat'iy emas: ID-karta, chet el pasporti va eski
   * namunadagi hujjat boshqacha yoziladi. Ular rad etilsa, mijozni
   * umuman kiritib bo'lmasdi va nasiya (§6.1) to'xtardi.
   */
  it('§19.6 — boshqa namunadagi hujjat ham qabul qilinadi', () => {
    const parsed = createCustomerSchema.parse({
      ...VALID,
      passportSeries: 'ab',
      passportNumber: 'c-9912345',
      pinfl: null,
    });

    expect(parsed.passportNumber).toBe('C-9912345');
  });

  it("ma'nosiz passport qiymati rad etiladi", () => {
    // Bo'sh seriya, juda qisqa raqam va kirill harflari — kiritish xatosi
    expect(createCustomerSchema.safeParse({ ...VALID, passportSeries: '' }).success).toBe(false);
    expect(createCustomerSchema.safeParse({ ...VALID, passportNumber: '12' }).success).toBe(false);
    expect(createCustomerSchema.safeParse({ ...VALID, passportNumber: 'АА1234' }).success).toBe(
      false,
    );
    // JSHSHIR — ta'rifi bo'yicha aynan 14 raqam
    expect(createCustomerSchema.safeParse({ ...VALID, pinfl: '123' }).success).toBe(false);
  });

  it('qarz maydoni qabul qilinmaydi (§6.12)', () => {
    const result = createCustomerSchema.safeParse({ ...VALID, debt: '1000000' });

    expect(result.success).toBe(false);
  });
});

describe('updateCustomerSchema', () => {
  it('§6.9 — belgi sababsiz qo‘yilmaydi', () => {
    const result = updateCustomerSchema.safeParse({ isFlagged: true });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['flagReason']);
  });

  it('sabab bilan belgilash ruxsat etiladi', () => {
    expect(
      updateCustomerSchema.safeParse({ isFlagged: true, flagReason: "To'lovni kechiktiradi" })
        .success,
    ).toBe(true);
  });

  it('belgini olib tashlashda sabab talab qilinmaydi', () => {
    expect(updateCustomerSchema.safeParse({ isFlagged: false }).success).toBe(true);
  });

  it("bo'sh o'zgarish rad etiladi", () => {
    expect(
      updateCustomerSchema.safeParse({ expectedUpdatedAt: '2026-08-11T09:00:00.000Z' }).success,
    ).toBe(false);
  });
});

describe('customerQuerySchema', () => {
  it("noma'lum parametr rad etiladi (`API.md` §5.2)", () => {
    expect(customerQuerySchema.safeParse({ nmae: 'Alisher' }).success).toBe(false);
  });

  it('standart saralash — ism bo‘yicha', () => {
    expect(customerQuerySchema.parse({}).sort).toBe('fullName');
  });
});
