import { HttpStatus } from '@nestjs/common';
import { ErrorCode, ExchangeRateSource, RateStaleness } from '@hisobai/contracts';
import { Prisma, type ExchangeRate } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppException } from '../common/app.exception';
import { fromCalendarDate, today, toCalendarDate } from '../common/dates';
import { ExchangeRatesService } from './exchange-rates.service';

/**
 * Kurs servisi sinovdan o'tkaziladi, chunki uning uchta qoidasi ham
 * **jimgina** buziladi:
 *
 *  - §16.2 ustama formulasi — noto'g'ri bo'lsa har savdo bir necha so'mga
 *    xato ketadi va buni hech kim sezmaydi;
 *  - §16.8 `MANUAL` himoyasi — buzilsa cron ega qo'lda qo'ygan kursni
 *    tunda ustidan yozadi va ertalab boshqa narxda savdo boshlanadi;
 *  - §17.11 orqadagi sana — noto'g'ri qator olinsa, orqaga qo'yilgan
 *    savdo o'sha kunda mavjud bo'lmagan kurs bilan yoziladi.
 */

const TIMEZONE = 'Asia/Tashkent';
const MARKUP = '2';

interface Row {
  date: string;
  cbuRate: string | null;
  storeRate: string;
  source: ExchangeRateSource;
}

function toRecord(row: Row): ExchangeRate {
  return {
    id: `id-${row.date}`,
    date: fromCalendarDate(row.date),
    cbuRate: row.cbuRate === null ? null : new Prisma.Decimal(row.cbuRate),
    storeRate: new Prisma.Decimal(row.storeRate),
    source: row.source,
    fetchedAt: null,
    updatedById: null,
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  } as ExchangeRate;
}

function makeService(rows: Row[], fetchedCbu: string | Error = '12000') {
  const store = new Map(rows.map((row) => [row.date, toRecord(row)]));
  const audit = {
    record: vi.fn(() => Promise.resolve()),
    recordDetached: vi.fn(() => Promise.resolve()),
  };

  const model = {
    findUnique: ({ where }: { where: { date: Date } }) =>
      Promise.resolve(store.get(toCalendarDate(where.date)) ?? null),

    findFirst: ({ where }: { where: { date: { lte: Date } } }) => {
      const limit = toCalendarDate(where.date.lte);
      const match = [...store.values()]
        .filter((row) => toCalendarDate(row.date) <= limit)
        .sort((a, b) => toCalendarDate(b.date).localeCompare(toCalendarDate(a.date)))[0];
      return Promise.resolve(match ?? null);
    },

    update: ({ where, data }: { where: { date: Date }; data: Partial<ExchangeRate> }) => {
      const key = toCalendarDate(where.date);
      const existing = store.get(key);
      if (!existing) throw new Error('qator yo‘q');
      const next = { ...existing, ...data } as ExchangeRate;
      store.set(key, next);
      return Promise.resolve(next);
    },

    upsert: ({
      where,
      update,
      create,
    }: {
      where: { date: Date };
      update: Partial<ExchangeRate>;
      create: Partial<ExchangeRate>;
    }) => {
      const key = toCalendarDate(where.date);
      const existing = store.get(key);
      const next = (
        existing ? { ...existing, ...update } : { ...toRecord({ ...EMPTY, date: key }), ...create }
      ) as ExchangeRate;
      store.set(key, next);
      return Promise.resolve(next);
    },

    count: ({ where }: { where: { date: Date } }) =>
      Promise.resolve(store.has(toCalendarDate(where.date)) ? 1 : 0),
  };

  const prisma = {
    exchangeRate: model,
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({ exchangeRate: model }),
  };

  const service = new ExchangeRatesService(
    prisma as never,
    { get: () => TIMEZONE } as never,
    { get: () => Promise.resolve({ storeRateMarkupPercent: MARKUP }) } as never,
    {
      fetchUsdRate: () =>
        fetchedCbu instanceof Error
          ? Promise.reject(fetchedCbu)
          : Promise.resolve({ rate: fetchedCbu, date: '' }),
    } as never,
    audit as never,
  );

  return { service, store, audit };
}

const EMPTY: Row = { date: '', cbuRate: null, storeRate: '0', source: ExchangeRateSource.CBU };

/** Do'kon zonasidagi bugundan N kun oldingi kalendar sana. */
function daysAgo(count: number): string {
  const base = fromCalendarDate(today(TIMEZONE));
  return toCalendarDate(new Date(base.getTime() - count * 86_400_000));
}

