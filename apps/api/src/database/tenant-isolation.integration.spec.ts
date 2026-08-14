import { PrismaPg } from '@prisma/adapter-pg';
import { CashAccountKind, Currency, Prisma } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runWithShopScope, runWithoutShopScope } from './shop-context';
import { SHOP_SCOPE_EXEMPT_MODELS, withShopScope, type PrismaService } from './prisma.service';

/**
 * Tenant izolyatsiyasi — **haqiqiy PostgreSQL ustida**, `hisobai_app` roli
 * ostida (`ARCHITECTURE.md` §12 "Tenant" darajasi, §14.4, §21.16).
 *
 * **Nega bu test boshqalardan farq qiladi.** Kod bazasidagi qolgan barcha
 * testlar Prisma'ni mock qiladi — ular ilova mantig'ini tekshiradi, lekin
 * chegara **ikki** qatlamda majburlanadi va mock qilingan test ikkinchisini
 * (PostgreSQL RLS) umuman ko'rmaydi. Aynan shu ko'rlik tufayli
 * `sale_counters` dagi cross-tenant xato (audit topilmasi C1) testlardan
 * jimgina o'tib ketgan edi.
 *
 * Shuning uchun bu yerda:
 *  - ulanish **`hisobai_app`** orqali (`NOBYPASSRLS`) — superuser bo'lsa
 *    `FORCE ROW LEVEL SECURITY` ham chetlab o'tilardi va test hech narsani
 *    isbotlamasdi;
 *  - klient **haqiqiy** `withShopScope()` extension'i bilan o'raladi;
 *  - baza **alohida** (`DATABASE_URL_TEST`) — development ma'lumotiga
 *    hech qachon tegilmaydi.
 *
 * `DATABASE_URL_TEST` berilmagan bo'lsa butun blok o'tkazib yuboriladi:
 * baza talab qiladigan test CI'da yoki hamkasbning mashinasida sukut
 * bo'yicha yiqilmasligi kerak. Tayyorlash: `prisma/README-test-db.md`.
 */

const TEST_URL = process.env.DATABASE_URL_TEST;

/** Har ishga tushirishda o'ziga xos — testlar bir-birining qatorini ko'rmasin. */
const RUN = Date.now().toString(36);

/**
 * **Kontekst ichida `await` qilish SHART.**
 *
 * Prisma promise'lari lazy: `client.customer.findMany()` chaqirilganda
 * so'rov hali yuborilmaydi, u faqat `.then()` da bajariladi. Ya'ni
 * `runWithShopScope(id, () => client.customer.findMany())` yozilsa,
 * `AsyncLocalStorage` konteksti so'rov ketishidan OLDIN yopiladi va
 * extension `SHOP_CONTEXT_MISSING` beradi.
 *
 * Ishlab chiqarishda bu muammo yo'q, chunki u yerda scope butun so'rov
 * ishlovini o'rab turadi (`shop-context.interceptor.ts`) va `await` ham
 * o'sha ichkarida. Testda esa scope qo'lda ochilgani uchun bu tuzoq
 * real — shuning uchun barcha chaqiruvlar shu ikki yordamchi orqali.
 */
function inShop<T>(shopId: string, fn: () => Promise<T>): Promise<T> {
  return runWithShopScope(shopId, async () => await fn());
}

function inPlatform<T>(fn: () => Promise<T>): Promise<T> {
  return runWithoutShopScope(async () => await fn());
}

interface Fixture {
  /** Model nomi — xato xabarida ko'rinadi. */
  model: string;
  /** Shop konteksti ichida bitta qator yaratadi va id qaytaradi. */
  create: (client: PrismaService, tag: string) => Promise<string>;
  /** Shu id bo'yicha qator izlaydi (kontekst chaqiruvchida). */
  findById: (client: PrismaService, id: string) => Promise<unknown>;
  /** Shu id bo'yicha yangilashga urinadi, nechta qator tegilganini qaytaradi. */
  updateById: (client: PrismaService, id: string) => Promise<number>;
}

