import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { SHOP_SCOPE_EXEMPT_MODELS } from './prisma.service';

/**
 * Shop-scoped modelga ishora qiluvchi bir ustunli FK'lar ro'yxati (T-01,
 * `docs/DECISIONS.md` §21.13, §21.8 falsafasi bilan bir xil naqsh).
 *
 * **Nega bu test bor.** PostgreSQL FK referensial butunligini tekshirganda
 * jadval EGASI (`hisobai_migrate`) nomidan ishlaydi. RLS esa `FORCE ROW
 * LEVEL SECURITY` bilan ham faqat jadval EGASI'DAN BOSHQA rollarga
 * qo'llanadi (§21.13) — ya'ni FK tekshiruvi RLS'dan MUSTAQIL va uni
 * chetlab o'tadi. Bitta ustunli FK (`sales.customer_id -> customers.id`)
 * faqat "shu id bilan qator bormi"ni tekshiradi, "shu Shop'gami"ni emas —
 * Shop A shu yo'l bilan Shop B'ning qatoriga bog'lanardi. Bu aynan T-01:
 * `sales.customer` va `notification_logs.customer` shu teshik bilan
 * yozilgan edi, `cddfa8e`da kompozit FK'ga (`[customerId, shopId] ->
 * [id, shopId]`) o'tkazib tuzatilgan
 * (`tenant-isolation.integration.spec.ts` dagi T-01 testiga qarang).
 *
 * Endi to'liq inventarizatsiya bor: bu faylda schema'dagi HAR BIR
 * shop-scoped modelga ishora qiluvchi bir ustunli FK sanaladi va uchtadan
 * BIRI bilan tasniflanadi — nega xavfsiz (yoki nega hali baholanmagan):
 *
 *  - **TRIGGER** — DB trigger `INSERT`/`UPDATE` paytida ikkala tomonning
 *    `shop_id`sini solishtiradi va mos kelmasa `RAISE EXCEPTION` qiladi.
 *    RLS'dan mustaqil qatlam — trigger ham jadval EGASI nomidan ishlaydi,
 *    lekin bu safar ATAYLAB shu tekshiruv uchun yozilgan.
 *  - **SERVIS** — mijozdan keladigan qiymat FK'ga tushishidan OLDIN
 *    servis RLS ostida `findUnique`/`findMany` bilan mavjudligini
 *    tekshiradi (topilmasa `NOT_FOUND`). RLS boshqa Shop'ning qatorini
 *    "yo'q" ko'rsatadi, ya'ni bu tekshiruv ishlaydi — LEKIN har yangi
 *    endpoint shu tekshiruvni ONGLI takrorlashi kerak; buni statik tahlil
 *    bilan ishonchli isbotlab bo'lmaydi (funksiya semantikasini o'qish
 *    kerak), shuning uchun bu yerda QO'LDA tasdiqlanadi.
 *  - **SERVER** — qiymat mijozdan UMUMAN kelmaydi: na yaratish
 *    input-sxemasida (`packages/contracts`), na controller'da shu
 *    maydonga mos maydon bor. Server o'zi allaqachon RLS ostida topilgan
 *    qatorning `id`sini yozadi (masalan `sale.id`, `item.id`) — mijoz
 *    boshqa Shop'ning UUID'ini qo'lda kirita olmaydi.
 *  - **UNUSED** — `FileAsset`ga ishora qiladi, `Storage` moduli hali
 *    ulanmagan (`apps/api/src/storage/` — ish davomida). Hech qanday
 *    servis bu ustunni yozmaydi, ya'ni amaliy xavf yo'q, lekin modul
 *    ulanganda bu yozuv qayta ko'rib chiqilishi SHART.
 *  - **NO_MODULE** — moduli umuman yozilmagan (`Document`, stocktake
 *    hisobotlari, bildirishnoma rejalashtiruvchisi) — xavfsiz yoki emasligi
 *    hali baholanmaydi, shunchaki mavjud emas.
 *
 * **Nega ro'yxat QO'LDA yuritiladi, avtomatik emas.** SERVIS qatorini
 * statik tahlil bilan aniqlab bo'lmaydi: "servis shu FK qiymatini
 * yozishdan OLDIN RLS ostida tekshiryaptimi" — bu funksiya chaqiruvlar
 * zanjiri va semantikasini tushunishni talab qiladi, regex bilan emas
 * (§21.8 dagi xuddi shu mulohaza: "xavfli istisnolar ro'yxati noaniq
 * bo'lsa u himoya emas, xotirjamlik illyuziyasi"). Shuning uchun bu test
 * "himoya BOR"ligini isbotlamaydi — u faqat "har bir FK KO'RIB CHIQILGAN
 * va qarori yozilgan" ekanini kafolatlaydi. Haqiqiy himoyani
 * `tenant-isolation.integration.spec.ts` (kompozit FK'lar uchun) va har
 * bir servisning o'z testlari isbotlaydi.
 *
 * **Yangi FK uchun SUKUT BO'YICHA to'g'ri javob — KOMPOZIT FK**
 * (`[xId, shopId] -> [x(id, shopId)]`, ota modelda `@@unique([id, shopId])`
 * bilan birga — `StocktakeLine`/`Sale.customer` naqshi). Bu holda FK T-01
 * turidagi teshikni STRUKTURA darajasida yopadi va bu ro'yxatga
 * qo'shilishi ham shart emas (pastdagi test kompozit FK'larni tekshirmaydi
 * — ular xavfsiz deb hisoblanadi). Bir ustunli FK qo'shish ISTISNO va
 * ONGLI qaror talab qiladi: nega kompozit qilib bo'lmadi, qaysi qatlam
 * (trigger/servis/server) uni qopladi — va bu SABAB shu ro'yxatga
 * yoziladi. Aks holda test pastda tushuntirilganidek yiqiladi.
 */