describe('ExchangeRatesService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getForDate (§17.11 — orqaga qo‘yilgan sana)', () => {
    it('aynan o‘sha kunning qatorini oladi', async () => {
      const { service } = makeService([
        {
          date: '2026-08-05',
          cbuRate: '11900',
          storeRate: '12138',
          source: ExchangeRateSource.CBU,
        },
        {
          date: '2026-08-07',
          cbuRate: '11950',
          storeRate: '12189',
          source: ExchangeRateSource.CBU,
        },
      ]);

      const rate = await service.getForDate('2026-08-07');
      expect(rate?.storeRate.toString()).toBe('12189');
    });

    it('qator yo‘q bo‘lsa — undan OLDINGI eng yaqin qator', async () => {
      const { service } = makeService([
        {
          date: '2026-08-05',
          cbuRate: '11900',
          storeRate: '12138',
          source: ExchangeRateSource.CBU,
        },
        {
          date: '2026-08-09',
          cbuRate: '11990',
          storeRate: '12230',
          source: ExchangeRateSource.CBU,
        },
      ]);

      const rate = await service.getForDate('2026-08-07');
      expect(rate?.storeRate.toString()).toBe('12138');
    });

    it('keyingi kun kursini HECH QACHON olmaydi', async () => {
      const { service } = makeService([
        {
          date: '2026-08-09',
          cbuRate: '11990',
          storeRate: '12230',
          source: ExchangeRateSource.CBU,
        },
      ]);

      // 08-07 uchun faqat 08-09 bor — o'sha kunda mavjud bo'lmagan kurs
      expect(await service.getForDate('2026-08-07')).toBeNull();
    });

    it('kurs umuman bo‘lmasa requireForDate aniq xato beradi', async () => {
      const { service } = makeService([]);
      await expect(service.requireForDate('2026-08-07')).rejects.toThrow(AppException);
    });
  });

  describe('getToday (§16.6 — eskirganlik)', () => {
    it('bugungi qator bor — FRESH, isStale false', async () => {
      const { service } = makeService([
        { date: daysAgo(0), cbuRate: '11950', storeRate: '12189', source: ExchangeRateSource.CBU },
      ]);

      const result = await service.getToday();
      expect(result.isStale).toBe(false);
      expect(result.staleDays).toBe(0);
      expect(result.staleness).toBe(RateStaleness.FRESH);
    });

    it('1 kun eski — WARN (sun’iy chegara yo‘q)', async () => {
      const { service } = makeService([
        { date: daysAgo(1), cbuRate: '11950', storeRate: '12189', source: ExchangeRateSource.CBU },
      ]);

      const result = await service.getToday();
      expect(result.isStale).toBe(true);
      expect(result.staleDays).toBe(1);
      expect(result.staleness).toBe(RateStaleness.WARN);
    });

    it('3 kun eski — CRITICAL', async () => {
      const { service } = makeService([
        { date: daysAgo(3), cbuRate: '11950', storeRate: '12189', source: ExchangeRateSource.CBU },
      ]);

      expect((await service.getToday()).staleness).toBe(RateStaleness.CRITICAL);
    });

    it('kurs umuman yo‘q — xato tashlamaydi, savdo to‘xtamaydi (§1.5)', async () => {
      const { service } = makeService([]);

      const result = await service.getToday();
      expect(result.rate).toBeNull();
      expect(result.isStale).toBe(true);
      expect(result.staleDays).toBeNull();
      expect(result.staleness).toBe(RateStaleness.CRITICAL);
    });
  });

  describe('syncFromCbu (§3.3, §16.2, §16.8)', () => {
    const actor = { id: 'user-1' } as never;

    it('do‘kon kursini ustama bo‘yicha hisoblab yozadi', async () => {
      const { service, store } = makeService([], '12000');

      expect((await service.syncFromCbu()).outcome).toBe('WRITTEN');

      const saved = store.get(today(TIMEZONE));
      // 12000 × 1.02 = 12240
      expect(saved?.storeRate.toString()).toBe('12240');
      expect(saved?.source).toBe(ExchangeRateSource.CBU);
    });

    it('MANUAL kursga TEGMAYDI — faqat cbuRate yangilanadi (§16.8)', async () => {
      const { service, store } = makeService(
        [
          {
            date: today(TIMEZONE),
            cbuRate: '11900',
            storeRate: '12500',
            source: ExchangeRateSource.MANUAL,
          },
        ],
        '12000',
      );

      expect((await service.syncFromCbu()).outcome).toBe('MANUAL_PRESERVED');

      const saved = store.get(today(TIMEZONE));
      // Ega qo'ygan kurs daxlsiz qoldi
      expect(saved?.storeRate.toString()).toBe('12500');
      expect(saved?.source).toBe(ExchangeRateSource.MANUAL);
      // CBU qiymati esa ma'lumot uchun yangilandi
      expect(saved?.cbuRate?.toString()).toBe('12000');
    });

    it('resetToCbu — MANUAL dan chiqish yo‘li bor (§16.8)', async () => {
      const { service, store, audit } = makeService([
        {
          date: '2026-08-10',
          cbuRate: '11952.1',
          storeRate: '12500',
          source: ExchangeRateSource.MANUAL,
        },
      ]);

      const result = await service.resetToCbu('2026-08-10', actor, '::1');

      // 11952.1 × 1.02 = 12191.142 → 12191
      expect(result.storeRate).toBe('12191');
      expect(result.source).toBe(ExchangeRateSource.CBU);
      expect(store.get('2026-08-10')?.source).toBe(ExchangeRateSource.CBU);
      // §3.10 — kurs o'zgarishi audit'ga tushadi
      expect(audit.record).toHaveBeenCalledOnce();
    });

    it('resetToCbu — CBU qiymati yo‘q bo‘lsa rad etadi, nolga tushirmaydi', async () => {
      const { service } = makeService([
        {
          date: '2026-08-10',
          cbuRate: null,
          storeRate: '12500',
          source: ExchangeRateSource.MANUAL,
        },
      ]);

      try {
        await service.resetToCbu('2026-08-10', actor, null);
        expect.unreachable('xato kutilgan edi');
      } catch (error) {
        expect((error as AppException).code).toBe(ErrorCode.EXCHANGE_RATE_CBU_MISSING);
      }
    });

    /**
     * §18.4 — kun davomida qo'lda yangilash. Cron bilan bir xil kod,
     * farqi faqat audit va xato shaklida.
     */
    it("qo'lda yangilash audit'ga tushadi, cron esa tushmaydi (§3.10)", async () => {
      const manual = makeService([], '12100');
      await manual.service.syncFromCbu({ actor, ip: '::1' });
      expect(manual.audit.recordDetached).toHaveBeenCalledOnce();

      const cron = makeService([], '12100');
      await cron.service.syncFromCbu();
      expect(cron.audit.recordDetached).not.toHaveBeenCalled();
    });

    it("qo'lda yangilash MANUAL kursni ham ustidan yozmaydi (§16.8)", async () => {
      const { service, store } = makeService(
        [
          {
            date: today(TIMEZONE),
            cbuRate: '11900',
            storeRate: '12500',
            source: ExchangeRateSource.MANUAL,
          },
        ],
        '12100',
      );

      const result = await service.syncFromCbu({ actor, ip: null });

      // Ega CBU'ni ko'rishni so'radi, do'kon kursini almashtirishni emas
      expect(result.outcome).toBe('MANUAL_PRESERVED');
      expect(result.rate.storeRate).toBe('12500');
      expect(result.rate.cbuRate).toBe('12100');
      expect(store.get(today(TIMEZONE))?.source).toBe(ExchangeRateSource.MANUAL);
    });

    it('CBU javob bermasa — 503 va tipli xato, 500 emas', async () => {
      const { service, store } = makeService([], new Error('ECONNREFUSED'));

      try {
        await service.syncFromCbu({ actor, ip: null });
        expect.unreachable('xato kutilgan edi');
      } catch (error) {
        const exception = error as AppException;
        expect(exception.code).toBe(ErrorCode.EXCHANGE_RATE_FETCH_FAILED);
        expect(exception.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      }

      // §1.5 — mavjud kurs buzilmaydi
      expect(store.size).toBe(0);
    });

    it('resetToCbu — qator umuman yo‘q bo‘lsa 404', async () => {
      const { service } = makeService([]);

      try {
        await service.resetToCbu('2026-08-10', actor, null);
        expect.unreachable('xato kutilgan edi');
      } catch (error) {
        expect((error as AppException).code).toBe(ErrorCode.EXCHANGE_RATE_MISSING);
      }
    });
  });
});
