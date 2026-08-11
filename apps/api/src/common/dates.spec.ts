import { describe, expect, it } from 'vitest';

import {
  businessDay,
  dayRangeFilter,
  dayStartInstant,
  daysBetween,
  fromCalendarDate,
  toCalendarDate,
} from './dates';

const TASHKENT = 'Asia/Tashkent';

/**
 * §17.9 — "bugun" do'kon zonasida hisoblanadi. Eng xavfli oraliq —
 * Toshkent vaqti bilan 00:00–05:00: UTC'da bu hali kechagi kun.
 * Shu tekshirilmasa, tungi savdolar hisobotda kechagi kunga tushadi.
 */
describe('businessDay (Asia/Tashkent, UTC+5)', () => {
  it('tunda ochilgan savdo bugungi kunga tushadi', () => {
    // Toshkentda 2026-08-10 01:30 → UTC'da 2026-08-09 20:30
    const instant = new Date('2026-08-09T20:30:00.000Z');
    expect(businessDay(instant, TASHKENT)).toBe('2026-08-10');
    expect(businessDay(instant, 'UTC')).toBe('2026-08-09');
  });

  it("kun oxirida ham to'g'ri", () => {
    // Toshkentda 2026-08-10 23:59
    expect(businessDay(new Date('2026-08-10T18:59:00.000Z'), TASHKENT)).toBe('2026-08-10');
    // Toshkentda 2026-08-11 00:01
    expect(businessDay(new Date('2026-08-10T19:01:00.000Z'), TASHKENT)).toBe('2026-08-11');
  });
});

describe('kalendar sana (@db.Date)', () => {
  it("UTC bo'yicha o'qiydi — bir kun sakramaydi", () => {
    expect(toCalendarDate(new Date('2026-09-15T00:00:00.000Z'))).toBe('2026-09-15');
  });

  it("aylanma o'zgarishsiz qaytadi", () => {
    expect(toCalendarDate(fromCalendarDate('2026-02-29'))).toBe('2026-03-01'); // 2026 kabisa emas
    expect(toCalendarDate(fromCalendarDate('2026-12-31'))).toBe('2026-12-31');
  });
});

describe('daysBetween', () => {
  it('kechikish kunlarini sanaydi (§9.8)', () => {
    expect(daysBetween('2026-08-01', '2026-08-13')).toBe(12);
    expect(daysBetween('2026-08-13', '2026-08-13')).toBe(0);
    expect(daysBetween('2026-08-15', '2026-08-13')).toBe(-2);
  });

  it("oy va yil chegarasidan o'tadi", () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
  });
});

/**
 * `?from=&to=` filtri (`API.md` §5.2). Ikkala chekka ham kiritiladi va
 * chegaralar **do'kon zonasida** hisoblanadi: aks holda ertalab 09:00 da
 * qabul qilingan mahsulot "kechagi" harakatlar ro'yxatiga tushib qolardi
 * (Toshkentda 09:00 — UTC'da 04:00, ya'ni o'sha kun; lekin yarim tundan
 * keyingi soatlarda farq bir kunga yetadi).
 */
describe('dayStartInstant', () => {
  it("do'kon zonasidagi yarim tunni beradi", () => {
    expect(dayStartInstant('2026-08-10', TASHKENT).toISOString()).toBe('2026-08-09T19:00:00.000Z');
    expect(dayStartInstant('2026-08-10', 'UTC').toISOString()).toBe('2026-08-10T00:00:00.000Z');
  });
});

describe('dayRangeFilter', () => {
  it('chegarasiz filtr — undefined', () => {
    expect(dayRangeFilter(undefined, undefined, TASHKENT)).toBeUndefined();
  });

  it("yuqori chegara keyingi kun boshi bo'ladi — `to` kuni to'liq kiradi", () => {
    const range = dayRangeFilter('2026-08-10', '2026-08-10', TASHKENT);

    expect(range?.gte?.toISOString()).toBe('2026-08-09T19:00:00.000Z');
    expect(range?.lt?.toISOString()).toBe('2026-08-10T19:00:00.000Z');
  });

  it("oy chegarasidan o'tadi", () => {
    const range = dayRangeFilter('2026-08-31', '2026-08-31', TASHKENT);

    expect(range?.lt?.toISOString()).toBe('2026-08-31T19:00:00.000Z');
  });

  it('bitta chekka ham yetarli', () => {
    expect(dayRangeFilter('2026-08-10', undefined, TASHKENT)?.lt).toBeUndefined();
    expect(dayRangeFilter(undefined, '2026-08-10', TASHKENT)?.gte).toBeUndefined();
  });
});
