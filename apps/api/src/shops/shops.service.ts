import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { CashAccountKind, Currency, ErrorCode, type CreateShopInput, type ShopDto, type UpdateShopInput } from '@hisobai/contracts';
import { Prisma, type Shop } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app.exception';
import { auditDiff, hasChanges, type AuditDiff } from '../common/audit-diff';
import { staleResource, type Precondition } from '../common/optimistic-lock';
import { isRecordNotFound } from '../common/prisma-errors';
import type { RequestUser } from '../common/request-user';
import { PrismaService } from '../database/prisma.service';
import { requireShopId, runWithShopScope } from '../database/shop-context';

/**
 * §11.10 — tizim kassa kategoriyalari; setup'da bir marta yaratiladi.
 *
 * **`prisma/seed.mts` bilan ataylab qayta yozilgan (import qilinmagan).**
 * Seed — bazaviy, `src/`dan mustaqil bootstrap skripti (o'z
 * `PrismaClient`i, `withShopScope` extension'isiz, faqat `postgres`
 * superuser bilan ishlaydi) — bu ataylab shunday, chunki u ilova
 * ishga tushishidan OLDIN, hatto ilova kodi buzuq bo'lsa ham ishlashi
 * kerak. `src/`ga bog'lansa, bu mustaqillik yo'qolardi. Ikkala ro'yxat
 * ham §11.10 dagi bir xil qarorni aks ettiradi — o'zgarsa ikkalasi ham
 * yangilanadi (hozircha CI'da avtomatik tekshiruv yo'q, lekin ro'yxat
 * qisqa va kamdan-kam o'zgaradi).
 */
const CASH_CATEGORIES = [
  { slug: 'ijara', name: 'Ijara', direction: 'OUT' as const },
  { slug: 'kommunal', name: 'Kommunal', direction: 'OUT' as const },
  { slug: 'maosh', name: 'Maosh', direction: 'OUT' as const },
  { slug: 'reklama', name: 'Reklama', direction: 'OUT' as const },
  { slug: 'yetkazib-berish', name: 'Yetkazib berish', direction: 'OUT' as const },
  { slug: 'boshqa-chiqim', name: 'Boshqa chiqim', direction: 'OUT' as const },
  { slug: 'boshqa-kirim', name: 'Boshqa kirim', direction: 'IN' as const },
];

/** §11.1 — naqd va karta puli alohida hisoblarda yuritiladi. */
const CASH_ACCOUNTS = [
  { name: 'Naqd', currency: Currency.UZS, kind: CashAccountKind.CASH, sortOrder: 1 },
  { name: 'Naqd', currency: Currency.USD, kind: CashAccountKind.CASH, sortOrder: 2 },
  { name: 'Karta', currency: Currency.UZS, kind: CashAccountKind.CARD, sortOrder: 3 },
];

/**
 * Do'kon ma'lumoti va biznes sozlamalari (§3.6–§3.10, §21.4).
 *
 * Eski `settings` (bitta qator, `id` doim 1) `shops` ga aylandi — har
 * Shop o'z qatoriga ega. `Shop` `prisma.service.ts`dagi
 * `SHOP_SCOPE_EXEMPT_MODELS` ro'yxatida: u tenant chegarasining O'ZI,
 * shuning uchun RLS/extension uni avtomatik filtrlamaydi (`User` bilan
 * bir xil holat). `requireShopId()` shu sabab qo'lda ishlatiladi — bu
 * `where: { shopId }` YOZISH emas (§21.7 aynan shundan qaytaradi), balki
 * "qaysi Shop qatorini o'qiyapmiz" degan `id` filtri, xuddi
 * `user.findUnique({ where: { id } })` kabi.
 *
 * Bu servis `@ShopExempt()` qo'yilmagan endpoint'lardan chaqiriladi,
 * ya'ni `RolesGuard` allaqachon `shopId !== null`ligini tekshirgan
 * bo'ladi (`SHOP_SETUP_REQUIRED`, §21.10) — `requireShopId()` shu yerda
 * hech qachon xato tashlamaydi, lekin baribir "kim buni kafolatlaydi"
 * degan savolga aniq javob beradi (o'zining xato matni orqali).
 */
