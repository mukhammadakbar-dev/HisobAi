import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { ErrorCode } from '@hisobai/contracts';
import { Prisma, PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'node:async_hooks';

import { AppException } from '../common/app.exception';
import { getShopId, isNoShopScope } from './shop-context';

/**
 * Prisma 7 da ulanish schema faylidan emas, driver adapteridan keladi.
 * `DATABASE_URL` shu yerda o'qiladi — CLI tomoni esa `prisma.config.ts`da.
 *
 * **Bu klass — bazaviy (kengaytirilmagan) klient.** NestJS DI'ga `PrismaService`
 * nomi ostida taqdim etiladigan haqiqiy obyekt esa quyidagi
 * `withShopScope()` funksiyasi qaytargan **kengaytirilgan** klient
 * (`database.module.ts`ga qarang). Ikkalasi ham shu klassning bir xil
 * prototipiga tayanadi — `$extends()` asl instance metodlarini
 * (`onModuleInit`/`onModuleDestroy`) saqlab qoladi, shuning uchun Nest'ning
 * lifecycle hook'lari kengaytirilgan obyektda ham ishlayveradi.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL majburiy — apps/api/.env faylini tekshiring');
    }
    super({ adapter: new PrismaPg({ connectionString }) });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('PostgreSQL ulanishi tayyor');
    } catch (error) {
      // Noto'g'ri DATABASE_URL bilan jimgina ishlashdan ko'ra, sababi bilan yiqilamiz.
      this.logger.error(
        `PostgreSQL ulanmadi. DATABASE_URL ni tekshiring. ${(error as Error).message}`,
      );
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

/**
 * RLS siyosati qamragan modellar (§21.13) — `shop_id` ustuni va
 * `NULLIF(current_setting('app.current_shop_id', true), '')` DEFAULT'i
 * bor 27 jadval — shu ro'yxatdan **chiqarilgan**.
 *
 * Bu 8 model chiqarilgan sabab bir xil emas:
 *  - `User`, `Session`, `LoginAttempt`, `PasswordResetToken` — Auth ularni
 *    Shop konteksti mavjud bo'lishidan OLDIN o'qiydi (login jarayonining
 *    o'zi), shuning uchun ular tenant tushunchasidan mustaqil bo'lishi SHART;
 *  - `Shop` — tenant chegarasining o'zi, o'ziga tegishli emas;
 *  - `PlatformAdmin`, `PlatformSession` — umuman Shop'ga aloqasi yo'q (§21.3);
 *  - `CbuRate` — platforma darajasida, Shop'lar orasida umumiy (§14.6).
 *
 * **Ro'yxat eskirib qolmasligi uchun** (`prisma.service.spec.ts`ga qarang):
 * test har bir Prisma modelini `Prisma.dmmf.datamodel.models`dan o'qiydi va
 * "shu ro'yxatda BOR" yoki "`shopId` nomli maydoni BOR" ekanini tasdiqlaydi.
 * Runtime DMMF `@default(dbgenerated(...))` ifodasini olib yurmaydi (Prisma
 * 7 klient tomonidagi DMMF'ni qisqartirgan), shuning uchun to'liq avtomatik
 * xulosa chiqarib bo'lmaydi — lekin bu test yangi model RLS'siz **va**
 * ro'yxatsiz qo'shilib qolishining oldini oladi: ikkalasi ham yo'q bo'lsa
 * test qulaydi va qo'shuvchi ongli tanlov qilishga majbur bo'ladi. `User`
 * modeli maxsus holat: unda `shopId` maydoni BOR (nullable FK, §21.10), lekin
 * u RLS default'iga ega EMAS — shuning uchun avtomatik "maydon nomi bor =
 * scoped" qoidasi yetarli emas va model shu yerda qo'lda sanaladi.
 */
export const SHOP_SCOPE_EXEMPT_MODELS: ReadonlySet<string> = new Set([
  'User',
  'Shop',
  'PlatformAdmin',
  'PlatformSession',
  'Session',
  'LoginAttempt',
  'PasswordResetToken',
  'CbuRate',
]);

/** `Product` → `product`. Prisma model nomi bilan klient delegati o'rtasidagi yagona farq. */
export function modelPropertyName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

function shopContextMissing(model: string, operation: string): AppException {
  return AppException.internal(
    ErrorCode.SHOP_CONTEXT_MISSING,
    `Shop konteksti yo'q: ${model}.${operation} kontekstsiz chaqirildi.`,
  );
}

type ModelDelegate = Record<string, (args: unknown) => unknown>;
type TransactionCallback = (tx: Prisma.TransactionClient) => Promise<unknown>;

/**
 * Ichki (eksport qilinmaydigan) belgi: hozir `$transaction` orqali ochilgan
 * boshqariluvchi tranzaksiya ichidamizmi.
 *
 * Bu `shop-context.ts` dagi Shop kontekstidan MUSTAQIL — u "qaysi Shop"ni
 * bilsa, bu "set_config allaqachon shu ulanishda ishladimi"ni biladi.
 * Ikkalasi aralashtirilmasligi kerak: `runWithoutShopScope()` ichida ham
 * tranzaksiya ochilishi mumkin (Platform moduli), lekin u yerda `shopId`
 * yo'q — shuning uchun alohida ALS.
 */
const activeTransaction = new AsyncLocalStorage<true>();

/**
 * `$allOperations`ning uch tarmoqli qarori (§14.4, §21.15) — **Prisma'ning
 * `$extends()` mashinasidan ATAYLAB ajratilgan, sof funksiya** sifatida.
 * Sabab: Prisma extension API'sini haqiqiy (ulanmagan bo'lsa ham) klient
 * bo'lmasdan turib to'g'ri simulyatsiya qilib bo'lmaydi — uni test qilish
 * yoki Prisma runtime'ining o'zini sinash, yoki qaror mantig'ini undan
 * ajratib, alohida sinash kerak. Ikkinchisi tanlandi: bu funksiya birorta
 * ham Prisma turi yoki obyektiga tegmaydi, faqat `hooks` orqali beriladigan
 * ikkita amal ("to'g'ridan-to'g'ri bajar" va "tranzaksiyaga o'rab bajar")
 * orasida tanlov qiladi — `prisma.service.spec.ts` shuni to'g'ridan-to'g'ri
 * (mock `hooks` bilan) sinaydi, haqiqiy bazaga tegmasdan.
 */
export async function decideOperation<T>(
  model: string | undefined,
  operation: string,
  hooks: {
    /** Kontekstsiz yoki chiqarilgan model — to'g'ridan-to'g'ri bajariladi. */
    runDirect: () => Promise<T>;
    /** Kontekst bor, tranzaksiya yo'q — shaffof tranzaksiyaga o'raladi. */
    runWrapped: (shopId: string) => Promise<T>;
  },
): Promise<T> {
  if (model === undefined || SHOP_SCOPE_EXEMPT_MODELS.has(model) || isNoShopScope()) {
    return hooks.runDirect();
  }

  const shopId = getShopId();
  if (shopId === null) {
    // **Bazaga umuman bormaydi**: na `runDirect`, na `runWrapped`
    // chaqiriladi — xato shu yerda, so'rov yuborilishidan OLDIN tashlanadi.
    throw shopContextMissing(model, operation);
  }

  if (activeTransaction.getStore() === true) {
    // Tranzaksiya ichidamiz va `set_config` allaqachon uning boshida
    // ishlagan (`decideTransaction`ga qarang) — qayta o'rash SHART EMAS.
    // Aksincha o'rasak, hali tugamagan tashqi tranzaksiya band qilgan
    // qatorni kutib turadigan YANGI tranzaksiya ochilardi — bitta so'rov
    // o'zini o'zi qulflab qo'yardi (self-deadlock).
    return hooks.runDirect();
  }

  return hooks.runWrapped(shopId);
}

/**
 * `client.$transaction` override'ining qarori — xuddi `decideOperation`
 * kabi sof funksiya (yuqoridagi izohga qarang).
 *
 * ShopId bor-yo'qligini OLDINDAN talab QILMAYDI: 23 ta chaqiruv joyidan
 * ba'zilari (masalan parol o'zgartirish) faqat chiqarilgan modellarga
 * tegadi va Shop'siz foydalanuvchi uchun ham ishlashi kerak. `setConfig`
 * faqat kontekst mavjud bo'lsa chaqiriladi; kontekst yo'q bo'lganda
 * tranzaksiya ichida chiqarilmagan modelga tegilsa, xato `decideOperation`da,
 * aynan o'sha operatsiyada chiqadi — tranzaksiya boshida emas.
 */
export async function decideTransaction<T>(hooks: {
  setConfig: (shopId: string) => Promise<void>;
  run: () => Promise<T>;
}): Promise<T> {
  if (!isNoShopScope()) {
    const shopId = getShopId();
    if (shopId !== null) {
      await hooks.setConfig(shopId);
    }
  }
  return activeTransaction.run(true, hooks.run);
}

/**
 * Shop-scope Prisma extension'i (§21.7, §21.13–§21.15, `ARCHITECTURE.md` §14.4).
 *
 * Ikki qatlamli extension zanjiri sifatida qurilgan — sabab shunchaki uslub
 * emas, texnik zaruriyat:
 *
 *  1. `queried` — `$allOperations` bilan HAR BIR model amalini ushlaydi
 *     (qarorning o'zi `decideOperation`da).
 *  2. `withTx` — `client.$transaction`'ni ustidan yozadi (qarori
 *     `decideTransaction`da) va `queried`'ning **default** (o'zgartirilmagan)
 *     `$transaction`'iga (`ctx.$parent`) delegatsiya qiladi.
 *
 * Nega ikkita qatlam: agar `$transaction`'ni to'g'ridan-to'g'ri bazaviy
 * `base.$transaction()`'ga yo'naltirsak, callback'ga uzatiladigan `tx`
 * **kengaytirilmagan** bo'lib qoladi — ya'ni `tx.sale.findUnique(...)` kabi
 * ichki chaqiruvlar `$allOperations`'dan umuman o'tmay qoladi va ular uchun
 * `SHOP_CONTEXT_MISSING` tekshiruvi ham, boshqa hech narsa ham ishlamaydi.
 * Prisma'ning o'zi esa (tekshirilgan — quyidagi izohga qarang): kengaytirilgan
 * klientning STANDART `$transaction`'i chaqirilganda, callback'ga
 * uzatiladigan `tx` HAM kengaytirilgan bo'ladi va ichidagi chaqiruvlar
 * `$allOperations`'ga qaytadan tushadi. Shuning uchun `withTx.$transaction`
 * o'zi emas, `ctx.$parent.$transaction` (ya'ni `queried`'ning standart
 * tranzaksiyasi) chaqiriladi — natijada callback ichidagi `tx.model.op()`
 * ham `$allOperations`'dan o'tadi, va biz ularni `activeTransaction` belgisi
 * bilan "allaqachon konfiguratsiya qilingan" deb belgilay olamiz.
 *
 * Bu ikki xulosa Prisma 7.9.1'da qo'lda tekshirilgan (node REPL, haqiqiy
 * ulanish bilan): (a) `ext.$extends({client:{$transaction(){...}}})` orqali
 * override qilinganda, `Prisma.getExtensionContext(this).$parent` — bevosita
 * ustidagi qatlam (bazaviy klient emas); (b) shu `$parent.$transaction(fn)`
 * chaqirilganda, `fn`ga uzatiladigan `tx` ham `$parent`dagi `$allOperations`ni
 * saqlab qoladi. Ikkalasi ham Prisma hujjatlarida yozilmagan ichki xulq —
 * versiya yangilanganda qayta tekshirilishi kerak.
 *
 * Qayta yuborish (`decideOperation.runWrapped`) esa **bazaviy klient**
 * (`base`, hech qanday extension'siz) orqali — kengaytirilgan klient orqali
 * bo'lganda extension o'zini cheksiz chaqirardi.
 */
export function withShopScope(base: PrismaService): PrismaService {
  const queried = base.$extends({
    name: 'hisobai-shop-scope-query',
    query: {
      $allModels: {
        $allOperations({ model, operation, args, query }) {
          return decideOperation(model, operation, {
            runDirect: () => query(args),
            runWrapped: (shopId) =>
              base.$transaction(async (tx) => {
                await tx.$executeRaw`SELECT set_config('app.current_shop_id', ${shopId}, true)`;
                const delegate = (tx as unknown as Record<string, ModelDelegate>)[
                  modelPropertyName(model as string)
                ] as ModelDelegate;
                const method = delegate[operation] as (a: unknown) => unknown;
                return method(args);
              }),
          });
        },
      },
    },
  });

  const withTx = queried.$extends({
    name: 'hisobai-shop-scope-transaction',
    client: {
      $transaction(...args: unknown[]) {
        const parent = (Prisma.getExtensionContext(this) as { $parent: typeof queried }).$parent;

        if (typeof args[0] !== 'function') {
          // Batch shakl — `prisma.$transaction([p1, p2, ...])`. Kod bazasida
          // ISHLATILMAYDI (tekshirilgan: `grep -rn '\$transaction('`) va
          // ataylab QO'LLAB-QUVVATLANMAYDI: bu yo'lda `set_config` ishlash
          // uchun joy yo'q — massivdagi promise'lar tranzaksiya ochilishidan
          // OLDIN yaratiladi.
          //
          // O'tkazib yuborish xavfli bo'lardi: RLS yoqilgan holda
          // `set_config`siz so'rov xato bermaydi, **bo'sh natija** qaytaradi
          // (§21.15). Ya'ni keyinchalik kimdir batch shaklni ishlatsa, kod
          // ishlayotgandek ko'rinardi va faqat "nega ro'yxat bo'sh?" degan
          // savol qolardi. Shuning uchun bu yerda balandan yiqilamiz.
          throw AppException.internal(
            ErrorCode.SHOP_CONTEXT_MISSING,
            "$transaction ning batch shakli qo'llab-quvvatlanmaydi — " +
              'interaktiv shaklni ishlating: $transaction(async (tx) => …).',
          );
        }

        const [fn, options] = args as [TransactionCallback, Record<string, unknown>?];

        return parent.$transaction(
          (tx) =>
            decideTransaction({
              setConfig: async (shopId) => {
                await tx.$executeRaw`SELECT set_config('app.current_shop_id', ${shopId}, true)`;
              },
              // `tx` — `queried` (bizning `$allOperations`imizni saqlagan) kengaytmasining
              // o'z tranzaksiya klienti; strukturaviy jihatdan `Prisma.TransactionClient`
              // bilan bir xil (barcha model delegatlari bor), lekin Prisma buni
              // extension-xos tip sifatida chiqaradi — shuning uchun aniq moslashtirish.
              run: () => fn(tx as unknown as Prisma.TransactionClient),
            }),
          options,
        );
      },
    },
  });

  return withTx as unknown as PrismaService;
}
