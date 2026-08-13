import { Prisma } from '@prisma/client';
import { ErrorCode } from '@hisobai/contracts';
import { describe, expect, it, vi } from 'vitest';

import { AppException } from '../common/app.exception';
import {
  decideOperation,
  decideTransaction,
  modelPropertyName,
  PrismaService,
  SHOP_SCOPE_EXEMPT_MODELS,
  withShopScope,
} from './prisma.service';
import { runWithoutShopScope, runWithShopScope } from './shop-context';

/**
 * `decideOperation`/`decideTransaction` — `$extends()` orqali Prisma'ga
 * ulanadigan qaror mantig'i, lekin Prisma'ning o'zidan mustaqil (izohga
 * `prisma.service.ts`da qarang). Shu sabab bu yerda haqiqiy klient yoki
 * ulanish kerak emas — `hooks` mock qilinadi.
 */
describe('decideOperation — $allOperations qarori (§14.4, §21.15)', () => {
  it('kontekst yo‘q — bazaga umuman bormaydi (SHOP_CONTEXT_MISSING)', async () => {
    const runDirect = vi.fn();
    const runWrapped = vi.fn();

    await expect(
      decideOperation('Product', 'findMany', { runDirect, runWrapped }),
    ).rejects.toMatchObject({
      code: ErrorCode.SHOP_CONTEXT_MISSING,
    });

    // Eng muhim tekshiruv: hech qanday "so'rov" funksiyasi chaqirilmagan —
    // bazaga umuman murojaat qilinmagan.
    expect(runDirect).not.toHaveBeenCalled();
    expect(runWrapped).not.toHaveBeenCalled();
  });

  it('kontekst yo‘q bo‘lganda xato AppException va 500 statusli', async () => {
    try {
      await decideOperation('Product', 'findMany', {
        runDirect: vi.fn(),
        runWrapped: vi.fn(),
      });
      expect.unreachable('xato kutilgan edi');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      expect((error as AppException).getStatus()).toBe(500);
    }
  });

  it('chiqarilgan model (`SHOP_SCOPE_EXEMPT_MODELS`) kontekstsiz ham to‘g‘ridan-to‘g‘ri o‘tadi', async () => {
    const runDirect = vi.fn(() => Promise.resolve('ok'));
    const runWrapped = vi.fn();

    await expect(decideOperation('User', 'findUnique', { runDirect, runWrapped })).resolves.toBe(
      'ok',
    );
    expect(runDirect).toHaveBeenCalledOnce();
    expect(runWrapped).not.toHaveBeenCalled();
  });

  it('model aniqlanmagan ($queryRaw kabi) — to‘g‘ridan-to‘g‘ri o‘tadi', async () => {
    const runDirect = vi.fn(() => Promise.resolve('ok'));
    await expect(
      decideOperation(undefined, 'queryRaw', { runDirect, runWrapped: vi.fn() }),
    ).resolves.toBe('ok');
    expect(runDirect).toHaveBeenCalledOnce();
  });

  it('runWithoutShopScope ichida chiqarilmagan model ham to‘g‘ridan-to‘g‘ri o‘tadi', async () => {
    const runDirect = vi.fn(() => Promise.resolve('ok'));
    const runWrapped = vi.fn();

    await runWithoutShopScope(async () => {
      await expect(
        decideOperation('Product', 'findMany', { runDirect, runWrapped }),
      ).resolves.toBe('ok');
    });

    expect(runDirect).toHaveBeenCalledOnce();
    expect(runWrapped).not.toHaveBeenCalled();
  });

  it('kontekst bor, tranzaksiya yo‘q — bitta marta o‘raladi (aynan bitta chaqiruv)', async () => {
    const runWrapped = vi.fn((shopId: string) => Promise.resolve(`wrapped:${shopId}`));
    const runDirect = vi.fn();

    await runWithShopScope('shop-1', async () => {
      await expect(
        decideOperation('Product', 'findMany', { runDirect, runWrapped }),
      ).resolves.toBe('wrapped:shop-1');
    });

    expect(runWrapped).toHaveBeenCalledOnce();
    expect(runWrapped).toHaveBeenCalledWith('shop-1');
    expect(runDirect).not.toHaveBeenCalled();
  });

  it('activeTransaction faol bo‘lsa (decideTransaction ichida) qayta o‘ralmaydi — to‘g‘ridan-to‘g‘ri', async () => {
    const runWrapped = vi.fn();
    const runDirect = vi.fn(() => Promise.resolve('direct'));

    await runWithShopScope('shop-1', async () => {
      await decideTransaction({
        setConfig: vi.fn(() => Promise.resolve()),
        run: async () => {
          await expect(
            decideOperation('Product', 'findMany', { runDirect, runWrapped }),
          ).resolves.toBe('direct');
        },
      });
    });

    expect(runDirect).toHaveBeenCalledOnce();
    expect(runWrapped).not.toHaveBeenCalled();
  });
});