@Injectable()
export class ShopsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** `Shop` seed/`POST /shops` bilan yaratiladi — bu yerda upsert yo'q. */
  async get(): Promise<ShopDto> {
    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: requireShopId() } });
    return toDto(shop);
  }

  /**
   * `POST /shops` — SHOP_ADMIN o'ziga Shop yaratadi (§25.6, §25.7).
   *
   * **Tovuq-tuxum muammosi va uning yechimi.** Bu chaqiruv paytida
   * `actor.shopId === null` — `RolesGuard` buni `@ShopExempt()` orqali
   * o'tkazib yuborgan (pastga qarang, kontroller). Demak `ShopContextInterceptor`
   * hech qanday ambient Shop kontekstini OCHMAGAN (u faqat `shopId`
   * satr bo'lsa ochadi) — bu so'rov davomida `runWithShopScope()` hech
   * qachon chaqirilmagan. Lekin yaratilayotgan `CashCategory`/`CashAccount`
   * qatorlari shop-scoped (RLS + `dbgenerated` default, §21.13) va
   * kontekstsiz `SHOP_CONTEXT_MISSING` bilan qulaydi (yoki, agar chora
   * ko'rilmasa, "aynan RLS yopgan" — chaqiruvchi buni sinab ko'rmaguncha
   * bilmaydi).
   *
   * Yechim ikki qadamli:
   *
   *  1. `Shop.id` **oldindan, clientda** (`randomUUID()`) yaratiladi —
   *     Prisma `@default(uuid())`ni override qilishga ruxsat beradi.
   *     Endi Shop hali bazada yo'q bo'lsa ham, uning `id`si MA'LUM.
   *  2. Butun tranzaksiya shu ma'lum `id` bilan `runWithShopScope(shopId, …)`
   *     ichiga o'raladi. `Shop`ning o'zi baribir chiqarilgan model
   *     (`SHOP_SCOPE_EXEMPT_MODELS`) — kontekst unga tegmaydi, RLS'ga
   *     ham tegishli emas. Ammo `CashCategory`/`CashAccount` yaratilganda
   *     extension endi ambient `shopId`ni ko'radi va `set_config` ni shu
   *     tranzaksiya boshida qo'yadi (`decideTransaction`) — natijada RLS
   *     `WITH CHECK`i yangi qatorlarning `shop_id`si aynan hozir
   *     yaratilayotgan Shop bilan bir xilligini ULARNI QO'LDA YOZMASDAN
   *     tasdiqlaydi (§21.7). Agar bu ataylab qilinmasa, ikkita muvaffaqiyatsizlik
   *     rejimidan biri chiqardi: kontekst umuman yo'q bo'lsa
   *     `SHOP_CONTEXT_MISSING` (§21.15dagi "aniq xato" yo'li); yoki —
   *     xato QILIB — chaqiruvchi `shopId`ni QO'LDA yozsa, buzilgan yoki
   *     eskirgan qiymat RLS tekshiruvidan sezilmasdan o'tib ketishi
   *     mumkin bo'lardi (`WITH CHECK` faqat mos kelishini, TO'G'RI Shop
   *     ekanini emas tasdiqlaydi). `runWithShopScope` ikkalasini ham
   *     yo'qqa chiqaradi: yagona haqiqat manbai — shu funksiyaga
   *     uzatilgan `shopId`, va u har doim yangi yaratilgan Shop'ning
   *     ANIQ o'zi (boshqa hech qanday qiymat emas).
   *
   * **Nega `User.shopId`ni yangilash ham shu tranzaksiyada.** `User`
   * chiqarilgan model, kontekstga bog'liq emas — lekin §25.7 (1 SHOP_ADMIN
   * = 1 SHOP) atomik tekshiruvni talab qiladi: `updateMany({ where: {
   * id: actor.id, shopId: null }, … })` bilan "hali Shop yo'qmi" sharti
   * VA yozuv bitta amalda bajariladi. Ikki parallel `POST /shops`
   * so'rovidan faqat bittasi `count: 1` oladi — ikkinchisi `count: 0`
   * ko'radi va `SHOP_ALREADY_EXISTS` bilan rad etiladi. Alohida
   * `SELECT` bilan tekshirish TOCTOU poygasi bo'lardi (§17.5 bilan bir
   * xil naqsh).
   */
  async createShop(
    actor: RequestUser,
    input: CreateShopInput,
    ip: string | null,
  ): Promise<ShopDto> {
    const shopId = randomUUID();

    return runWithShopScope(shopId, () =>
      this.prisma.$transaction(async (tx) => {
        const shop = await tx.shop.create({
          data: { id: shopId, ...toCreateData(input), updatedById: actor.id },
        });

        const claimed = await tx.user.updateMany({
          where: { id: actor.id, shopId: null },
          data: { shopId: shop.id },
        });
        if (claimed.count === 0) {
          // §25.7 — ikkinchi urinish. `Shop` qatori allaqachon yaratilgan
          // bo'lsa ham, tranzaksiya BUTUNLAY qaytariladi (xato tashlash
          // Prisma `$transaction`ni avtomatik `ROLLBACK` qiladi) — orfan
          // Shop qatori qolmaydi.
          throw AppException.conflict(
            ErrorCode.SHOP_ALREADY_EXISTS,
            "Sizda allaqachon do'kon bor.",
          );
        }

        // §11.10 — boshlang'ich kassa hisoblari va kategoriyalari.
        // `shopId` QO'LDA YOZILMAYDI (§21.7) — ustundagi `dbgenerated`
        // default yuqoridagi `runWithShopScope` o'rnatgan ambient
        // kontekstdan avtomatik to'ldiradi.
        for (const category of CASH_CATEGORIES) {
          await tx.cashCategory.create({
            data: { ...category, isSystem: true } as Prisma.CashCategoryUncheckedCreateInput,
          });
        }
        for (const account of CASH_ACCOUNTS) {
          await tx.cashAccount.create({
            data: account as Prisma.CashAccountUncheckedCreateInput,
          });
        }

        await this.audit.record(tx, shop.id, {
          actorId: actor.id,
          action: 'SHOP_CREATED',
          entityType: 'Shop',
          entityId: shop.id,
          after: { name: shop.name },
          ip,
        });

        return toDto(shop);
      }),
    );
  }

  /**
   * §3.10 — o'zgarish audit'ga yoziladi: kim, qachon, **nimadan nimaga**.
   *
   * Audit'ga faqat haqiqatan o'zgargan maydonlar tushadi. Butun obyektni
   * yozish jurnalni o'qib bo'lmaydigan qiladi: "kurs ustamasi 0 dan 2 ga
   * o'zgardi" degan savolga javob 20 ta o'zgarmagan maydon orasidan
   * qidiriladi.
   */
  async update(
    actor: RequestUser,
    input: UpdateShopInput,
    precondition: Precondition,
    ip: string | null,
  ): Promise<ShopDto> {
    const shopId = requireShopId();

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.shop.findUniqueOrThrow({ where: { id: shopId } });

      const data = toPrismaData(input);

      /**
       * `updatedAt` `WHERE` shartida — tekshiruv va yozuv bitta atomik
       * amal bo'ladi (`API.md` §8, §17.5 naqshi). Avval `before` bilan
       * solishtirilsa, ikki parallel `PATCH` orasida poyga qolardi:
       * `READ COMMITTED` da ikkalasi ham bir xil `before` ni ko'radi.
       */
      const after = await tx.shop
        .update({
          where: { id: shopId, updatedAt: precondition.updatedAt },
          data: { ...data, updatedById: actor.id },
        })
        .catch(async (error: unknown) => {
          if (!isRecordNotFound(error)) throw error;
          // Qator hech qachon o'chirilmaydi — demak faqat `updatedAt` mos
          // kelmagan. Haqiqiy qiymatni qayta o'qiymiz: `before` poyga
          // holatida allaqachon eskirgan bo'lishi mumkin.
          const current = await tx.shop.findUniqueOrThrow({ where: { id: shopId } });
          throw staleResource(current.updatedAt, precondition.expected);
        });

      const changes = diff(before, after);
      if (hasChanges(changes)) {
        await this.audit.record(tx, actor.shopId, {
          actorId: actor.id,
          action: 'SHOP_UPDATED',
          entityType: 'Shop',
          entityId: shopId,
          before: changes.before,
          after: changes.after,
          ip,
        });
      }

      return toDto(after);
    });
  }
}

