import { describe, expect, it } from 'vitest';

import { RateStaleness, computeStoreRate, rateStaleness } from './rates';

describe('computeStoreRate (§16.2)', () => {
  it("ustama 0 bo'lsa CBU kursini butun songa yaxlitlaydi", () => {
    expect(computeStoreRate('12500.4900', '0')).toBe('12500');
    expect(computeStoreRate('12500.5000', '0')).toBe('12501');
  });

  it("foizli ustamani qo'llaydi", () => {
    // 12 500 × 1.02 = 12 750
    expect(computeStoreRate('12500', '2')).toBe('12750');
    // 12 345.6789 × 1.015 = 12 530.8480... → 12 531
    expect(computeStoreRate('12345.6789', '1.5')).toBe('12531');
  });

  it('yaxlitlash chegarasida ROUND_HALF_UP ishlatadi', () => {
    // 10 000 × 1.005 = 10 050 — float bilan 10 049.999... bo'lib ketardi
    expect(computeStoreRate('10000', '0.5')).toBe('10050');
    // 12 001 × 1.0025 = 12 031.0025 → 12 031
    expect(computeStoreRate('12001', '0.25')).toBe('12031');
  });

  it('float xatosiga uchramaydi', () => {
    /**
     * Bu holat o'ylab topilgan emas — 0.5% ustama bilan butun kurs juda
     * oddiy sozlama. Aniq hisobda 9100 × 1.005 = 9145.5, ROUND_HALF_UP
     * bo'yicha 9146. JS'da esa `Math.round(9100 * 1.005) === 9145`,
     * chunki 1.005 ikkilik sanoqda 1.00499999999999989... bo'lib saqlanadi.
     * Ya'ni float bilan do'kon kursi har kuni bir so'mga past bo'lardi.
     */
    expect(computeStoreRate('9100', '0.5')).toBe('9146');
    expect(computeStoreRate('9500', '1.5')).toBe('9643');
    expect(computeStoreRate('9700', '0.5')).toBe('9749');
  });

  it("maksimal ustamani ko'taradi", () => {
    expect(computeStoreRate('10000', '100')).toBe('20000');
  });

  it("noto'g'ri kirishni rad etadi", () => {
    expect(() => computeStoreRate('0', '5')).toThrow(RangeError);
    expect(() => computeStoreRate('abc', '5')).toThrow(TypeError);
  });
});

describe('rateStaleness (§16.6)', () => {
  it('bugungi kurs — FRESH', () => {
    expect(rateStaleness(0)).toBe(RateStaleness.FRESH);
  });

  it('1–2 kun — sariq ogohlantirish', () => {
    expect(rateStaleness(1)).toBe(RateStaleness.WARN);
    expect(rateStaleness(2)).toBe(RateStaleness.WARN);
  });

  it('3 kun va undan ortiq — qizil', () => {
    expect(rateStaleness(3)).toBe(RateStaleness.CRITICAL);
    expect(rateStaleness(30)).toBe(RateStaleness.CRITICAL);
  });
});
