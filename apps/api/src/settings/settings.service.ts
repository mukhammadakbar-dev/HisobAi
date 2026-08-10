import { Injectable } from '@nestjs/common';
import type { SettingsDto, UpdateSettingsInput } from '@hisobai/contracts';
import { Prisma, type Settings } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { staleResource, type Precondition } from '../common/optimistic-lock';
import type { RequestUser } from '../common/request-user';
import { PrismaService } from '../database/prisma.service';

/** Sozlamalar bitta qator — `settings.id` doim 1 (`API.md` §2.3). */
const SETTINGS_ID = 1;

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Qator yo'q bo'lsa yaratiladi.
   *
   * Seed uni allaqachon qo'yadi, lekin seed ishlatilmagan bazada
   * `GET /settings` 404 qaytarishi — foydalanuvchiga hech narsa
   * tushuntirmaydigan xato. Standart qiymatlar schema'da bor.
   */
  async get(): Promise<SettingsDto> {
    const settings = await this.prisma.settings.upsert({
      where: { id: SETTINGS_ID },
      update: {},
      create: { id: SETTINGS_ID },
    });
    return toDto(settings);
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
    input: UpdateSettingsInput,
    precondition: Precondition,
    ip: string | null,
  ): Promise<SettingsDto> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.settings.upsert({
        where: { id: SETTINGS_ID },
        update: {},
        create: { id: SETTINGS_ID },
      });

      const data = toPrismaData(input);

      /**
       * `updatedAt` `WHERE` shartida — tekshiruv va yozuv bitta atomik
       * amal bo'ladi (`API.md` §8, §17.5 naqshi). Avval `before` bilan
       * solishtirilsa, ikki parallel `PATCH` orasida poyga qolardi:
       * `READ COMMITTED` da ikkalasi ham bir xil `before` ni ko'radi.
       */
      const after = await tx.settings
        .update({
          where: { id: SETTINGS_ID, updatedAt: precondition.updatedAt },
          data: { ...data, updatedById: actor.id },
        })
        .catch(async (error: unknown) => {
          if (!isRecordNotFound(error)) throw error;
          // Qator hech qachon o'chirilmaydi (yuqoridagi `upsert`) — demak
          // faqat `updatedAt` mos kelmagan. Haqiqiy qiymatni qayta o'qiymiz:
          // `before` poyga holatida allaqachon eskirgan bo'lishi mumkin.
          const current = await tx.settings.findUniqueOrThrow({ where: { id: SETTINGS_ID } });
          throw staleResource(current.updatedAt, precondition.expected);
        });

      const changes = diff(before, after);
      if (Object.keys(changes.before).length > 0) {
        await this.audit.record(tx, {
          actorId: actor.id,
          action: 'SETTINGS_UPDATED',
          entityType: 'Settings',
          entityId: String(SETTINGS_ID),
          before: changes.before,
          after: changes.after,
          ip,
        });
      }

      return toDto(after);
    });
  }
}

/** `P2025` — `WHERE` shartiga mos qator topilmadi. */
function isRecordNotFound(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';
}

// `Unchecked` — `updatedById` skalyar FK sifatida yoziladi; `Checked`
// varianti relation obyektini talab qilardi va u bu yerda ortiqcha.
function toPrismaData(input: UpdateSettingsInput): Prisma.SettingsUncheckedUpdateInput {
  const data: Prisma.SettingsUncheckedUpdateInput = {};

  if (input.shopName !== undefined) data.shopName = input.shopName;
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

/** Faqat o'zgargan maydonlar — audit o'qiladigan bo'lib qolsin. */
function diff(
  before: Settings,
  after: Settings,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const beforeChanges: Record<string, unknown> = {};
  const afterChanges: Record<string, unknown> = {};

  const beforeDto = toDto(before) as unknown as Record<string, unknown>;
  const afterDto = toDto(after) as unknown as Record<string, unknown>;

  for (const key of Object.keys(afterDto)) {
    // `updatedAt` va `updatedById` har o'zgarishda farq qiladi — ular
    // audit yozuvining o'zida allaqachon bor
    if (key === 'updatedAt' || key === 'updatedById') continue;

    const previous = beforeDto[key];
    const next = afterDto[key];
    if (JSON.stringify(previous) === JSON.stringify(next)) continue;

    beforeChanges[key] = previous;
    afterChanges[key] = next;
  }

  return { before: beforeChanges, after: afterChanges };
}

function toDto(settings: Settings): SettingsDto {
  return {
    shopName: settings.shopName,
    logoFileId: settings.logoFileId,
    address: settings.address,
    phone: settings.phone,
    workStart: settings.workStart,
    workEnd: settings.workEnd,
    weekendDays: settings.weekendDays,
    lowStockThreshold: settings.lowStockThreshold,
    defaultInstallmentMonths: settings.defaultInstallmentMonths,
    // Decimal → satr (`API.md` §2.1)
    defaultDownPaymentPercent: settings.defaultDownPaymentPercent.toString(),
    storeRateMarkupPercent: settings.storeRateMarkupPercent.toString(),
    reminderHour: settings.reminderHour,
    updatedAt: settings.updatedAt.toISOString(),
    updatedById: settings.updatedById,
  };
}
