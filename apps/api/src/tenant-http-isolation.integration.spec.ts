import { randomUUID } from 'node:crypto';

import { HttpStatus, VersioningType } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Currency, PaymentMethod, Prisma, SaleKind, SaleStatus } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { AppModule } from './app.module';
import type { Env } from './config/env';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME } from './common/csrf.guard';
import { createSessionToken, hashSessionToken } from './common/session-token';
import { PrismaService } from './database/prisma.service';
import { runWithShopScope } from './database/shop-context';

/**
 * HTTP darajasida cross-Shop IDOR (TZ §25.11, ARCHITECTURE §14.8, §25.12).
 *
 * `database/tenant-isolation.integration.spec.ts` chegarani **Prisma
 * qatlamida** isbotlaydi — u yerda `SessionGuard`, `RolesGuard`,
 * `ShopContextInterceptor`, `CsrfGuard`, marshrutlash umuman yo'q, faqat
 * to'g'ridan-to'g'ri `withShopScope()` klienti va RLS. Ya'ni sessiya
 * cookie'sidan RLS'gacha bo'lgan haqiqiy zanjir hech qachon uchma-uch
 * tekshirilmagan edi. Shu fayl aynan o'sha bo'shliqni yopadi: haqiqiy
 * HTTP so'rov, haqiqiy guard/interceptor zanjiri, haqiqiy PostgreSQL.
 *
 * **MUHIM — DEV BAZASINI HIMOYA QILISH.** `PrismaService`
 * (`database/prisma.service.ts:37`) konstruktorda `process.env.DATABASE_URL_APP`
 * ni o'qiydi — bu development bazasi. `DatabaseModule`dagi
 * `new PrismaService()` chaqiruvi Nest DI konteyneri provayderlarni
 * bog'lash (`compile()`) bosqichida ishga tushadi, ya'ni muhit
 * o'zgaruvchisi ANIQ SHU chaqiruvdan OLDIN — `beforeAll` ichida,
 * `Test.createTestingModule(...)` chaqirilishidan OLDIN — almashtirilishi
 * SHART. Aks holda ilova development bazasiga ulanib, undagi haqiqiy
 * qatorlarni Shop fixturasi bilan ifloslantirar edi. Test tugagach
 * asl qiymat `afterAll`da tiklanadi — boshqa integratsiya fayllari yoki
 * shu jarayonda ishlaydigan boshqa kod shu o'zgaruvchiga tayanishi mumkin.
 *
 * `database/tenant-isolation.integration.spec.ts` bilan bir xil sabablarga
 * ko'ra: ulanish **`hisobai_app`** (`DATABASE_URL_TEST`) orqali —
 * superuser `FORCE ROW LEVEL SECURITY`ni chetlab o'tardi — va
 * `DATABASE_URL_TEST` yo'q bo'lsa butun blok `describe.skipIf` bilan
 * o'tkazib yuboriladi: bazasiz mashinada `pnpm test` yashil qolishi kerak
 * (`prisma/README-test-db.md`).
 *
 * `inShop()` yordamchisi asl integratsiya faylidan ATAYLAB QAYTA
 * YOZILGAN, import qilinmagan: ikkalasi ham mustaqil, bir-biriga
 * bog'liq bo'lmagan test fayllari — birini o'zgartirish ikkinchisini
 * kutilmaganda sindirmasligi kerak. Yordamchining o'zi uch qatordan
 * iborat, alohida modulga chiqarish import zanjiri qo'shishdan boshqa
 * naf bermaydi.
 */

const TEST_URL = process.env.DATABASE_URL_TEST;

/** Har ishga tushirishda o'ziga xos — parallel testlar bir-birining qatorini ko'rmasin. */
const RUN = Date.now().toString(36);

/**
 * Kontekst ichida `await` qilish SHART — sabab
 * `database/tenant-isolation.integration.spec.ts` dagi bir xil nomli
 * funksiya ustidagi izohda batafsil: Prisma so'rovlari lazy, `await`siz
 * `AsyncLocalStorage` konteksti so'rov jo'natilishidan OLDIN yopiladi.
 */
