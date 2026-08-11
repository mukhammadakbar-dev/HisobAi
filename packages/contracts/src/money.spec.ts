import { describe, expect, it } from 'vitest';

import { Currency } from './enums';
import {
  formatMoney,
  formatMoneyWithCurrency,
  formatRate,
  multiplyMoney,
  roundMoney,
  scaleOf,
  sumMoney,
} from './money';

/**
 * ARCHITECTURE §12 — "pul va valyuta hisoblari, yaxlitlash" unit test
 * qamrovida. Bu testlarning maqsadi: yaxlitlash float bilan qilinmasligini
 * kafolatlash (§17.14).
 */

describe('scaleOf (§1.10)', () => {
  it('UZS butun songacha, USD 2 xona', () => {
    expect(scaleOf(Currency.UZS)).toBe(0);
    expect(scaleOf(Currency.USD)).toBe(2);
  });
});

describe("roundMoney — float xatosi bo'lmasligi (§17.14)", () => {
  it("float bilan noto'g'ri chiqadigan klassik holatlar", () => {
    // (1.005).toFixed(2) === "1.00" — mana shu xato takrorlanmasin
    expect(roundMoney('1.005', Currency.USD)).toBe('1.01');
    expect(roundMoney('2.675', Currency.USD)).toBe('2.68');
    expect(roundMoney('1.015', Currency.USD)).toBe('1.02');
    expect(roundMoney('8.165', Currency.USD)).toBe('8.17');
  });

  it("juda katta summalarda aniqlik yo'qolmaydi", () => {
    // Number.MAX_SAFE_INTEGER dan katta
    expect(roundMoney('9007199254740993.45', Currency.USD)).toBe('9007199254740993.45');
    expect(roundMoney('12345678901234567.891', Currency.USD)).toBe('12345678901234567.89');
  });
});

describe('roundMoney — ROUND_HALF_UP', () => {
  it('yarmi noldan uzoqlashadi', () => {
    expect(roundMoney('0.125', Currency.USD)).toBe('0.13');
    expect(roundMoney('-0.125', Currency.USD)).toBe('-0.13');
    expect(roundMoney('0.5', Currency.UZS)).toBe('1');
    expect(roundMoney('-0.5', Currency.UZS)).toBe('-1');
  });

  it('yarmidan kam pastga tushadi', () => {
    expect(roundMoney('0.124', Currency.USD)).toBe('0.12');
    expect(roundMoney('0.4', Currency.UZS)).toBe('0');
  });
});

describe('roundMoney — natija shakli', () => {
  it('har doim aynan scale ta kasr xona', () => {
    expect(roundMoney('5', Currency.USD)).toBe('5.00');
    expect(roundMoney('5.1', Currency.USD)).toBe('5.10');
    expect(roundMoney('5.999', Currency.UZS)).toBe('6');
    expect(roundMoney('12500.6', Currency.UZS)).toBe('12501');
  });

  it("manfiy nol bo'lmaydi", () => {
    expect(roundMoney('-0.004', Currency.USD)).toBe('0.00');
    expect(roundMoney('-0.4', Currency.UZS)).toBe('0');
  });

  it('turli kirish shakllarini qabul qiladi', () => {
    expect(roundMoney(1.5, Currency.USD)).toBe('1.50');
    expect(roundMoney('  1.5  ', Currency.USD)).toBe('1.50');
    expect(roundMoney('+1.5', Currency.USD)).toBe('1.50');
    expect(roundMoney('.5', Currency.USD)).toBe('0.50');
    expect(roundMoney('1e3', Currency.UZS)).toBe('1000');
    expect(roundMoney(1e21, Currency.UZS)).toBe('1000000000000000000000');
    expect(roundMoney(1e-7, Currency.USD)).toBe('0.00');
  });

  it("noto'g'ri qiymatda xato beradi", () => {
    expect(() => roundMoney('abc', Currency.USD)).toThrow(TypeError);
    expect(() => roundMoney('', Currency.USD)).toThrow(TypeError);
    expect(() => roundMoney(Number.NaN, Currency.USD)).toThrow(TypeError);
    expect(() => roundMoney(Number.POSITIVE_INFINITY, Currency.USD)).toThrow(TypeError);
  });
});

