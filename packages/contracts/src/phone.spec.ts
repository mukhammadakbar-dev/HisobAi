import { describe, expect, it } from 'vitest';

import { formatPhone, isValidPhone, normalizePhone } from './phone';

/**
 * §6.2 — "telefon E.164 ga normalizatsiya qilinadi va takrorlanmaydi".
 *
 * Ustundagi `@unique` shu funksiya qanchalik izchil ishlashiga
 * bog'liq: bitta raqam ikki xil yozilsa, indeks ularni ikki xil mijoz
 * deb qabul qiladi va §6.3 dagi dublikat tekshiruvi hech qachon
 * ishlamaydi.
 */
describe('normalizePhone (§6.2)', () => {
  it('bir xil raqamning barcha yozilishini bitta qiymatga keltiradi', () => {
    const expected = '+998901234567';

    expect(normalizePhone('901234567')).toBe(expected);
    expect(normalizePhone('90 123 45 67')).toBe(expected);
    expect(normalizePhone('998901234567')).toBe(expected);
    expect(normalizePhone('+998 90 123 45 67')).toBe(expected);
    expect(normalizePhone('+998-90-123-45-67')).toBe(expected);
    expect(normalizePhone('(90) 123-45-67')).toBe(expected);
  });

  it('eski trunk prefiksini tushunadi', () => {
    expect(normalizePhone('8 90 123 45 67')).toBe('+998901234567');
  });

  it('chet el raqamini `+` bilan qabul qiladi', () => {
    expect(normalizePhone('+7 999 123 45 67')).toBe('+79991234567');
  });

  it("tanib bo'lmasa null qaytaradi — asl qiymat emas", () => {
    // Asl qiymat qaytarilsa, u bazaga tushib ketardi va unique indeks
    // ikki xil yozilgan bitta raqamni to'smasdi
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('12345')).toBeNull();
    expect(normalizePhone('90123456')).toBeNull(); // sakkiz raqam
    expect(normalizePhone('9012345678')).toBeNull(); // o'n raqam, 8 bilan boshlanmaydi
    expect(normalizePhone('telefon')).toBeNull();
    expect(normalizePhone('+998')).toBeNull();
  });

  it('isValidPhone normalizatsiya bilan bir xil qarorni beradi', () => {
    expect(isValidPhone('90 123 45 67')).toBe(true);
    expect(isValidPhone('123')).toBe(false);
  });
});

describe('formatPhone', () => {
  it("o'zbek raqamini guruhlaydi", () => {
    expect(formatPhone('+998901234567')).toBe('+998 90 123 45 67');
  });

  it("chet el raqamini o'z holicha qoldiradi", () => {
    // Guruhlash qoidasi har davlatda boshqacha — taxmin qilinmaydi
    expect(formatPhone('+79991234567')).toBe('+79991234567');
  });

  it("bo'sh qiymatda tire", () => {
    expect(formatPhone(null)).toBe('—');
    expect(formatPhone(undefined)).toBe('—');
  });
});