/**
 * Qamrov: `shop_id` ustuni bo'lgan 27 jadvaldan beshtasi — FK talab
 * qilmaydigan, ya'ni izolyatsiyani boshqa modelning holatiga bog'lamasdan
 * tekshirib beradigan modellar. Ular RLS siyosati bir xil shablondan
 * generatsiya qilingani uchun vakillik qiladi (migratsiyaning 3-qismi:
 * bitta `CREATE POLICY` sikli barcha jadvallarga).
 *
 * Shablondan CHIQADIGAN yagona jadval — `audit_logs` (`shop_id` nullable,
 * `IS NOT DISTINCT FROM` siyosati) — pastda alohida tekshiriladi.
 *
 * Qolgan 22 jadval **qamrovsiz emas**: RLS majburlanishi (yoqilgan +
 * `FORCE` + siyosat bor) ular uchun pastdagi katalog testida, DMMF'dan
 * olingan ro'yxat bo'yicha avtomatik tekshiriladi (§21.28).
 *
 * Bu yerda sinalmagan yagona narsa — kompozit-FK bolalar jadvallarining
 * (`SaleItem`, `PaymentAllocation`, `StocktakeLine`, `PaymentSchedule`)
 * XULQ-ATVORI: ular `shop_id` ni denormalizatsiya qiladi va otaga
 * kompozit FK bilan bog'lanadi, ya'ni yuqoridagi beshtadan strukturaviy
 * farq qiladi. Ular uchun fixture 8-bosqichda (nasiya), zanjir moduli
 * bilan birga yoziladi — §21.29.
 */
const FIXTURES: Fixture[] = [
  {
    model: 'Customer',
    create: async (client, tag) => {
      const row = await client.customer.create({
        data: { fullName: `Mijoz ${tag}`, phonePrimary: `+9989${tag.slice(-8)}` },
      });
      return row.id;
    },
    findById: (client, id) => client.customer.findUnique({ where: { id } }),
    updateById: async (client, id) => {
      const result = await client.customer.updateMany({
        where: { id },
        data: { fullName: 'BOSQINCHI' },
      });
      return result.count;
    },
  },
  {
    model: 'Category',
    create: async (client, tag) => {
      const row = await client.category.create({
        data: { name: `Kat ${tag}`, slug: `kat-${tag}` },
      });
      return row.id;
    },
    findById: (client, id) => client.category.findUnique({ where: { id } }),
    updateById: async (client, id) => {
      const result = await client.category.updateMany({
        where: { id },
        data: { name: 'BOSQINCHI' },
      });
      return result.count;
    },
  },
  {
    model: 'Brand',
    create: async (client, tag) => {
      const row = await client.brand.create({
        data: { name: `Brend ${tag}`, slug: `brend-${tag}` },
      });
      return row.id;
    },
    findById: (client, id) => client.brand.findUnique({ where: { id } }),
    updateById: async (client, id) => {
      const result = await client.brand.updateMany({ where: { id }, data: { name: 'BOSQINCHI' } });
      return result.count;
    },
  },
  {
    model: 'CashAccount',
    create: async (client, tag) => {
      const row = await client.cashAccount.create({
        data: { name: `Kassa ${tag}`, currency: Currency.UZS, kind: CashAccountKind.CASH },
      });
      return row.id;
    },
    findById: (client, id) => client.cashAccount.findUnique({ where: { id } }),
    updateById: async (client, id) => {
      const result = await client.cashAccount.updateMany({
        where: { id },
        data: { name: 'BOSQINCHI' },
      });
      return result.count;
    },
  },
  {
    model: 'CashCategory',
    create: async (client, tag) => {
      const row = await client.cashCategory.create({
        data: { name: `Turkum ${tag}`, slug: `turkum-${tag}` },
      });
      return row.id;
    },
    findById: (client, id) => client.cashCategory.findUnique({ where: { id } }),
    updateById: async (client, id) => {
      const result = await client.cashCategory.updateMany({
        where: { id },
        data: { name: 'BOSQINCHI' },
      });
      return result.count;
    },
  },
];