const SCHEMA_PATH = join(process.cwd(), 'prisma', 'schema.prisma');

type FkKind = 'TRIGGER' | 'SERVIS' | 'SERVER' | 'UNUSED' | 'NO_MODULE';

interface ClassifiedFk {
  /** Prisma model nomi (FK USTUNI shu modelda). */
  model: string;
  /** Skalyar ustun nomi (`fields: [...]` dagi element, masalan `productId`). */
  column: string;
  kind: FkKind;
  /** Qisqa DALIL: qaysi faylda/triggerda tekshiruv bor. */
  evidence: string;
}

/**
 * Qotirilgan tasnif — 33 ta yozuv. Har biri schema'dagi bitta bir ustunli
 * FK'ga mos keladi (pastdagi testlar buni ikki tomonlama tekshiradi:
 * ro'yxatda bor-u schema'da yo'q — ham, schema'da bor-u ro'yxatda yo'q —
 * ham xato).
 */
const CLASSIFIED_FKS: readonly ClassifiedFk[] = [
  // ── TRIGGER (6) — `20260813120000_multi_tenant_shop_layer/migration.sql`
  // 7-qism: har funksiya ikkala tomonning `shop_id`sini solishtirib
  // `RAISE EXCEPTION` qiladi. Bazada empirik sinalgan (§21.8 mulohazasi).
  {
    model: 'CashEntry',
    column: 'accountId',
    kind: 'TRIGGER',
    evidence:
      'check_cash_entry_currency() — cash_entries.shop_id ni cash_accounts.shop_id bilan solishtiradi.',
  },
  {
    model: 'CashExchange',
    column: 'fromAccountId',
    kind: 'TRIGGER',
    evidence: 'check_exchange_accounts() — ikkala hisobning shop_id sini tekshiradi.',
  },
  {
    model: 'CashExchange',
    column: 'toAccountId',
    kind: 'TRIGGER',
    evidence: 'check_exchange_accounts() — ikkala hisobning shop_id sini tekshiradi.',
  },
  {
    model: 'InventoryBatch',
    column: 'productId',
    kind: 'TRIGGER',
    evidence:
      'check_cost_currency() (inventory_batches_cost_currency_guard) — products.shop_id bilan solishtiradi.',
  },
  {
    model: 'InventoryItem',
    column: 'productId',
    kind: 'TRIGGER',
    evidence:
      'check_cost_currency() (inventory_items_cost_currency_guard) — products.shop_id bilan solishtiradi.',
  },
  {
    model: 'InstallmentContract',
    column: 'saleId',
    kind: 'TRIGGER',
    evidence:
      'check_contract_currency() — sales.shop_id bilan solishtiradi. Server ham qoplaydi: ' +
      'sale-confirmation.service.ts saleId ni tasdiqlangan sale.id dan yozadi, mijoz kiritmaydi.',
  },

  // ── SERVIS (9) — mijozdan keladigan qiymat FK'ga yozilishidan OLDIN
  // RLS ostida `findUnique`/`findMany` bilan tekshiriladi (topilmasa
  // NOT_FOUND). Boshqa Shop'ning qatori RLS tomonidan "yo'q" ko'rinadi.
  {
    model: 'CashEntry',
    column: 'categoryId',
    kind: 'SERVIS',
    evidence: 'cash/cash-entries.service.ts — assertCategoryFits(): findUnique + NOT_FOUND.',
  },
  {
    model: 'CashEntry',
    column: 'reversesEntryId',
    kind: 'SERVIS',
    evidence:
      'cash/cash-entries.service.ts — reverse() ichida asl yozuv RLS ostida findUnique bilan topiladi.',
  },
  {
    model: 'Payment',
    column: 'cashAccountId',
    kind: 'SERVIS',
    evidence:
      'payments/payments.service.ts — create() ichida findUnique + NOT_FOUND ("Kassa hisobi topilmadi"); ' +
      'sales/sale-confirmation.service.ts da ham xuddi shu tekshiruv takrorlanadi.',
  },
  {
    model: 'Payment',
    column: 'contractId',
    kind: 'SERVIS',
    evidence: 'payments/payments.service.ts — create() ichida findUnique + NOT_FOUND ("Shartnoma topilmadi").',
  },
  {
    model: 'Product',
    column: 'brandId',
    kind: 'SERVIS',
    evidence: 'catalog/product.service.ts — requireTaxonomy("brand", …): findUnique + NOT_FOUND.',
  },
  {
    model: 'Product',
    column: 'categoryId',
    kind: 'SERVIS',
    evidence: 'catalog/product.service.ts — requireTaxonomy("category", …): findUnique + NOT_FOUND.',
  },
  {
    model: 'SaleItem',
    column: 'batchId',
    kind: 'SERVIS',
    evidence:
      'sales/sales.service.ts — readCost(): findUnique + productId mosligi tekshiriladi ("Partiya topilmadi").',
  },
  {
    model: 'SaleItem',
    column: 'inventoryItemId',
    kind: 'SERVIS',
    evidence:
      'sales/sales.service.ts — readCost(): findUnique + productId mosligi tekshiriladi ("Ombor birligi topilmadi").',
  },
  {
    model: 'SaleItem',
    column: 'productId',
    kind: 'SERVIS',
    evidence: 'sales/sales.service.ts — prepareItems(): findMany + NOT_FOUND ("Mahsulot topilmadi").',
  },

  // ── SERVER (8) — mijoz bu maydonga qiymat yubora olmaydi: yaratish
  // input-sxemasida (`packages/contracts`) maydon YO'Q, faqat javob
  // DTO'sida bor (agar umuman bor bo'lsa). Server RLS ostida topilgan
  // qatorning `id`sini o'zi yozadi.
  {
    model: 'CashEntry',
    column: 'paymentId',
    kind: 'SERVER',
    evidence:
      'cash/cash-entries.service.ts — createFromPayment()/createReversal() paymentId ni parametr sifatida ' +
      'ichkaridan oladi, hech qanday create-DTO bu maydonni ochmaydi.',
  },
  {
    model: 'Payment',
    column: 'reversesPaymentId',
    kind: 'SERVER',
    evidence:
      'packages/contracts/src/schemas/payment.ts — faqat javob DTO tipida, yaratish sxemasida yo\'q; ' +
      'hozircha yozuvchi kod ham yo\'q (dead field, lekin kirish yo\'li HAM yo\'q).',
  },
  {
    model: 'Payment',
    column: 'saleId',
    kind: 'SERVER',
    evidence:
      'sales/sale-confirmation.service.ts — to\'lov yozuvi `saleId: sale.id` bilan, tasdiqlangan savdodan yaratiladi.',
  },
  {
    model: 'PaymentAllocation',
    column: 'scheduleId',
    kind: 'SERVER',
    evidence:
      'payments/allocation.service.ts — allocate(): scheduleId RLS ostida o\'qilgan jadval qatorlari ' +
      'ustidan ICHKI siklda (`schedule.id`) yoziladi, mijoz kiritmaydi.',
  },
  {
    model: 'Sale',
    column: 'reversesSaleId',
    kind: 'SERVER',
    evidence: 'sales/sale-reversal.service.ts — reversesSaleId: sale.id, asl (topilgan) savdodan.',
  },
  {
    model: 'StockMovement',
    column: 'productId',
    kind: 'SERVER',
    evidence: 'inventory/inventory-receiving.service.ts — productId: product.id, ichkarida qabul qilingan.',
  },
  {
    model: 'StockMovement',
    column: 'inventoryItemId',
    kind: 'SERVER',
    evidence: 'inventory/inventory-receiving.service.ts — inventoryItemId: item.id, ichkarida yaratilgan.',
  },
  {
    model: 'StockMovement',
    column: 'batchId',
    kind: 'SERVER',
    evidence: 'inventory/inventory-receiving.service.ts — batchId: created.id / batch?.id, ichkarida yaratilgan.',
  },

  // ── UNUSED (6) — `FileAsset`ga ishora qiladi, Storage moduli hali
  // ulanmagan (`apps/api/src/storage/`). Hech kim bu ustunlarni hozircha
  // yozmaydi.
  {
    model: 'CashEntry',
    column: 'attachmentFileId',
    kind: 'UNUSED',
    evidence: 'Storage moduli ulanmagan — cash-entries.service.ts bu maydonni yozmaydi.',
  },
  {
    model: 'Customer',
    column: 'passportFileId',
    kind: 'UNUSED',
    evidence: 'Storage moduli ulanmagan — customers servisi bu maydonni yozmaydi.',
  },
  {
    model: 'Document',
    column: 'fileId',
    kind: 'UNUSED',
    evidence: 'Storage moduli ulanmagan, `Document` moduli ham yozilmagan (NO_MODULE bilan qo\'shiladi).',
  },
  {
    model: 'Payment',
    column: 'receiptFileId',
    kind: 'UNUSED',
    evidence: 'Storage moduli ulanmagan — payments.service.ts bu maydonni yozmaydi.',
  },
  {
    model: 'Product',
    column: 'imageFileId',
    kind: 'UNUSED',
    evidence: 'Storage moduli ulanmagan — catalog/product.service.ts bu maydonni yozmaydi.',
  },
  {
    model: 'Shop',
    column: 'logoFileId',
    kind: 'UNUSED',
    evidence: 'Storage moduli ulanmagan — shop sozlamalari servisi bu maydonni yozmaydi.',
  },

  // ── NO_MODULE (4) — moduli umuman yozilmagan, xavfsizligi baholanmaydi.
  {
    model: 'Document',
    column: 'contractId',
    kind: 'NO_MODULE',
    evidence: '`Document` moduli (nasiya shartnoma PDF) hali yozilmagan.',
  },
  {
    model: 'NotificationLog',
    column: 'scheduleId',
    kind: 'NO_MODULE',
    evidence: 'Bildirishnoma rejalashtiruvchi/worker moduli hali yozilmagan.',
  },
  {
    model: 'StocktakeLine',
    column: 'inventoryItemId',
    kind: 'NO_MODULE',
    evidence: 'Inventarizatsiya (stocktake) moduli hali yozilmagan.',
  },
  {
    model: 'StocktakeLine',
    column: 'productId',
    kind: 'NO_MODULE',
    evidence: 'Inventarizatsiya (stocktake) moduli hali yozilmagan.',
  },
];

