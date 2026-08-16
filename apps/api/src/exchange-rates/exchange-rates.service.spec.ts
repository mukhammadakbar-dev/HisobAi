import { HttpStatus } from '@nestjs/common';
import { ErrorCode, ExchangeRateSource, RateStaleness } from '@hisobai/contracts';
import { Prisma, type CbuRate, type ShopExchangeRate } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppException } from '../common/app.exception';
import { fromCalendarDate, today, toCalendarDate } from '../common/dates';
import { getShopId } from '../database/shop-context';
import { ExchangeRatesService } from './exchange-rates.service';

/**
 * Kurs servisi sinovdan o'tkaziladi, chunki uning qoidalari **jimgina**
 * buziladi:
 *
 *  - §16.2 ustama formulasi — noto'g'ri bo'lsa har savdo bir necha so'mga
 *    xato ketadi va buni hech kim sezmaydi;
 *  - §16.8 `MANUAL` himoyasi — buzilsa cron ega qo'lda qo'ygan kursni
 *    tunda ustidan yozadi va ertalab boshqa narxda savdo boshlanadi;
 *  - §17.11 orqadagi sana — noto'g'ri qator olinsa, orqaga qo'yilgan
 *    savdo o'sha kunda mavjud bo'lmagan kurs bilan yoziladi;
 *  - §21.5, §14.6 — CBU va do'kon kurslari ikki jadvalga bo'lingandan
 *    keyin ham har Shop O'Z qatoridan o'qishi/yozishi shart, boshqasiga
 *    tegmasligi shart.
 */

const TIMEZONE = 'Asia/Tashkent';
const MARKUP = '2';
/** Ambient Shop konteksti ochilmagan testlar shu "do'kon"ni ishlatadi. */
const DEFAULT_SHOP = 'shop-1';

interface ShopRow {
  date: string;
  storeRate: string;
  source: ExchangeRateSource;
}

interface CbuRow {
  date: string;
  rate: string;
}

function toShopRecord(shopId: string, row: ShopRow): ShopExchangeRate {
  return {
    id: `id-${shopId}-${row.date}`,
    shopId,
    date: fromCalendarDate(row.date),
    storeRate: new Prisma.Decimal(row.storeRate),
    source: row.source,
    updatedById: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  } as ShopExchangeRate;
}

function toCbuRecord(row: CbuRow): CbuRate {
  return {
    id: `cbu-${row.date}`,
    date: fromCalendarDate(row.date),
    rate: new Prisma.Decimal(row.rate),
    fetchedAt: new Date('2026-08-01T00:00:00.000Z'),
  } as CbuRate;
}

/**
 * `shopId = getShopId() ?? DEFAULT_SHOP` — testlarning aksariyati Shop
 * kontekstini ochmaydi (xuddi eski bir-tenantli testlar kabi), shuning
 * uchun ular hammasi bitta "do'kon"ga tushadi. Fan-out testi esa
 * `runWithShopScope` orqali haqiqiy kontekst ochadi va shu bilan HAR
 * Shop o'z qatoriga yozilishini tekshiradi.
 */