/** `POST /shops` — faqat `name` majburiy, qolgani `Shop` default'lari bilan boshlanadi. */
function toCreateData(input: CreateShopInput): Prisma.ShopUncheckedCreateInput {
  const data: Prisma.ShopUncheckedCreateInput = { name: input.name };

  if (input.address !== undefined) data.address = input.address;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.workStart !== undefined) data.workStart = input.workStart;
  if (input.workEnd !== undefined) data.workEnd = input.workEnd;
  if (input.weekendDays !== undefined) data.weekendDays = input.weekendDays;
  if (input.lowStockThreshold !== undefined) data.lowStockThreshold = input.lowStockThreshold;
  if (input.defaultInstallmentMonths !== undefined) {
    data.defaultInstallmentMonths = input.defaultInstallmentMonths;
  }
  if (input.defaultDownPaymentPercent !== undefined) {
    data.defaultDownPaymentPercent = new Prisma.Decimal(input.defaultDownPaymentPercent);
  }
  if (input.storeRateMarkupPercent !== undefined) {
    data.storeRateMarkupPercent = new Prisma.Decimal(input.storeRateMarkupPercent);
  }
  if (input.reminderHour !== undefined) data.reminderHour = input.reminderHour;

  return data;
}

// `Unchecked` — `updatedById` skalyar FK sifatida yoziladi; `Checked`
// varianti relation obyektini talab qilardi va u bu yerda ortiqcha.
function toPrismaData(input: UpdateShopInput): Prisma.ShopUncheckedUpdateInput {
  const data: Prisma.ShopUncheckedUpdateInput = {};

  if (input.name !== undefined) data.name = input.name;
  if (input.address !== undefined) data.address = input.address;
  if (input.phone !== undefined) data.phone = input.phone;
  if (input.workStart !== undefined) data.workStart = input.workStart;
  if (input.workEnd !== undefined) data.workEnd = input.workEnd;
  if (input.weekendDays !== undefined) data.weekendDays = input.weekendDays;
  if (input.lowStockThreshold !== undefined) data.lowStockThreshold = input.lowStockThreshold;
  if (input.defaultInstallmentMonths !== undefined) {
    data.defaultInstallmentMonths = input.defaultInstallmentMonths;
  }
  // Decimal maydonlar satrdan quriladi — oraliqda `number` bo'lib qolmaydi (§17.14)
  if (input.defaultDownPaymentPercent !== undefined) {
    data.defaultDownPaymentPercent = new Prisma.Decimal(input.defaultDownPaymentPercent);
  }
  if (input.storeRateMarkupPercent !== undefined) {
    data.storeRateMarkupPercent = new Prisma.Decimal(input.storeRateMarkupPercent);
  }
  if (input.reminderHour !== undefined) data.reminderHour = input.reminderHour;

  return data;
}