interface SchemaFkSite {
  model: string;
  field: string;
  target: string;
  columns: string[];
}

/**
 * `schema.prisma`ni satr-satr o'qib, har bir `model X { ... }` bloki
 * ichidagi `@relation(fields: [...], references: [...])` yozuvlarini
 * topadi. Orqaga-relation tomoni (masalan `sales Sale[]`) `fields:` ga ega
 * emas — u ATAYLAB o'tkazib yuboriladi, chunki FK USTUNI faqat "egasi"
 * tomonda mavjud.
 *
 * Bitta jismoniy qatorli deb faraz qilinadi — schema butun loyihada
 * shunday formatlangan (`prisma format` natijasi), va joriy holatda BARCHA
 * `@relation(fields: …)` yozuvlari tekshirilib chiqilgan (bir qatorli).
 * Agar formatlash o'zgarib ko'p qatorli bo'lib qolsa, bu funksiya yozuvni
 * shunchaki KO'RMAYDI — natijada u schema'dagi FK sonidan kam FK
 * qaytaradi va pastdagi "schema'da bor-u ro'yxatda yo'q" testi ES EMAS,
 * balki umumiy sanoq testi (`EXPECTED_SCOPED_FK_COUNT`) qulaydi va bu
 * xatoni ushlaydi.
 */