describe('formatMoney (§20 — minglik ajratgich)', () => {
  const NBSP = ' ';

  it('UZS butun son, uzilmaydigan probel bilan', () => {
    expect(formatMoney('12500000', Currency.UZS)).toBe(`12${NBSP}500${NBSP}000`);
    expect(formatMoney('999', Currency.UZS)).toBe('999');
    expect(formatMoney('1000', Currency.UZS)).toBe(`1${NBSP}000`);
  });

  it('USD 2 kasr xona', () => {
    expect(formatMoney('1250.5', Currency.USD)).toBe(`1${NBSP}250.50`);
    expect(formatMoney('0.05', Currency.USD)).toBe('0.05');
  });

  it('manfiy summada matematik minus ishlatiladi', () => {
    expect(formatMoney('-1000', Currency.UZS)).toBe(`−1${NBSP}000`);
  });

  it("noto'g'ri qiymatda tire qaytaradi", () => {
    expect(formatMoney('abc', Currency.UZS)).toBe('—');
  });

  it('valyuta belgisi bilan', () => {
    expect(formatMoneyWithCurrency('12500000', Currency.UZS)).toBe(`12${NBSP}500${NBSP}000 so'm`);
    expect(formatMoneyWithCurrency('1250.5', Currency.USD)).toBe(`$1${NBSP}250.50`);
    expect(formatMoneyWithCurrency('-1250.5', Currency.USD)).toBe(`−$1${NBSP}250.50`);
  });
});

describe('formatRate (§3.1)', () => {
  const NBSP = ' ';

  it('ortiqcha nollarni olib tashlaydi', () => {
    expect(formatRate('12650.0000')).toBe(`12${NBSP}650`);
    expect(formatRate('12650.5000')).toBe(`12${NBSP}650.5`);
    expect(formatRate('12650.5678')).toBe(`12${NBSP}650.57`);
  });

  it("noto'g'ri qiymatda tire qaytaradi", () => {
    expect(formatRate('—')).toBe('—');
  });
});

/**
 * Yig'indi va ko'paytirish — qabul formasidagi "jami" ekranda va
 * serverda BIR XIL chiqishi kerak. Float bilan hisoblansa, ular
 * ajralib ketardi va foydalanuvchi qaysi biri to'g'riligini bilmasdi.
 */
describe('sumMoney (§17.14)', () => {
  it('float xatosini jamlamaydi', () => {
    expect(sumMoney(['0.1', '0.2'], Currency.USD)).toBe('0.30');
    expect(
      sumMoney(
        Array.from({ length: 10 }, () => '0.1'),
        Currency.USD,
      ),
    ).toBe('1.00');
  });

  it("har qo'shiluvchi avval o'z valyutasi bo'yicha yaxlitlanadi", () => {
    // Bazaga ham aynan shu qiymatlar yoziladi (§1.10)
    expect(sumMoney(['12000000.6', '11500000.4'], Currency.UZS)).toBe('23500001');
  });

  it("bo'sh ro'yxat nol beradi", () => {
    expect(sumMoney([], Currency.UZS)).toBe('0');
    expect(sumMoney([], Currency.USD)).toBe('0.00');
  });

  it("katta summalar aniqligini yo'qotmaydi", () => {
    // 2^53 dan katta — `number` bilan hisoblansa xato bo'lardi
    expect(sumMoney(['9007199254740993', '1'], Currency.UZS)).toBe('9007199254740994');
  });
});

describe('multiplyMoney', () => {
  it('partiya jami tannarxi', () => {
    expect(multiplyMoney('25000.4', 10, Currency.UZS)).toBe('250000');
    expect(multiplyMoney('1.005', 3, Currency.USD)).toBe('3.03');
  });

  it('nol miqdor nol beradi', () => {
    expect(multiplyMoney('25000', 0, Currency.UZS)).toBe('0');
  });

  it("kasr ko'paytuvchi rad etiladi", () => {
    expect(() => multiplyMoney('25000', 1.5, Currency.UZS)).toThrow(TypeError);
  });
});