describe.skipIf(!TEST_URL)('tenant izolyatsiyasi (haqiqiy DB, hisobai_app)', () => {
  let base: PrismaClient;
  let client: PrismaService;
  let shopA: string;
  let shopB: string;
  /** `model` → `{ a, b }` — har Shop'da yaratilgan qator id'lari. */
  const rows = new Map<string, { a: string; b: string }>();

  beforeAll(async () => {
    base = new PrismaClient({ adapter: new PrismaPg({ connectionString: TEST_URL }) });
    client = withShopScope(base as unknown as PrismaService);

    // `Shop` — scope'dan chiqarilgan model (RLS yo'q), shuning uchun
    // kontekstsiz yaratiladi: tenant chegarasining o'zi tenant emas.
    const a = await client.shop.create({ data: { name: `A-${RUN}` } });
    const b = await client.shop.create({ data: { name: `B-${RUN}` } });
    shopA = a.id;
    shopB = b.id;

    for (const fixture of FIXTURES) {
      const idA = await inShop(shopA, () => fixture.create(client, `a${RUN}`));
      const idB = await inShop(shopB, () => fixture.create(client, `b${RUN}`));
      rows.set(fixture.model, { a: idA, b: idB });
    }
  });

  afterAll(async () => {
    await base.$disconnect();
  });

  describe.each(FIXTURES)('$model', (fixture) => {
    it("o'z Shop'idagi qator ko'rinadi", async () => {
      const { a } = rows.get(fixture.model)!;

      const found = await inShop(shopA, () => fixture.findById(client, a));

      expect(found).not.toBeNull();
    });

    it("boshqa Shop'ning qatori id bo'yicha ham ko'rinmaydi (cross-Shop IDOR)", async () => {
      const { b } = rows.get(fixture.model)!;

      // Aynan shu holat IDOR: hujumchi boshqa tenant'ning UUID'sini
      // bilsa ham, qator umuman mavjud emasdek ko'rinishi kerak.
      const found = await inShop(shopA, () => fixture.findById(client, b));

      expect(found).toBeNull();
    });

    it("boshqa Shop'ning qatorini yangilab bo'lmaydi", async () => {
      const { b } = rows.get(fixture.model)!;

      const affected = await inShop(shopA, () => fixture.updateById(client, b));

      expect(affected).toBe(0);
    });

    it('kontekstsiz chaqiruv bazaga umuman bormaydi (SHOP_CONTEXT_MISSING)', async () => {
      const { a } = rows.get(fixture.model)!;

      await expect(fixture.findById(client, a)).rejects.toMatchObject({
        code: 'SHOP_CONTEXT_MISSING',
      });
    });
  });

  it("ro'yxat so'rovi faqat o'z Shop'ining qatorlarini qaytaradi", async () => {
    const { a: customerA } = rows.get('Customer')!;
    const { b: customerB } = rows.get('Customer')!;

    const listA = await inShop(shopA, () =>
      client.customer.findMany({ where: { id: { in: [customerA, customerB] } } }),
    );

    expect(listA.map((row) => row.id)).toEqual([customerA]);
  });

  it("boshqa Shop nomidan qator YOZIB bo'lmaydi (RLS WITH CHECK)", async () => {
    // `shopId` ni ATAYLAB qo'lda beramiz — ilova qatlami uni odatda
    // yozmaydi (DB default'i qo'yadi), lekin RLS ning `WITH CHECK` qismi
    // aynan shu urinishdan himoya qilishi kerak. Faqat `USING` bo'lganida
    // bu yozuv o'tib ketardi (§21.13).
    const attempt = inShop(shopA, () =>
      client.customer.create({
        data: { shopId: shopB, fullName: 'Yot', phonePrimary: `+99890${RUN.slice(-7)}` },
      }),
    );

    // Xato AYNAN RLS'dan kelishi kerak. `.rejects.toThrow()` yetarli emas
    // edi: kontekst noto'g'ri ochilganda `SHOP_CONTEXT_MISSING` ham
    // "reject" beradi va test to'g'ri sababdan emas, tasodifan yashil
    // bo'lib qolardi.
    await expect(attempt).rejects.toThrow(/row-level security/i);
  });

  it("`sale_counters` hisoblagichi Shop bo'yicha mustaqil (§21.9, audit C1)", async () => {
    // C1 ning haqiqiy testi: mock'siz, ikkita Shop, bitta yil.
    // Xato holatda B ning `UPDATE`i A ning qatorini ham oshirardi.
    const year = 2099;

    const allocate = (shopId: string): Promise<number> =>
      inShop(shopId, () =>
        client.$transaction(async (tx) => {
          await tx.$executeRaw`
            INSERT INTO sale_counters (shop_id, year) VALUES (${shopId}::uuid, ${year})
            ON CONFLICT DO NOTHING
          `;
          const result = await tx.$queryRaw<{ last_seq: number }[]>`
            UPDATE sale_counters SET last_seq = last_seq + 1
            WHERE shop_id = ${shopId}::uuid AND year = ${year}
            RETURNING last_seq
          `;
          const row = result[0];
          if (row === undefined) throw new Error('hisoblagich qatori qaytmadi');
          return row.last_seq;
        }),
      );

    expect(await allocate(shopA)).toBe(1);
    expect(await allocate(shopB)).toBe(1); // A ning oshishi B ga ta'sir qilmadi
    expect(await allocate(shopA)).toBe(2);
    expect(await allocate(shopB)).toBe(2);
  });

  it("`audit_logs` — Shop yozuvi platforma yo'lida ko'rinmaydi (§25.17)", async () => {
    const shopEntry = await inShop(shopA, () =>
      client.auditLog.create({
        data: { action: `TEST_SHOP_${RUN}`, entityType: 'Test', entityId: shopA },
      }),
    );

    // Platforma yo'li (`runWithoutShopScope`) — kontekst yo'q, ya'ni
    // siyosat `shop_id IS NULL` qatorlarnigina ko'rsatadi.
    const seenFromPlatform = await inPlatform(() =>
      client.auditLog.findUnique({ where: { id: shopEntry.id } }),
    );

    expect(seenFromPlatform).toBeNull();
  });

  it("`audit_logs` — platforma yozuvi Shop kontekstida ko'rinmaydi", async () => {
    const platformEntry = await inPlatform(() =>
      client.auditLog.create({
        data: { action: `TEST_PLATFORM_${RUN}`, entityType: 'Test', entityId: shopA },
      }),
    );

    const seenFromShop = await inShop(shopA, () =>
      client.auditLog.findUnique({ where: { id: platformEntry.id } }),
    );

    expect(seenFromShop).toBeNull();
  });

  /**
   * `ARCHITECTURE.md` §12: tenant testi "**namuna emas, parametrlangan**
   * bo'lishi shart: har bir shop-scoped resurs uchun avtomatik ishlasin,
   * aks holda keyin qo'shilgan resurs testsiz qoladi".
   *
   * Yuqoridagi `FIXTURES` beshta modelni **uchidan-uchiga** tekshiradi
   * (yozish, o'qish, yangilash) — bu qimmat, chunki har biri qo'lda
   * yozilgan fixture talab qiladi va FK zanjiri bo'lgan jadvallarda u
   * butun savdo tuzishga aylanib ketardi. Shuning uchun qamrov ikkiga
   * bo'lingan: xulq-atvor — beshta vakil modelda, **majburlanish esa —
   * hamma 27 jadvalda**, bazaning o'z katalogidan o'qib.
   *
   * Ro'yxat DMMF'dan olinadi, ya'ni yangi shop-scoped model qo'shilib
   * RLS migratsiyasi yozilmasa, bu test hech kim ro'yxatni
   * yangilamasdan turib qulaydi — §12 talab qilgan xulq aynan shu.
   *
   * Nima tekshiriladi va nega aynan uchtasi:
   *  - `relrowsecurity` — siyosat umuman yoqilganmi;
   *  - `relforcerowsecurity` — jadval EGASIGA ham qo'llanadimi (usiz
   *    `hisobai_migrate` ostidagi har qanday so'rov chegarasiz bo'lardi);
   *  - siyosat mavjudligi — RLS yoqilgan, lekin siyosatsiz jadval
   *    hech kimga hech narsa ko'rsatmaydi: "xavfsiz" ko'rinadi, aslida
   *    esa noto'g'ri sozlangan.
   */
  it('shop-scoped 27 jadvalning HAMMASIDA RLS yoqilgan, majburlangan va siyosatli', async () => {
    const tables = Prisma.dmmf.datamodel.models
      .filter((model) => !SHOP_SCOPE_EXEMPT_MODELS.has(model.name))
      .map((model) => model.dbName ?? model.name);

    expect(tables).toHaveLength(27);

    const rows = await base.$queryRaw<
      { table_name: string; enabled: boolean; forced: boolean; policies: bigint }[]
    >`
      SELECT c.relname                        AS table_name,
             c.relrowsecurity                 AS enabled,
             c.relforcerowsecurity            AS forced,
             (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = ANY(${tables})
    `;

    const byTable = new Map(rows.map((row) => [row.table_name, row]));

    for (const table of tables) {
      const row = byTable.get(table);
      expect(row, `"${table}" jadvali bazada topilmadi — migratsiya qo'llanganmi?`).toBeDefined();
      expect(row?.enabled, `"${table}": ROW LEVEL SECURITY yoqilmagan`).toBe(true);
      expect(row?.forced, `"${table}": FORCE ROW LEVEL SECURITY yo'q — ega chetlab o'tadi`).toBe(
        true,
      );
      expect(Number(row?.policies ?? 0), `"${table}": bitta ham siyosat yo'q`).toBeGreaterThan(0);
    }
  });

  it("ulanish RLS ni chetlab o'tmaydigan rol ostida (test o'zini tekshiradi)", async () => {
    // Bu test butun blokning poydevorini himoyalaydi: agar kimdir
    // `DATABASE_URL_TEST` ni superuser'ga yo'naltirsa, yuqoridagi
    // tekshiruvlar RLS ni umuman sinamay, baribir yashil bo'lardi.
    const [role] = await base.$queryRaw<{ role_name: string; bypasses_rls: boolean }[]>`
      SELECT rolname AS role_name, rolbypassrls AS bypasses_rls
      FROM pg_roles WHERE rolname = current_user
    `;

    expect(role).toBeDefined();
    expect(role?.bypasses_rls).toBe(false);
    expect(role?.role_name).not.toBe('postgres');
  });
});