function parseRelationSites(schema: string): SchemaFkSite[] {
  const sites: SchemaFkSite[] = [];
  let currentModel: string | null = null;

  for (const line of schema.split('\n')) {
    const modelStart = /^model\s+(\w+)\s*\{/.exec(line);
    if (modelStart) {
      currentModel = modelStart[1] ?? null;
      continue;
    }
    if (line === '}') {
      currentModel = null;
      continue;
    }
    if (currentModel === null) continue;

    const relationField = /^\s*(\w+)\s+(\w+)\??\s+@relation\(([^)]*)\)/.exec(line);
    if (!relationField) continue;
    const [, field, target, attrs] = relationField;
    if (field === undefined || target === undefined || attrs === undefined) continue;

    const fieldsMatch = /fields:\s*\[([^\]]+)\]/.exec(attrs);
    if (!fieldsMatch) continue; // orqaga-relation tomoni — FK ustuni bu yerda emas

    const columnsRaw = fieldsMatch[1];
    if (columnsRaw === undefined) continue;
    const columns = columnsRaw
      .split(',')
      .map((column) => column.trim())
      .filter((column) => column.length > 0);

    sites.push({ model: currentModel, field, target, columns });
  }

  return sites;
}

const schemaSource = readFileSync(SCHEMA_PATH, 'utf8');
const allRelationSites = parseRelationSites(schemaSource);

