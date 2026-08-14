import { describe, expect, it } from 'vitest';

import { Currency } from './enums';
import {
  addMonthsClamped,
  generateMonthlySchedule,
  markupFromPercent,
  principalOf,
} from './installment';
import { percentOfMoney, splitMoney, sumMoney } from './money';

/**
 * Nasiya hisobi — §9.6 tekshiruvining poydevori.
 *
 * Bu yerdagi har bir qoida buzilsa, savdo tasdiqlanmaydi yoki (undan
 * battari) noto'g'ri qarz bilan tasdiqlanadi:
 *
 *  - bo'laklar yig'indisi qarzga AYNAN teng bo'lmasa, §9.6 yolg'on xato
 *    beradi va nasiya savdo umuman rasmiylashtirilmaydi;
 *  - ustama tiyinga xato hisoblansa, xato to'g'ridan-to'g'ri qarzga
 *    (§17.3) o'tadi va butun jadval bo'ylab tarqaladi;
 *  - oyning kuni surilib ketsa (31 → 3-mart), to'lov sanasi keyingi oyga
 *    o'tib, jadval tartibi buziladi (§17.15).
 */

describe('splitMoney (§17.15)', () => {
  it("yig'indi butunga aynan teng — qoldiq OXIRGI qatorda", () => {
    const parts = splitMoney('100', 3, Currency.UZS);

    expect(parts).toEqual(['33', '33', '34']);
    expect(sumMoney(parts, Currency.UZS)).toBe('100');
  });

  it("teng bo'linganda qoldiq qo'shilmaydi", () => {
    expect(splitMoney('12000000', 4, Currency.UZS)).toEqual([
      '3000000',
      '3000000',
      '3000000',
      '3000000',
    ]);
  });

  it('USD ikki kasr xonada bo‘linadi', () => {
    const parts = splitMoney('100.00', 3, Currency.USD);

    expect(parts).toEqual(['33.33', '33.33', '33.34']);
    expect(sumMoney(parts, Currency.USD)).toBe('100.00');
  });

  it('bitta bo‘lak — butun summa', () => {
    expect(splitMoney('999', 1, Currency.UZS)).toEqual(['999']);
  });

  it('noto‘g‘ri bo‘lak soni va manfiy summa rad etiladi', () => {
    expect(() => splitMoney('100', 0, Currency.UZS)).toThrow(TypeError);
    expect(() => splitMoney('100', 1.5, Currency.UZS)).toThrow(TypeError);
    expect(() => splitMoney('-100', 2, Currency.UZS)).toThrow(TypeError);
  });
});

describe('percentOfMoney (§9.3)', () => {
  it('butun foiz', () => {
    expect(percentOfMoney('12000000', 20, Currency.UZS)).toBe('2400000');
  });

  it('kasrli foiz — Decimal(5,2) gacha', () => {
    expect(percentOfMoney('12000000', '12.50', Currency.UZS)).toBe('1500000');
  });

  // `Number` arifmetikasida bu qiymat 1.005 ga o'xshab pastga yaxlitlanardi
  it('yarmi yuqoriga yaxlitlanadi (ROUND_HALF_UP)', () => {
    expect(percentOfMoney('1', '50', Currency.UZS)).toBe('1');
    expect(percentOfMoney('101', '0.50', Currency.UZS)).toBe('1');
  });

  it('manfiy foiz rad etiladi', () => {
    expect(() => percentOfMoney('100', '-5', Currency.UZS)).toThrow(TypeError);
  });
});

describe('principalOf (§17.3)', () => {
  it('naqd narx + ustama − boshlang‘ich to‘lov', () => {
    const principal = principalOf(
      { cashPrice: '12000000', markupAmount: '2400000', downPayment: '4000000' },
      Currency.UZS,
    );

    expect(principal).toBe('10400000');
  });

  // §16.3 — 0% boshlang'ich to'lov taqiqlanmaydi
  it('boshlang‘ich to‘lov 0 bo‘lishi mumkin', () => {
    expect(
      principalOf({ cashPrice: '100', markupAmount: '0', downPayment: '0' }, Currency.UZS),
    ).toBe('100');
  });

  it('ustama foizdan hisoblanganda ham bir xil natija beradi', () => {
    const markup = markupFromPercent('12000000', '20', Currency.UZS);

    expect(
      principalOf({ cashPrice: '12000000', markupAmount: markup, downPayment: '0' }, Currency.UZS),
    ).toBe('14400000');
  });
});

describe('addMonthsClamped (§17.15)', () => {
  it('31-yanvar + 1 oy = 28-fevral (kabisa emas)', () => {
    expect(addMonthsClamped('2026-01-31', 1)).toBe('2026-02-28');
  });

  it('kabisa yilida 29-fevral', () => {
    expect(addMonthsClamped('2028-01-31', 1)).toBe('2028-02-29');
  });

  it('yil chegarasidan o‘tadi', () => {
    expect(addMonthsClamped('2026-11-15', 3)).toBe('2027-02-15');
  });

  it('0 oy — o‘sha sana', () => {
    expect(addMonthsClamped('2026-08-14', 0)).toBe('2026-08-14');
  });

  // Kun surilmasligi kerak: 31 → 28 bo'lgach, keyingi oy YANA 31 dan
  // hisoblanadi. Aks holda jadval asta-sekin oy boshiga sirg'alardi
  it('qisqargan kun keyingi oyda tiklanadi', () => {
    expect(addMonthsClamped('2026-01-31', 2)).toBe('2026-03-31');
  });
});

describe('generateMonthlySchedule (§9.5, §9.6)', () => {
  it('yig‘indi qarzga aynan teng', () => {
    const rows = generateMonthlySchedule({
      principal: '10000000',
      currency: Currency.UZS,
      months: 3,
      firstDueDate: '2026-09-15',
    });

    expect(rows).toHaveLength(3);
    expect(
      sumMoney(
        rows.map((row) => row.amount),
        Currency.UZS,
      ),
    ).toBe('10000000');
    expect(rows.map((row) => row.dueDate)).toEqual(['2026-09-15', '2026-10-15', '2026-11-15']);
  });

  it('yaxlitlash qoldig‘i oxirgi qatorda (§17.15)', () => {
    const rows = generateMonthlySchedule({
      principal: '100',
      currency: Currency.UZS,
      months: 3,
      firstDueDate: '2026-09-01',
    });

    expect(rows.map((row) => row.amount)).toEqual(['33', '33', '34']);
  });

  it('oy oxiri sanasi har oyda qisqaradi, lekin surilmaydi', () => {
    const rows = generateMonthlySchedule({
      principal: '300',
      currency: Currency.UZS,
      months: 4,
      firstDueDate: '2026-12-31',
    });

    expect(rows.map((row) => row.dueDate)).toEqual([
      '2026-12-31',
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
    ]);
  });
});