function inShop<T>(shopId: string, fn: () => Promise<T>): Promise<T> {
  return runWithShopScope(shopId, async () => await fn());
}

/**
 * Double-submit CSRF (`common/csrf.guard.ts`) faqat cookie va sarlavha
 * QIYMATI bir xilligini tekshiradi — kriptografik imzo emas, real
 * generatsiya (`createCsrfToken()`) shart emas. Har ikkala Shop bir xil
 * qiymatdan foydalanishi xavfsiz: bu ikki mustaqil so'rov, umumiy holat yo'q.
 */
const CSRF_TOKEN_VALUE = 'http-isolation-test-csrf-token';

interface ShopFixtures {
  readonly customerId: string;
  /** Naqd, tasdiqlangan — GET/PATCH/DELETE/confirm/return/cancel uchun umumiy. */
  readonly saleId: string;
  readonly contractId: string;
  readonly paymentId: string;
}

interface Actor {
  readonly sessionToken: string;
  readonly fixtures: ShopFixtures;
}

/** Bitta Shop uchun: SHOP_ADMIN + sessiya + minimal biznes yozuvlar. */
async function buildActor(prisma: PrismaService, shopId: string, tag: string): Promise<Actor> {
  const user = await prisma.user.create({
    data: {
      email: `shop-admin-${tag}@hisobai-http-isolation.test`,
      // Login bu faylda umuman ishlatilmaydi (sessiya to'g'ridan-to'g'ri
      // bazaga yoziladi) — haqiqiy Argon2id hash hisoblashning hojati yo'q.
      passwordHash: 'unused-in-http-isolation-test',
      displayName: `SHOP_ADMIN ${tag}`,
      role: 'SHOP_ADMIN',
      shopId,
    },
  });

  const sessionToken = createSessionToken();
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hashSessionToken(sessionToken),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  const fixtures = await inShop(shopId, async () => {
    /**
     * `PaymentsService.create()` va `SaleConfirmationService.confirm()`
     * kurs bazasidan `ExchangeRatesService.requireForDate()` orqali
     * tranzaksiyadan TASHQARIDA o'qiydi (§1.7, §17.11) — bu chaqiruv
     * `contractId` tekshiruvidan HAM OLDIN turadi. Kursi yo'q Shop uchun
     * `POST /payments` cross-Shop testi kutilgan `NOT_FOUND` o'rniga
     * `EXCHANGE_RATE_MISSING` bilan yiqiladi — bu holat kurs yo'qligi
     * uchun, cross-Shop himoyasi ishlamagani uchun EMAS. Shuning uchun
     * har ikkala Shop uchun ham eski (har doim "o'tgan") sana bilan
     * kurs oldindan yoziladi: `getForDate` `date <= berilgan sana`
     * bo'yicha ENG YAQIN qatorni qidiradi, ya'ni aniq bugungi sana
     * shart emas.
     */
    await prisma.shopExchangeRate.create({
      data: { date: new Date('2020-01-01T00:00:00.000Z'), storeRate: new Prisma.Decimal('12500') },
    });

    const customer = await prisma.customer.create({
      data: { fullName: `Mijoz ${tag}`, phonePrimary: `+9989${tag.slice(-8)}` },
    });

    const sale = await prisma.sale.create({
      data: {
        kind: SaleKind.CASH,
        status: SaleStatus.CONFIRMED,
        currency: Currency.UZS,
        exchangeRate: new Prisma.Decimal('12500'),
        total: new Prisma.Decimal('500000'),
        soldAt: new Date(),
        confirmedAt: new Date(),
        number: `HTTP-${tag}`,
        customerId: customer.id,
      },
    });

    // Shartnoma zanjiri (installments/payments marshrutlari uchun) —
    // `database/tenant-isolation.integration.spec.ts` dagi `PaymentSchedule`
    // fixturasi bilan bir xil naqsh (§21.29 kompozit-FK).
    const installmentSale = await prisma.sale.create({
      data: {
        kind: SaleKind.INSTALLMENT,
        status: SaleStatus.CONFIRMED,
        currency: Currency.UZS,
        exchangeRate: new Prisma.Decimal('12500'),
        total: new Prisma.Decimal('1000000'),
        soldAt: new Date(),
        confirmedAt: new Date(),
        number: `HTTP-INST-${tag}`,
        customerId: customer.id,
      },
    });

    const contract = await prisma.installmentContract.create({
      data: {
        saleId: installmentSale.id,
        currency: Currency.UZS,
        cashPrice: new Prisma.Decimal('1000000'),
        markupAmount: new Prisma.Decimal('0'),
        principal: new Prisma.Decimal('1000000'),
        downPayment: new Prisma.Decimal('0'),
      },
    });

    await prisma.paymentSchedule.create({
      data: {
        contractId: contract.id,
        sequence: 1,
        dueDate: new Date('2027-01-15T00:00:00.000Z'),
        amountDue: new Prisma.Decimal('1000000'),
      },
    });

    const payment = await prisma.payment.create({
      data: {
        contractId: contract.id,
        paidAmount: new Prisma.Decimal('100000'),
        paidCurrency: Currency.UZS,
        exchangeRate: new Prisma.Decimal('12500'),
        appliedAmount: new Prisma.Decimal('100000'),
        appliedCurrency: Currency.UZS,
        method: PaymentMethod.CASH,
        paidAt: new Date(),
      },
    });

    return { customerId: customer.id, saleId: sale.id, contractId: contract.id, paymentId: payment.id };
  });

  return { sessionToken, fixtures };
}

