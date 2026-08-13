import { Injectable } from '@nestjs/common';
import type { ShopDto, UpdateShopInput } from '@hisobai/contracts';
import { Prisma, type Shop } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { auditDiff, hasChanges, type AuditDiff } from '../common/audit-diff';
import { staleResource, type Precondition } from '../common/optimistic-lock';
import { isRecordNotFound } from '../common/prisma-errors';
import type { RequestUser } from '../common/request-user';
import { PrismaService } from '../database/prisma.service';
import { requireShopId } from '../database/shop-context';

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

  /** `Shop` seed/`POST /shops` (kelajakdagi Platform oqimi) bilan yaratiladi — bu yerda upsert yo'q. */
  async get(): Promise<ShopDto> {
    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: requireShopId() } });
    return toDto(shop);
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
        await this.audit.record(tx, {
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