/**
 * Nishoni shop-scoped BO'LGAN FK'lar — `SHOP_SCOPE_EXEMPT_MODELS` dan
 * (`prisma.service.ts`) o'qiladi, bu yerda QO'LDA TAKRORLANMAYDI. Aks
 * holda ikkita ro'yxat ajralib ketardi: biri RLS qatlamini, ikkinchisi
 * shu testni belgilaydi va ular sinxrondan chiqib qolishi mumkin edi.
 *
 * `Shop`ning o'zi ham shu ro'yxatda (u tenant chegarasining o'zi) —
 * shuning uchun bu yerda deyarli har bir modeldagi `shop Shop
 * @relation(fields: [shopId], …)` chiqarib tashlanadi va faqat BOSHQA
 * shop-scoped modelga ishora qiluvchi FK'lar qoladi — aynan T-01
 * xavfi shu turdagilarda.
 */
const scopedSites = allRelationSites.filter((site) => !SHOP_SCOPE_EXEMPT_MODELS.has(site.target));

const compositeSites = scopedSites.filter((site) => site.columns.length > 1);
const singleColumnSites = scopedSites.filter((site) => site.columns.length === 1);

function fkKey(model: string, column: string): string {
  return `${model}.${column}`;
}

const classifiedByKey = new Map(CLASSIFIED_FKS.map((entry) => [fkKey(entry.model, entry.column), entry]));