/**
 * `decideTransaction` — `client.$transaction` override'ining qarori.
 * §21.15: 23 ta mavjud `$transaction` chaqiruv joyi o'zgarishsiz ishlashi
 * kerak, shu jumladan faqat chiqarilgan modellarga tegadigan (masalan
 * parol o'zgartirish) tranzaksiyalar — ular Shop'siz account uchun ham
 * ishlashi shart.
 */
describe('decideTransaction — client.$transaction qarori', () => {
  it('kontekst bor — set_config bitta marta ishlaydi, keyin run() chaqiriladi', async () => {
    const setConfig = vi.fn(() => Promise.resolve());
    const run = vi.fn(() => Promise.resolve('done'));

    await runWithShopScope('shop-1', async () => {
      await expect(decideTransaction({ setConfig, run })).resolves.toBe('done');
    });

    expect(setConfig).toHaveBeenCalledOnce();
    expect(setConfig).toHaveBeenCalledWith('shop-1');
    expect(run).toHaveBeenCalledOnce();
  });

  it('kontekst yo‘q — set_config yuborilmaydi (transaksiya faqat chiqarilgan modellarga tegishi mumkin)', async () => {
    const setConfig = vi.fn(() => Promise.resolve());
    const run = vi.fn(() => Promise.resolve('done'));

    await expect(decideTransaction({ setConfig, run })).resolves.toBe('done');

    expect(setConfig).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledOnce();
  });

  it('runWithoutShopScope ichida set_config yuborilmaydi', async () => {
    const setConfig = vi.fn(() => Promise.resolve());
    const run = vi.fn(() => Promise.resolve('done'));

    await runWithoutShopScope(async () => {
      await decideTransaction({ setConfig, run });
    });

    expect(setConfig).not.toHaveBeenCalled();
  });

  it('ichma-ich chaqiruvda set_config ikki marta ishlamaydi (nested tranzaksiya taqlidi)', async () => {
    const outerSetConfig = vi.fn(() => Promise.resolve());
    const innerSetConfig = vi.fn(() => Promise.resolve());

    await runWithShopScope('shop-1', async () => {
      await decideTransaction({
        setConfig: outerSetConfig,
        run: async () => {
          // `decideOperation`ning o'zi `activeTransaction` faol bo'lganda
          // `decideTransaction`ga umuman kirmaydi (`runDirect` ishlatadi) —
          // shuning uchun `innerSetConfig` odatda chaqirilmaydi. Bu test
          // shuni ham to'g'ridan-to'g'ri sinaydi: agar kimdir xato bilan
          // ichkarida yana `decideTransaction` chaqirsa ham, u faqat BIR
          // marta o'zining set_config'ini yuboradi — ikkilanish yo'q.
          await decideTransaction({ setConfig: innerSetConfig, run: () => Promise.resolve() });
        },
      });
    });

    expect(outerSetConfig).toHaveBeenCalledOnce();
    expect(innerSetConfig).toHaveBeenCalledOnce();
  });
});

describe('modelPropertyName', () => {
  it('Prisma model nomini klient delegatiga aylantiradi', () => {
    expect(modelPropertyName('Product')).toBe('product');
    expect(modelPropertyName('InventoryItem')).toBe('inventoryItem');
  });
});

/**
 * §21.13 — RLS 27 jadvalni qamraydi (35 modeldan 8 tasi chiqarilgan).
 * Runtime DMMF `@default(dbgenerated(...))`ni olib yurmagani uchun to'liq
 * avtomatik xulosa chiqarib bo'lmaydi (`prisma.service.ts`dagi izohga
 * qarang) — lekin bu test yangi model **RLS ustunisiz va ro'yxatsiz**
 * qo'shilib qolishining oldini oladi: shopId maydoni ham, chiqarilgan
 * ro'yxatda ham yo'q model bo'lsa, test qulaydi.
 */