/**
 * Faqat o'zgargan maydonlar — audit o'qiladigan bo'lib qolsin.
 *
 * Hisob `common/audit-diff.ts` da: katalog moduli ham xuddi shu
 * xulqni talab qiladi, ikki nusxa esa bir kun chetga chiqardi.
 */
function diff(before: Shop, after: Shop): AuditDiff {
  return auditDiff(
    toDto(before) as unknown as Record<string, unknown>,
    toDto(after) as unknown as Record<string, unknown>,
  );
}

function toDto(shop: Shop): ShopDto {
  return {
    id: shop.id,
    name: shop.name,
    logoFileId: shop.logoFileId,
    address: shop.address,
    phone: shop.phone,
    workStart: shop.workStart,
    workEnd: shop.workEnd,
    weekendDays: shop.weekendDays,
    lowStockThreshold: shop.lowStockThreshold,
    defaultInstallmentMonths: shop.defaultInstallmentMonths,
    // Decimal → satr (`API.md` §2.1)
    defaultDownPaymentPercent: shop.defaultDownPaymentPercent.toString(),
    storeRateMarkupPercent: shop.storeRateMarkupPercent.toString(),
    reminderHour: shop.reminderHour,
    updatedAt: shop.updatedAt.toISOString(),
    updatedById: shop.updatedById,
  };
}