describe("shop-scoped FK'lar tenant chegarasi bo'yicha tasniflangan (T-01, §21.13)", () => {
  it('schema o\'qildi va kutilgan miqdorda FK topildi (parser o\'zi ishlayaptimi)', () => {
    // Naqsh o'zgarib parser hech narsa topmay qolsa, pastdagi testlar
    // "buzilish yo'q" deb jimgina yashil bo'lib qolardi (§21.8 dagi
    // "ro'yxat bloklari umuman topiladi" bilan bir xil mulohaza).
    expect(allRelationSites.length).toBeGreaterThan(30);
  });

  it('har bir bir ustunli shop-scoped FK qotirilgan tasnif ro\'yxatida bor', () => {
    const unclassified = singleColumnSites.filter(
      (site) => !classifiedByKey.has(fkKey(site.model, site.columns[0] ?? '')),
    );

    expect(
      unclassified.map(
        (site) =>
          `${site.model}.${site.columns[0] ?? '?'} -> ${site.target} — tasniflanmagan. ` +
          "Yangi bir ustunli FK qo'shildi; uni KOMPOZIT qiling " +
          '([xId, shopId] -> [id, shopId], ota modelda @@unique([id, shopId]) bilan birga) ' +
          "YOKI TRIGGER/SERVIS/SERVER/UNUSED/NO_MODULE bilan tasniflab " +
          '`tenant-fk-audit.spec.ts` dagi CLASSIFIED_FKS ro\'yxatiga DALIL bilan qo\'shing.',
      ),
    ).toEqual([]);
  });

  it("tasnif ro'yxatidagi har bir yozuv schema'da HALI HAM mavjud (eskirgan yozuv yo'q)", () => {
    const scopedKeys = new Set(singleColumnSites.map((site) => fkKey(site.model, site.columns[0] ?? '')));

    const stale = CLASSIFIED_FKS.filter((entry) => !scopedKeys.has(fkKey(entry.model, entry.column)));

    expect(
      stale.map(
        (entry) =>
          `${entry.model}.${entry.column} (${entry.kind}) — schema'da endi topilmadi yoki kompozitga ` +
          "aylantirilgan. CLASSIFIED_FKS dan olib tashlang: ro'yxat eskirmasin.",
      ),
    ).toEqual([]);
  });

  it('bir ustunli shop-scoped FK soni ro\'yxat uzunligi bilan mos (33)', () => {
    // Ikkala yuqoridagi test ham "har biri boshqasida bor"ligini
    // tekshiradi, lekin ular duplikatlarni sezmaydi (Map kalit ustida
    // ishlaydi). Son testi buni yopadi.
    expect(singleColumnSites.length).toBe(CLASSIFIED_FKS.length);
  });

  describe.each(['TRIGGER', 'SERVIS', 'SERVER', 'UNUSED', 'NO_MODULE'] as const)('%s toifasi', (kind) => {
    it(`kamida bitta yozuvga ega (bo'sh toifa — tasnif chirigan degani)`, () => {
      expect(CLASSIFIED_FKS.filter((entry) => entry.kind === kind).length).toBeGreaterThan(0);
    });
  });

  it('har bir tasniflangan yozuvda qisqa DALIL izohi bor (bo\'sh emas)', () => {
    const missingEvidence = CLASSIFIED_FKS.filter((entry) => entry.evidence.trim().length < 10);
    expect(missingEvidence.map((entry) => fkKey(entry.model, entry.column))).toEqual([]);
  });
});

describe("kompozit FK'lar — T-01 ning STRUKTURAVIY yopilishi (§21.13)", () => {
  const MIN_COMPOSITE_FK_COUNT = 6;

  it(
    `kompozit (ikki ustunli, [xId, shopId] -> [id, shopId]) FK soni kamida ` +
      `${String(MIN_COMPOSITE_FK_COUNT)} ta`,
    () => {
      // KAMAYISH — kimdir kompozit FK'ni oddiy bir ustunliga qaytarib
      // qo'ygani degani (T-01 turidagi teshik qayta ochiladi). Bu yerda
      // faqat pastga cheklov: kompozit sonining OSHISHI (yangi bola
      // jadval qo'shilishi) muammo emas, shuning uchun aniq tenglik emas,
      // `toBeGreaterThanOrEqual` ishlatiladi.
      expect(
        compositeSites.length,
        compositeSites.length < MIN_COMPOSITE_FK_COUNT
          ? 'Kompozit FK soni kamaydi: ' +
              compositeSites.map((site) => `${site.model}.${site.field}`).join(', ') +
              " — biror kompozit FK oddiy bir ustunliga qaytarilgan bo'lishi mumkin (T-01 xavfi)."
          : undefined,
      ).toBeGreaterThanOrEqual(MIN_COMPOSITE_FK_COUNT);
    },
  );

  it('hozirgi kompozit FK ro\'yxati kutilganidek (regressiya isboti)', () => {
    // Aniq ro'yxat — sonli test ("kamida 6") duplikatni yoki noto'g'ri
    // modeldagi almashtirishni ko'rmasligi mumkin (masalan bittasi
    // yo'qolib, boshqa joyda tasodifan yangisi paydo bo'lsa son bir xil
    // qoladi). Bu test aniq nomlarni tekshiradi.
    const names = compositeSites.map((site) => `${site.model}.${site.field}`).sort();

    expect(names).toEqual(
      [
        'NotificationLog.customer',
        'PaymentAllocation.payment',
        'PaymentSchedule.contract',
        'Sale.customer',
        'SaleItem.sale',
        'StocktakeLine.stocktake',
      ].sort(),
    );
  });
});