function makeService(options: {
  shopRows?: ShopRow[];
  cbuRows?: CbuRow[];
  fetchedCbu?: string | Error;
  shops?: { id: string; storeRateMarkupPercent: string }[];
}) {
  const {
    shopRows = [],
    cbuRows = [],
    fetchedCbu = '12000',
    shops = [{ id: DEFAULT_SHOP, storeRateMarkupPercent: MARKUP }],
  } = options;

  const shopStore = new Map<string, Map<string, ShopExchangeRate>>();
  for (const shop of shops) shopStore.set(shop.id, new Map());
  for (const row of shopRows) {
    shopStore.get(DEFAULT_SHOP)?.set(row.date, toShopRecord(DEFAULT_SHOP, row));
  }
  const cbuStore = new Map(cbuRows.map((row) => [row.date, toCbuRecord(row)]));

  const currentShopStore = (): Map<string, ShopExchangeRate> => {
    const shopId = getShopId() ?? DEFAULT_SHOP;
    let bucket = shopStore.get(shopId);
    if (!bucket) {
      bucket = new Map();
      shopStore.set(shopId, bucket);
    }
    return bucket;
  };

  // Argumentlar ataylab e'lon qilingan: `record(tx, …)` ga `tx` haqiqatan
  // uzatilganini tekshirish uchun chaqiruv argumentlari tipda ko'rinishi
  // kerak (ARCHITECTURE §6 — audit asosiy o'zgarish bilan bitta
  // tranzaksiyada). Argumentsiz `vi.fn()` da `mock.calls[0][0]` bo'sh
  // kortej bo'lib, tekshiruvni yozib bo'lmasdi.
  const audit = {
    record: vi.fn((..._args: unknown[]) => Promise.resolve()),
    recordDetached: vi.fn((..._args: unknown[]) => Promise.resolve()),
  };

  const shopExchangeRateModel = {
    findFirst: ({ where }: { where: { date: Date | { lte: Date } } }) => {
      const store = currentShopStore();
      if (where.date instanceof Date) {
        return Promise.resolve(store.get(toCalendarDate(where.date)) ?? null);
      }
      const limit = toCalendarDate(where.date.lte);
      const match = [...store.values()]
        .filter((row) => toCalendarDate(row.date) <= limit)
        .sort((a, b) => toCalendarDate(b.date).localeCompare(toCalendarDate(a.date)))[0];
      return Promise.resolve(match ?? null);
    },

    findMany: ({ where }: { where: { date: { gte?: Date; lte?: Date } } }) => {
      const store = currentShopStore();
      const rows = [...store.values()].filter((row) => {
        if (where.date.gte && row.date.getTime() < where.date.gte.getTime()) return false;
        if (where.date.lte && row.date.getTime() > where.date.lte.getTime()) return false;
        return true;
      });
      rows.sort((a, b) => b.date.getTime() - a.date.getTime());
      return Promise.resolve(rows);
    },

    update: ({ where, data }: { where: { id: string }; data: Partial<ShopExchangeRate> }) => {
      const store = currentShopStore();
      const existing = [...store.values()].find((row) => row.id === where.id);
      if (!existing) throw new Error('qator yo‘q');
      const next = { ...existing, ...data } as ShopExchangeRate;
      store.set(toCalendarDate(next.date), next);
      return Promise.resolve(next);
    },

    create: ({ data }: { data: Partial<ShopExchangeRate> & { date: Date } }) => {
      const store = currentShopStore();
      const shopId = getShopId() ?? DEFAULT_SHOP;
      const next = toShopRecord(shopId, {
        date: toCalendarDate(data.date),
        storeRate: String(data.storeRate),
        source: data.source as ExchangeRateSource,
      });
      store.set(toCalendarDate(data.date), next);
      return Promise.resolve(next);
    },
  };

  const cbuRateModel = {
    findUnique: ({ where }: { where: { date: Date } }) =>
      Promise.resolve(cbuStore.get(toCalendarDate(where.date)) ?? null),

    findMany: ({ where }: { where: { date: { in: Date[] } } }) =>
      Promise.resolve(
        where.date.in
          .map((date) => cbuStore.get(toCalendarDate(date)))
          .filter((row): row is CbuRate => row !== undefined),
      ),

    upsert: ({
      where,
      update,
      create,
    }: {
      where: { date: Date };
      update: Partial<CbuRate>;
      create: Partial<CbuRate>;
    }) => {
      const key = toCalendarDate(where.date);
      const existing = cbuStore.get(key);
      const next = (
        existing ? { ...existing, ...update } : toCbuRecord({ date: key, rate: String(create.rate) })
      ) as CbuRate;
      cbuStore.set(key, next);
      return Promise.resolve(next);
    },

    count: ({ where }: { where: { date: Date } }) =>
      Promise.resolve(cbuStore.has(toCalendarDate(where.date)) ? 1 : 0),
  };

  const shopModel = {
    findMany: () => Promise.resolve(shops),
  };

  const prisma = {
    shopExchangeRate: shopExchangeRateModel,
    cbuRate: cbuRateModel,
    shop: shopModel,
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ shopExchangeRate: shopExchangeRateModel, cbuRate: cbuRateModel }),
  };

  const service = new ExchangeRatesService(
    prisma as never,
    { get: () => TIMEZONE } as never,
    {
      get: () =>
        Promise.resolve({
          storeRateMarkupPercent:
            shops.find((shop) => shop.id === (getShopId() ?? DEFAULT_SHOP))
              ?.storeRateMarkupPercent ?? MARKUP,
        }),
    } as never,
    {
      fetchUsdRate: () =>
        fetchedCbu instanceof Error
          ? Promise.reject(fetchedCbu)
          : Promise.resolve({ rate: fetchedCbu, date: '' }),
    } as never,
    audit as never,
  );

  return { service, shopStore, cbuStore, audit };
}

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
      const { service } = makeService({
        shopRows: [
          { date: '2026-08-05', storeRate: '12138', source: ExchangeRateSource.CBU },
          { date: '2026-08-07', storeRate: '12189', source: ExchangeRateSource.CBU },
        ],
      });

      const rate = await service.getForDate('2026-08-07');
      expect(rate?.storeRate.toString()).toBe('12189');
    });

    it('qator yo‘q bo‘lsa — undan OLDINGI eng yaqin qator', async () => {
      const { service } = makeService({
        shopRows: [
          { date: '2026-08-05', storeRate: '12138', source: ExchangeRateSource.CBU },
          { date: '2026-08-09', storeRate: '12230', source: ExchangeRateSource.CBU },
        ],
      });

      const rate = await service.getForDate('2026-08-07');
      expect(rate?.storeRate.toString()).toBe('12138');
    });

    it('keyingi kun kursini HECH QACHON olmaydi', async () => {
      const { service } = makeService({
        shopRows: [{ date: '2026-08-09', storeRate: '12230', source: ExchangeRateSource.CBU }],
      });

      // 08-07 uchun faqat 08-09 bor — o'sha kunda mavjud bo'lmagan kurs
      expect(await service.getForDate('2026-08-07')).toBeNull();
    });

    it('kurs umuman bo‘lmasa requireForDate aniq xato beradi', async () => {
      const { service } = makeService({});
      await expect(service.requireForDate('2026-08-07')).rejects.toThrow(AppException);
    });
  });

  describe('getToday (§16.6 — eskirganlik)', () => {
    it('bugungi qator bor — FRESH, isStale false', async () => {
      const { service } = makeService({
        shopRows: [{ date: daysAgo(0), storeRate: '12189', source: ExchangeRateSource.CBU }],
      });

      const result = await service.getToday();
      expect(result.isStale).toBe(false);
      expect(result.staleDays).toBe(0);
      expect(result.staleness).toBe(RateStaleness.FRESH);
    });

    it('1 kun eski — WARN (sun’iy chegara yo‘q)', async () => {
      const { service } = makeService({
        shopRows: [{ date: daysAgo(1), storeRate: '12189', source: ExchangeRateSource.CBU }],
      });

      const result = await service.getToday();
      expect(result.isStale).toBe(true);
      expect(result.staleDays).toBe(1);
      expect(result.staleness).toBe(RateStaleness.WARN);
    });

    it('3 kun eski — CRITICAL', async () => {
      const { service } = makeService({
        shopRows: [{ date: daysAgo(3), storeRate: '12189', source: ExchangeRateSource.CBU }],
      });

      expect((await service.getToday()).staleness).toBe(RateStaleness.CRITICAL);
    });

    it('kurs umuman yo‘q — xato tashlamaydi, savdo to‘xtamaydi (§1.5)', async () => {
      const { service } = makeService({});

      const result = await service.getToday();
      expect(result.rate).toBeNull();
      expect(result.isStale).toBe(true);
      expect(result.staleDays).toBeNull();
      expect(result.staleness).toBe(RateStaleness.CRITICAL);
    });
  });

  describe('syncFromCbu (§3.3, §16.2, §16.8) — joriy Shop', () => {
    const actor = { id: 'user-1' } as never;

    it('do‘kon kursini ustama bo‘yicha hisoblab yozadi', async () => {
      const { service, shopStore } = makeService({ fetchedCbu: '12000' });

      const result = await service.syncFromCbu({ actor, ip: '::1' });
      expect(result.outcome).toBe('WRITTEN');

      const saved = shopStore.get(DEFAULT_SHOP)?.get(today(TIMEZONE));
      // 12000 × 1.02 = 12240
      expect(saved?.storeRate.toString()).toBe('12240');
      expect(saved?.source).toBe(ExchangeRateSource.CBU);
    });

    it('MANUAL kursga TEGMAYDI — cbu_rates baribir yangilanadi (§16.8)', async () => {
      const { service, shopStore, cbuStore } = makeService({
        shopRows: [
          { date: today(TIMEZONE), storeRate: '12500', source: ExchangeRateSource.MANUAL },
        ],
        fetchedCbu: '12000',
      });

      const result = await service.syncFromCbu({ actor, ip: '::1' });
      expect(result.outcome).toBe('MANUAL_PRESERVED');

      const saved = shopStore.get(DEFAULT_SHOP)?.get(today(TIMEZONE));
      // Ega qo'ygan kurs daxlsiz qoldi
      expect(saved?.storeRate.toString()).toBe('12500');
      expect(saved?.source).toBe(ExchangeRateSource.MANUAL);
      // CBU (platforma darajasidagi) qiymati esa baribir yangilandi
      expect(cbuStore.get(today(TIMEZONE))?.rate.toString()).toBe('12000');
    });

    it('resetToCbu — MANUAL dan chiqish yo‘li bor (§16.8)', async () => {
      const { service, shopStore, audit } = makeService({
        shopRows: [
          { date: '2026-08-10', storeRate: '12500', source: ExchangeRateSource.MANUAL },
        ],
        cbuRows: [{ date: '2026-08-10', rate: '11952.1' }],
      });

      const result = await service.resetToCbu('2026-08-10', actor, '::1');

      // 11952.1 × 1.02 = 12191.142 → 12191
      expect(result.storeRate).toBe('12191');
      expect(result.source).toBe(ExchangeRateSource.CBU);
      expect(shopStore.get(DEFAULT_SHOP)?.get('2026-08-10')?.source).toBe(ExchangeRateSource.CBU);
      // §3.10 — kurs o'zgarishi audit'ga tushadi
      expect(audit.record).toHaveBeenCalledOnce();
    });

    it('resetToCbu — CBU qiymati yo‘q bo‘lsa rad etadi, nolga tushirmaydi', async () => {
      const { service } = makeService({
        shopRows: [
          { date: '2026-08-10', storeRate: '12500', source: ExchangeRateSource.MANUAL },
        ],
      });

      try {
        await service.resetToCbu('2026-08-10', actor, null);
        expect.unreachable('xato kutilgan edi');
      } catch (error) {
        expect((error as AppException).code).toBe(ErrorCode.EXCHANGE_RATE_CBU_MISSING);
      }
    });

    it("qo'lda yangilash audit'ga tushadi (§3.10)", async () => {
      const { service, audit } = makeService({ fetchedCbu: '12100' });
      await service.syncFromCbu({ actor, ip: '::1' });

      // ARCHITECTURE §6 — audit asosiy o'zgarish bilan BITTA tranzaksiyada,
      // ya'ni `record(tx, …)`. `recordDetached` faqat o'qish amallari uchun
      // (`audit.service.ts`); kurs o'zgarishi esa yozuv amali, shuning uchun
      // u yerda ishlatilishi tranzaksiya kafolatini buzardi.
      expect(audit.record).toHaveBeenCalledOnce();
      expect(audit.recordDetached).not.toHaveBeenCalled();

      // Birinchi argument — tranzaksiya klienti. Buni tekshirmasak, test
      // `record` ga `tx` o'rniga `undefined` uzatilgan holatda ham yashil
      // bo'lardi va T-02 regressiyasi sezilmay o'tardi.
      expect(audit.record.mock.calls[0]?.[0]).toBeDefined();
      expect(audit.record.mock.calls[0]?.[2]).toMatchObject({
        action: 'EXCHANGE_RATE_SYNCED',
      });
    });

    it("qo'lda yangilash MANUAL kursni ham ustidan yozmaydi (§16.8)", async () => {
      const { service, shopStore } = makeService({
        shopRows: [
          { date: today(TIMEZONE), storeRate: '12500', source: ExchangeRateSource.MANUAL },
        ],
        fetchedCbu: '12100',
      });

      const result = await service.syncFromCbu({ actor, ip: null });

      // Ega CBU'ni ko'rishni so'radi, do'kon kursini almashtirishni emas
      expect(result.outcome).toBe('MANUAL_PRESERVED');
      expect(result.rate.storeRate).toBe('12500');
      expect(result.rate.cbuRate).toBe('12100');
      expect(shopStore.get(DEFAULT_SHOP)?.get(today(TIMEZONE))?.source).toBe(
        ExchangeRateSource.MANUAL,
      );
    });

    it('CBU javob bermasa — 503 va tipli xato, 500 emas', async () => {
      const { service, shopStore } = makeService({ fetchedCbu: new Error('ECONNREFUSED') });

      try {
        await service.syncFromCbu({ actor, ip: null });
        expect.unreachable('xato kutilgan edi');
      } catch (error) {
        const exception = error as AppException;
        expect(exception.code).toBe(ErrorCode.EXCHANGE_RATE_FETCH_FAILED);
        expect(exception.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
      }

      // §1.5 — mavjud kurs buzilmaydi
      expect(shopStore.get(DEFAULT_SHOP)?.size ?? 0).toBe(0);
    });

    it('resetToCbu — qator umuman yo‘q bo‘lsa 404', async () => {
      const { service } = makeService({});

      try {
        await service.resetToCbu('2026-08-10', actor, null);
        expect.unreachable('xato kutilgan edi');
      } catch (error) {
        expect((error as AppException).code).toBe(ErrorCode.EXCHANGE_RATE_MISSING);
      }
    });
  });

  describe('syncCbuAndFanOutToAllShops (§14.6, §21.5, §18.4) — kunlik CRON', () => {
    it('cbu_rates BIR MARTA yoziladi, har Shop O‘Z qatoriga', async () => {
      const { service, shopStore, cbuStore, audit } = makeService({
        fetchedCbu: '12000',
        shops: [
          { id: 'shop-a', storeRateMarkupPercent: '2' },
          { id: 'shop-b', storeRateMarkupPercent: '5' },
        ],
      });

      await service.syncCbuAndFanOutToAllShops();

      // Platforma darajasida bitta qator
      expect(cbuStore.size).toBe(1);
      expect(cbuStore.get(today(TIMEZONE))?.rate.toString()).toBe('12000');

      // Har Shop o'z ustamasi bilan MUSTAQIL hisoblangan
      expect(shopStore.get('shop-a')?.get(today(TIMEZONE))?.storeRate.toString()).toBe('12240');
      expect(shopStore.get('shop-b')?.get(today(TIMEZONE))?.storeRate.toString()).toBe('12600');

      // Tizim amali — audit yozilmaydi (§18.4). Ikkala yo'l ham tekshiriladi:
      // `auditSync` `record(tx, …)` ga o'tgandan keyin faqat `recordDetached`
      // ni tekshirish yolg'on yashil beradi.
      expect(audit.record).not.toHaveBeenCalled();
      expect(audit.recordDetached).not.toHaveBeenCalled();
    });

    it('BITTA Shop MANUAL bo‘lsa, faqat O‘SHA Shop saqlanadi, qolgani yangilanadi', async () => {
      const { service, shopStore } = makeService({
        fetchedCbu: '12000',
        shops: [
          { id: 'shop-a', storeRateMarkupPercent: '2' },
          { id: 'shop-b', storeRateMarkupPercent: '5' },
        ],
      });
      // "shop-a" qo'lda kurs qo'ygan — buni to'g'ridan-to'g'ri do'konning
      // xaritasiga qo'shamiz (real hayotda `upsertManual` orqali keladi)
      shopStore.set(
        'shop-a',
        new Map([
          [
            today(TIMEZONE),
            toShopRecord('shop-a', {
              date: today(TIMEZONE),
              storeRate: '99999',
              source: ExchangeRateSource.MANUAL,
            }),
          ],
        ]),
      );

      await service.syncCbuAndFanOutToAllShops();

      expect(shopStore.get('shop-a')?.get(today(TIMEZONE))?.storeRate.toString()).toBe('99999');
      expect(shopStore.get('shop-a')?.get(today(TIMEZONE))?.source).toBe(
        ExchangeRateSource.MANUAL,
      );
      expect(shopStore.get('shop-b')?.get(today(TIMEZONE))?.storeRate.toString()).toBe('12600');
    });
  });
});