/**
 * Bitta "kirgan" foydalanuvchi nomidan so'rov yuboruvchi mijoz.
 *
 * CSRF sarlavhasi faqat o'zgartiruvchi metodlarga (`csrf.guard.ts`dagi
 * `MUTATING_METHODS`ga mos) qo'yiladi — `GET`ga qo'yish zararsiz bo'lardi,
 * lekin haqiqiy oqimni aniqroq taqlid qilish uchun faqat kerakli joyda.
 */
function httpAs(app: INestApplication, cookieName: string, sessionToken: string) {
  const server = app.getHttpServer() as Parameters<typeof request>[0];
  const cookie = `${cookieName}=${sessionToken}; ${CSRF_COOKIE_NAME}=${CSRF_TOKEN_VALUE}`;

  return {
    get: (path: string) => request(server).get(path).set('Cookie', cookie),
    post: (path: string) =>
      request(server).post(path).set('Cookie', cookie).set(CSRF_HEADER_NAME, CSRF_TOKEN_VALUE),
    patch: (path: string) =>
      request(server).patch(path).set('Cookie', cookie).set(CSRF_HEADER_NAME, CSRF_TOKEN_VALUE),
    delete: (path: string) =>
      request(server).delete(path).set('Cookie', cookie).set(CSRF_HEADER_NAME, CSRF_TOKEN_VALUE),
  };
}