describe("SHOP_SCOPE_EXEMPT_MODELS — ro'yxat eskirmasligi", () => {
  it('har bir Prisma modeli — yoki chiqarilgan, yoki shopId maydoniga ega', () => {
    const models = Prisma.dmmf.datamodel.models;
    expect(models.length).toBeGreaterThan(0);

    for (const model of models) {
      const hasShopIdField = model.fields.some((field) => field.name === 'shopId');
      const isExempt = SHOP_SCOPE_EXEMPT_MODELS.has(model.name);

      expect(
        hasShopIdField || isExempt,
        `"${model.name}" model'i na "shopId" maydoniga ega, na SHOP_SCOPE_EXEMPT_MODELS'da — ` +
          'yangi model RLS\'siz qolib ketmasligi uchun ikkisidan biri bo\'lishi shart.',
      ).toBe(true);
    }
  });

  it('chiqarilgan modellarning barchasi haqiqatan ham schema’da mavjud (yozuv xatosi yo‘q)', () => {
    const names = new Set(Prisma.dmmf.datamodel.models.map((model) => model.name));
    for (const exempt of SHOP_SCOPE_EXEMPT_MODELS) {
      expect(names.has(exempt), `"${exempt}" Prisma sxemasida topilmadi`).toBe(true);
    }
  });

  it('27 ta shop-scoped model qoladi (35 jami − 8 chiqarilgan)', () => {
    const total = Prisma.dmmf.datamodel.models.length;
    expect(total - SHOP_SCOPE_EXEMPT_MODELS.size).toBe(27);
  });
});

/**
 * `withShopScope` — Prisma'ning HAQIQIY `$extends()` zanjiri bilan sim
 * (`decideOperation`/`decideTransaction`ning o'zi mock bilan yuqorida
 * sinalgan). `$extends()` hech qanday tarmoq so'rovi yubormaydi — faqat
 * haqiqiy so'rov (`$connect`/query) ulanish talab qiladi, shuning uchun
 * bazaga ulanmasdan sinash mumkin: `base.$transaction` shu yerda mock
 * qilinadi, DB'ga umuman chiqilmaydi.
 */