describe.skipIf(!TEST_URL)('HTTP cross-Shop IDOR (haqiqiy Nest zanjiri, hisobai_app)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let originalDatabaseUrlApp: string | undefined;

  let shopAId: string;
  let shopBId: string;
  let actorA: Actor;
  let actorB: Actor;
  let asA: ReturnType<typeof httpAs>;

  beforeAll(async () => {
    // Ilova ko'tarilishidan QAT'IY OLDIN — yuqoridagi fayl boshi izohiga qarang.
    originalDatabaseUrlApp = process.env.DATABASE_URL_APP;
    process.env.DATABASE_URL_APP = TEST_URL;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();

    /**
     * `main.ts` dagi sozlamalardan aynan shu uchtasi takrorlanadi —
     * qolganlari (`helmet()`, `enableCors()`, Swagger) HTTP xavfsizlik
     * sarlavhalari yoki hujjatlashtirish uchun, guard/interceptor
     * zanjiriga umuman aloqasi yo'q, shuning uchun bu yerda ortiqcha:
     *
     *  - `setGlobalPrefix('api')` + `enableVersioning(URI, v1)` — usiz
     *    `/sales/:id` kabi marshrutlar `/api/v1/sales/:id` da umuman
     *    topilmaydi (404 "route not found" — testni tekshirmoqchi
     *    bo'lgan 404 "resource not found" bilan ADASHTIRIB bo'ladi,
     *    ya'ni bu qadamsiz test yolg'on yashil bo'lishi ham mumkin edi);
     *  - `use(cookieParser())` — `SessionGuard` (`session.guard.ts:44`)
     *    `request.cookies`dan o'qiydi; `cookie-parser`siz bu obyekt
     *    umuman yo'q va sessiya HECH QACHON topilmaydi — hamma so'rov
     *    401/`SHOP_SETUP_REQUIRED` o'rniga "aniqlanmagan" bo'lib qolardi.
     */
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.use(cookieParser());

    await app.init();

    prisma = app.get(PrismaService);
    const config = app.get(ConfigService<Env, true>);
    const cookieName = config.get('SESSION_COOKIE_NAME', { infer: true });

    // `Shop` — RLS'siz (scope'dan chiqarilgan model), kontekstsiz yaratiladi.
    const shopA = await prisma.shop.create({ data: { name: `HTTP-A-${RUN}` } });
    const shopB = await prisma.shop.create({ data: { name: `HTTP-B-${RUN}` } });
    shopAId = shopA.id;
    shopBId = shopB.id;

    actorA = await buildActor(prisma, shopAId, `a${RUN}`);
    actorB = await buildActor(prisma, shopBId, `b${RUN}`);

    asA = httpAs(app, cookieName, actorA.sessionToken);
  });

  afterAll(async () => {
    await app.close();
    // Development bazasiga ishora qiluvchi asl qiymatni tiklaymiz —
    // shu jarayonda keyin ishga tushadigan har qanday kod (yoki shu
    // faylning o'zi qayta import qilinsa) development bazasiga tegmasin.
    process.env.DATABASE_URL_APP = originalDatabaseUrlApp;
  });

  /**
   * **Ijobiy nazorat (§ vazifa ta'rifi).** Buni SHART: agar guard yoki
   * interceptor butunlay ishlamay qolsa (masalan sessiya topilmasa),
   * QUYIDAGI cross-Shop testlar ham 404 qaytaradi — lekin sababi
   * "hech kim hech narsani ko'rmaydi", "Shop B'ning yozuvi to'g'ri
   * to'silgan" emas. Shu test ikkalasini ajratadi: Shop A o'z
   * resursini muvaffaqiyatli (200) olishi shart, aks holda pastdagi
   * "404" lar yolg'on yashil bo'ladi.
   */
  it("Shop A o'z savdosini muvaffaqiyatli oladi (ijobiy nazorat)", async () => {
    const response = await asA.get(`/api/v1/sales/${actorA.fixtures.saleId}`);

    expect(response.status).toBe(HttpStatus.OK);
    expect(response.body.id).toBe(actorA.fixtures.saleId);
  });

  it("Shop A o'z mijozini muvaffaqiyatli oladi (ijobiy nazorat)", async () => {
    const response = await asA.get(`/api/v1/customers/${actorA.fixtures.customerId}`);

    expect(response.status).toBe(HttpStatus.OK);
    expect(response.body.id).toBe(actorA.fixtures.customerId);
  });

  it("Shop A o'z shartnomasini muvaffaqiyatli oladi (ijobiy nazorat)", async () => {
    const response = await asA.get(`/api/v1/installments/${actorA.fixtures.contractId}`);

    expect(response.status).toBe(HttpStatus.OK);
    expect(response.body.id).toBe(actorA.fixtures.contractId);
  });

  it("Shop A o'z to'lovini muvaffaqiyatli oladi (ijobiy nazorat)", async () => {
    const response = await asA.get(`/api/v1/payments/${actorA.fixtures.paymentId}`);

    expect(response.status).toBe(HttpStatus.OK);
    expect(response.body.id).toBe(actorA.fixtures.paymentId);
  });

  /**
   * §25.11 ro'yxati bo'yicha `GET` — o'qish marshrutlari.
   *
   * `ARCHITECTURE.md` §14.8: cross-Shop urinish alohida kod olmaydi,
   * resurs "topilmadi" (404) — 403 EMAS, chunki 403 "bunday ID bor,
   * lekin sizniki emas" degan ma'lumotni oshkor qiladi. Shuning uchun
   * har bir holatda ikkala tekshiruv ham bor: status ANIQ 404 va
   * FORBIDDEN kodi umuman kelmaganini alohida tasdiqlaymiz.
   */
  describe.each([
    { label: 'sales', path: () => `/api/v1/sales/${actorB.fixtures.saleId}` },
    { label: 'customers', path: () => `/api/v1/customers/${actorB.fixtures.customerId}` },
    { label: 'installments', path: () => `/api/v1/installments/${actorB.fixtures.contractId}` },
    { label: 'payments', path: () => `/api/v1/payments/${actorB.fixtures.paymentId}` },
  ])('GET /$label — Shop B resursi Shop A sessiyasiga 404', ({ path }) => {
    it('404 qaytaradi, 403 emas', async () => {
      const response = await asA.get(path());

      expect(response.status).toBe(HttpStatus.NOT_FOUND);
      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(response.status).not.toBe(HttpStatus.FORBIDDEN);
    });
  });

  it("ro'yxat so'rovi (GET /sales) faqat Shop A savdolarini qaytaradi — Shop B ko'rinmaydi", async () => {
    const response = await asA.get('/api/v1/sales');

    expect(response.status).toBe(HttpStatus.OK);
    const ids: string[] = response.body.data.map((row: { id: string }) => row.id);

    expect(ids).toContain(actorA.fixtures.saleId);
    expect(ids).not.toContain(actorB.fixtures.saleId);
  });

  it("ro'yxat so'rovi (GET /customers) faqat Shop A mijozlarini qaytaradi — Shop B ko'rinmaydi", async () => {
    const response = await asA.get('/api/v1/customers');

    expect(response.status).toBe(HttpStatus.OK);
    const ids: string[] = response.body.data.map((row: { id: string }) => row.id);

    expect(ids).toContain(actorA.fixtures.customerId);
    expect(ids).not.toContain(actorB.fixtures.customerId);
  });

  /**
   * §25.11 ro'yxati bo'yicha `PATCH`/`DELETE` — o'zgartiruvchi, lekin
   * bitta yozuvni tekshiradigan marshrutlar. Barchasi `findUnique`
   * chaqiradi VA javob (404) topilmagandan keyin, boshqa hech narsaga
   * bormasdan qaytadi — ya'ni Shop B yozuvi na o'zgaradi, na o'chadi.
   */
  it("PATCH /sales/:id — Shop B savdosini yangilashga urinish 404", async () => {
    const response = await asA
      .patch(`/api/v1/sales/${actorB.fixtures.saleId}`)
      .send({ note: 'IDOR urinish', expectedUpdatedAt: new Date().toISOString() });

    expect(response.status).toBe(HttpStatus.NOT_FOUND);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it("DELETE /sales/:id — Shop B qoralamasini o'chirishga urinish 404", async () => {
    const response = await asA.delete(`/api/v1/sales/${actorB.fixtures.saleId}`);

    expect(response.status).toBe(HttpStatus.NOT_FOUND);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it("PATCH /customers/:id — Shop B mijozini yangilashga urinish 404", async () => {
    const response = await asA
      .patch(`/api/v1/customers/${actorB.fixtures.customerId}`)
      .send({ note: 'IDOR urinish', expectedUpdatedAt: new Date().toISOString() });

    expect(response.status).toBe(HttpStatus.NOT_FOUND);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  /**
   * §25.11 — `confirm`, `reverse` va umuman moliyaviy o'zgartiruvchi
   * amallar. Hammasi `@Idempotent()`, ya'ni `Idempotency-Key` sarlavhasi
   * bo'lmasa `IdempotencyInterceptor` 400 bilan to'xtatardi — bu bizning
   * IDOR tekshiruvimizga aloqasiz shovqin, shuning uchun har biriga
   * o'ziga xos (bir martalik) kalit beriladi.
   */
  it("POST /sales/:id/confirm — Shop B savdosini tasdiqlashga urinish 404", async () => {
    const response = await asA
      .post(`/api/v1/sales/${actorB.fixtures.saleId}/confirm`)
      .set('Idempotency-Key', randomUUID())
      .send({ payments: [] });

    expect(response.status).toBe(HttpStatus.NOT_FOUND);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it("POST /sales/:id/return — Shop B savdosini qaytarishga urinish 404", async () => {
    const response = await asA
      .post(`/api/v1/sales/${actorB.fixtures.saleId}/return`)
      .set('Idempotency-Key', randomUUID())
      .send({ items: [{ saleItemId: randomUUID(), quantity: 1 }], reason: 'DEFECTIVE' });

    expect(response.status).toBe(HttpStatus.NOT_FOUND);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it("POST /sales/:id/cancel — Shop B savdosini bekor qilishga urinish 404", async () => {
    const response = await asA
      .post(`/api/v1/sales/${actorB.fixtures.saleId}/cancel`)
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'ENTRY_ERROR' });

    expect(response.status).toBe(HttpStatus.NOT_FOUND);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it("PATCH /installments/:id/schedule — Shop B jadvalini qayta tuzishga urinish 404", async () => {
    const response = await asA
      .patch(`/api/v1/installments/${actorB.fixtures.contractId}/schedule`)
      .set('Idempotency-Key', randomUUID())
      .send({ schedule: [{ dueDate: '2027-03-01', amount: '50000' }], reason: 'IDOR urinish' });

    expect(response.status).toBe(HttpStatus.NOT_FOUND);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it("POST /installments/:id/close — Shop B shartnomasini erta yopishga urinish 404", async () => {
    const response = await asA
      .post(`/api/v1/installments/${actorB.fixtures.contractId}/close`)
      .set('Idempotency-Key', randomUUID())
      .send({ expectedOutstanding: '1000000', method: 'CASH', cashAccountId: randomUUID() });

    expect(response.status).toBe(HttpStatus.NOT_FOUND);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it("POST /payments/:id/confirm — Shop B to'lovini tasdiqlashga urinish 404", async () => {
    const response = await asA
      .post(`/api/v1/payments/${actorB.fixtures.paymentId}/confirm`)
      .set('Idempotency-Key', randomUUID());

    expect(response.status).toBe(HttpStatus.NOT_FOUND);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it("POST /payments/:id/reject — Shop B to'lovini rad etishga urinish 404", async () => {
    const response = await asA
      .post(`/api/v1/payments/${actorB.fixtures.paymentId}/reject`)
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'IDOR urinish sababi' });

    expect(response.status).toBe(HttpStatus.NOT_FOUND);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it("POST /payments/:id/reverse — Shop B to'lovini qaytarishga urinish 404", async () => {
    const response = await asA
      .post(`/api/v1/payments/${actorB.fixtures.paymentId}/reverse`)
      .set('Idempotency-Key', randomUUID())
      .send({ reason: 'IDOR urinish sababi' });

    expect(response.status).toBe(HttpStatus.NOT_FOUND);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  /**
   * **TOPILMA — TZ/ARXITEKTURA og'ishi (405-qadam emas, hisobotda alohida
   * ko'rsatilgan).**
   *
   * `POST /payments` tanadagi `contractId` — path parametr EMAS, so'rov
   * TANASIDAGI havola. `PaymentsService.create()` (`payments.service.ts:133`)
   * buni `AppException.rule(ErrorCode.NOT_FOUND, ..., 'contractId')` bilan
   * rad etadi — bu **422** (`UNPROCESSABLE_ENTITY`), ARCHITECTURE.md §14.8
   * so'zma-so'z talab qilgan **404** EMAS.
   *
   * Bu naqsh yolg'iz shu joyda emas — xuddi shunday `sales.customerId`,
   * `payments.cashAccountId`, `inventory-receiving.productId`,
   * `cash-entries.categoryId`, `installments.cashAccountId`,
   * `cash-accounts` uchun ham ishlatiladi (hammasi `AppException.rule`,
   * `field` bilan): bu — so'rov TANASIDAGI xato maydonni frontendga
   * ko'rsatish uchun ATAYLAB tanlangan, kod bazasi bo'ylab izchil
   * konvensiya, `payments.service.ts` yoki shu branch bilan bog'liq
   * yangi xato emas.
   *
   * **Xavfsizlik xossasi baribir saqlanadi**: pastdagi test buni
   * isbotlaydi — Shop B'ning HAQIQIY `contractId`si va umuman
   * MAVJUD BO'LMAGAN `contractId` bir xil javob beradi (bir xil kod,
   * bir xil xabar, bir xil `field`). Ya'ni tajovuzkor bu javobdan
   * "bunday shartnoma bor, lekin sizniki emas" degan xulosa chiqara
   * olmaydi — ARCHITECTURE §14.8 ning MAQSADI (403'ni taqiqlash sababi)
   * bajarilgan, faqat HTTP kodi so'zma-so'z matndan farq qiladi.
   *
   * QAROR: bu testni "404 kutamiz" deb yozib qizil qoldirish o'rniga,
   * haqiqiy (va xavfsiz) xulqni tasdiqlaydigan qilib yozdim va
   * farqni shu izohda ochiq ko'rsatdim — jim tuzatib qo'yish o'rniga.
   * Jamoa buni ikki yo'l bilan hal qilishi mumkin: (a) ARCHITECTURE.md
   * §14.8 ni "path resurs — 404, tana ichidagi FK havola — 422 + field"
   * deb aniqlashtirish, yoki (b) `payments.service.ts`dagi shu satrni
   * (va yuqoridagi besh o'xshash joyni) `AppException.notFound`ga
   * o'tkazish. Ikkalasi ham production kod o'zgarishi — shu QA
   * vazifasi doirasidan tashqarida, shuning uchun o'zgartirilmadi.
   */
  it("POST /payments — tanadagi Shop B contractId 422 (NOT_FOUND) beradi, MAVJUD BO'LMAGAN contractId bilan bir xil javob", async () => {
    const crossShopResponse = await asA
      .post('/api/v1/payments')
      .set('Idempotency-Key', randomUUID())
      .send({
        contractId: actorB.fixtures.contractId,
        amount: '50000',
        currency: 'UZS',
        method: 'CASH',
        cashAccountId: randomUUID(),
      });

    expect(crossShopResponse.status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(crossShopResponse.body.error.code).toBe('NOT_FOUND');
    expect(crossShopResponse.body.error.field).toBe('contractId');
    // 403 emas — "bor, lekin sizniki emas" degan signal umuman yo'q.
    expect(crossShopResponse.status).not.toBe(HttpStatus.FORBIDDEN);

    const nonexistentResponse = await asA
      .post('/api/v1/payments')
      .set('Idempotency-Key', randomUUID())
      .send({
        contractId: randomUUID(),
        amount: '50000',
        currency: 'UZS',
        method: 'CASH',
        cashAccountId: randomUUID(),
      });

    // Ikkala javob orasida hech qanday farqlovchi belgi yo'q — bu
    // ARCHITECTURE §14.8 ning haqiqiy talabi (403 emas, "topilmadi").
    expect(nonexistentResponse.status).toBe(crossShopResponse.status);
    expect(nonexistentResponse.body.error.code).toBe(crossShopResponse.body.error.code);
    expect(nonexistentResponse.body.error.field).toBe(crossShopResponse.body.error.field);
  });
});