describe('withShopScope — haqiqiy $extends zanjiri (DB’siz)', () => {
  function makeBase(): PrismaService {
    // Konstruktor faqat `DATABASE_URL` borligini tekshiradi va adapterni
    // yaratadi — hech qanday tarmoq ulanishi qilmaydi ($connect() alohida).
    process.env.DATABASE_URL ??= 'postgresql://fake:fake@127.0.0.1:1/fake';
    return new PrismaService();
  }

  it('kengaytirilgan klientda model delegatlari va $transaction saqlanadi', () => {
    const scoped = withShopScope(makeBase());
    expect(typeof scoped.product.findMany).toBe('function');
    expect(typeof scoped.$transaction).toBe('function');
  });

  it('$transaction ning batch shakli jimgina o‘tmaydi, xato tashlaydi', async () => {
    const base = makeBase();
    const txSpy = vi.spyOn(base, '$transaction');
    const scoped = withShopScope(base);

    // Batch shaklda `set_config` uchun joy yo'q. O'tkazib yuborilsa, RLS
    // yoqilgan holda so'rov xato emas, BO'SH natija qaytarardi — §21.15
    // aynan shuni rad etadi. Kontekst BOR bo'lsa ham xato tashlanishi
    // kerak: muammo kontekstda emas, shaklning o'zida.
    //
    // Xato SINXRON tashlanadi, promise rad etilishi bilan emas — bu ish
    // vaqtidagi holat emas, chaqiruv joyidagi dasturchi xatosi, va u
    // `.catch()` ga tushib yo'qolmasligi kerak.
    expect(() =>
      runWithShopScope('shop-1', () =>
        (scoped.$transaction as unknown as (a: unknown[]) => Promise<unknown>)([]),
      ),
    ).toThrowError(expect.objectContaining({ code: ErrorCode.SHOP_CONTEXT_MISSING }));

    expect(txSpy).not.toHaveBeenCalled();
  });

  it('kontekstsiz o‘qish bazaga bormasdan SHOP_CONTEXT_MISSING tashlaydi', async () => {
    const base = makeBase();
    const txSpy = vi.spyOn(base, '$transaction');
    const scoped = withShopScope(base);

    await expect(scoped.product.findMany({})).rejects.toMatchObject({
      code: ErrorCode.SHOP_CONTEXT_MISSING,
    });
    expect(txSpy).not.toHaveBeenCalled();
  });

  it('kontekst bilan o‘qish base.$transaction orqali ANIQ BIR marta qayta yuboriladi', async () => {
    const base = makeBase();
    const rows = [{ id: 'p-1' }];
    const executeRaw = vi.fn(() => Promise.resolve(0));
    const findMany = vi.fn(() => Promise.resolve(rows));

    // `base.$transaction` mock qilinadi: haqiqiy tranzaksiya ochish o'rniga
    // to'g'ridan-to'g'ri fake `tx` bilan chaqiradi. Shu bilan birga bu
    // rekursiya yo'qligini kafolatlaydi — agar kod xato bilan `scoped`
    // (kengaytirilgan) klient orqali qayta yuborsa, `findMany` chaqiruvi
    // yana `$allOperations`ga tushib, kontekst borligi sababli яна
    // `base.$transaction`ni chaqirar edi va bu spy ikki marta chaqirilgan
    // bo'lardi (yoki `product` xossasi fake `tx`da yo'qligi sababli xato
    // berardi).
    const txSpy = vi.spyOn(base, '$transaction').mockImplementation(async (fn: unknown) => {
      const fakeTx = {
        $executeRaw: executeRaw,
        product: { findMany },
      };
      return (fn as (tx: unknown) => Promise<unknown>)(fakeTx);
    });

    const scoped = withShopScope(base);

    // Diqqat: Prisma'ning qaytargan qiymati "lazy" `PrismaPromise` —
    // haqiqiy ish faqat `.then()`/`await` chaqirilganda boshlanadi. Shuning
    // uchun `await` `runWithShopScope()` CHAQIRUVI ICHIDA bo'lishi shart
    // (`async () => { await ... }`), aks holda Prisma'ning ichki ishi
    // `AsyncLocalStorage` doirasidan TASHQARIDA boshlanib, kontekst
    // ko'rinmay qolardi — bu ayni shu testni yozishda topilgan haqiqiy
    // nozik nuqta (ishlab chiqarishda `ShopContextInterceptor` buni
    // `next.handle().subscribe(...)`ni `runWithShopScope()` ICHIDA
    // chaqirib to'g'ri hal qiladi).
    const result = await runWithShopScope('shop-1', async () => {
      // Aynan shu yerdagi `await` (return emas) muhim — izohga qarang.
      return await scoped.product.findMany({ take: 5 });
    });

    expect(result).toEqual(rows);
    expect(txSpy).toHaveBeenCalledOnce();
    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany).toHaveBeenCalledWith({ take: 5 });
  });

  it('23 ta $transaction chaqiruv joyi kabi: interaktiv tranzaksiya set_config’ni bitta marta yuboradi', async () => {
    const base = makeBase();
    const executeRaw = vi.fn(() => Promise.resolve(0));
    const saleUpdate = vi.fn((_args: unknown) => Promise.resolve({ id: 'sale-1' }));

    vi.spyOn(base, '$transaction').mockImplementation(async (fn: unknown) => {
      const fakeTx = { $executeRaw: executeRaw, sale: { update: saleUpdate } };
      return (fn as (tx: unknown) => Promise<unknown>)(fakeTx);
    });

    const scoped = withShopScope(base);

    await runWithShopScope('shop-1', () =>
      scoped.$transaction(async (tx) => {
        // Mavjud 23 ta chaqiruv joyi kabi: `tx.model.op()` to'g'ridan-to'g'ri.
        return (tx as unknown as { sale: { update: typeof saleUpdate } }).sale.update({
          where: { id: 'sale-1' },
        });
      }),
    );

    expect(executeRaw).toHaveBeenCalledOnce();
    expect(saleUpdate).toHaveBeenCalledOnce();
  });
});
