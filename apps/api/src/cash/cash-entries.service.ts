import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CashDirection,
  CashSourceType,
  ErrorCode,
  roundMoney,
  type CashEntryDto,
  type CashEntryQuery,
  type CashExchangeDto,
  type CashExchangeInput,
  type CreateCashEntryInput,
  type OpeningBalanceInput,
  type Currency,
  type Page,
  type UpdateCashEntryInput,
} from '@hisobai/contracts';
import { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app.exception';
import { businessDay, dayRangeFilter } from '../common/dates';
import { staleResource, type Precondition } from '../common/optimistic-lock';
import { normalizeLimit, toPage, toPrismaCursor } from '../common/pagination';
import { isRecordNotFound } from '../common/prisma-errors';
import type { RequestUser } from '../common/request-user';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { CashAccountsService } from './cash-accounts.service';
import { ENTRY_INCLUDE, toEntryDto, toExchangeDto } from './cash.mappers';

/**
 * Kassa yozuvlari (§11.4–§11.9).
 *
 * Bu servis **pul qayerdan kirdi** degan savolga javob beradi va uning
 * eng muhim qoidasi — nima **qila olmasligi**: savdo bu yerga
 * to'g'ridan-to'g'ri yozmaydi (§17.2). Kassaga pul faqat to'lov orqali
 * tushadi, shuning uchun to'lovdan keladigan yagona yo'l
 * `createFromPayment` — u savdo tasdiqlash tranzaksiyasi ichidan
 * chaqiriladi va `sourceType: PAYMENT` qo'yadi.
 *
 * Qo'lda kiritilgan yozuv esa `MANUAL` bo'ladi va faqat o'sha kuni
 * tahrirlanadi (§11.8); avtomatik yozuv hech qachon (§11.7).
 */
@Injectable()
export class CashEntriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounts: CashAccountsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get timeZone(): string {
    return this.config.get('TIMEZONE', { infer: true });
  }

  async list(query: CashEntryQuery): Promise<Page<CashEntryDto>> {
    const limit = normalizeLimit(query.limit);
    const occurredAt = dayRangeFilter(query.from, query.to, this.timeZone);

    const rows = await this.prisma.cashEntry.findMany({
      where: {
        accountId: query.accountId,
        direction: query.direction,
        categoryId: query.categoryId,
        sourceType: query.sourceType ? { in: query.sourceType } : undefined,
        ...(occurredAt ? { occurredAt } : {}),
      },
      include: ENTRY_INCLUDE,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      ...toPrismaCursor(query.cursor, limit),
    });

    const now = new Date();
    return toPage(
      rows.map((row) => toEntryDto(row, this.timeZone, now)),
      limit,
      (dto) => dto.occurredAt,
    );
  }

  // ──────────────────────── Qo'lda kirim/chiqim (§11.9) ────────────────────────

  async create(
    input: CreateCashEntryInput,
    actor: RequestUser,
    ip: string | null,
  ): Promise<CashEntryDto> {
    const occurredAt = this.resolveOccurredAt(input.occurredAt);

    return this.prisma.$transaction(async (tx) => {
      const account = await this.accounts.requireActiveAccount(tx, input.accountId, 'accountId');
      await this.assertCategoryFits(tx, input.categoryId ?? null, input.direction);

      const entry = await tx.cashEntry.create({
        data: {
          accountId: account.id,
          direction: input.direction,
          // §1.10 — yaxlitlash yozishdan OLDIN, hisob valyutasi bo'yicha
          amount: new Prisma.Decimal(roundMoney(input.amount, account.currency)),
          // Valyuta hisobdan olinadi: client tanlagan valyuta hisobnikidan
          // farq qilsa, qoldiq ikki valyutaning aralashmasi bo'lib qolardi
          currency: account.currency,
          occurredAt,
          categoryId: input.categoryId ?? null,
          sourceType: CashSourceType.MANUAL,
          note: input.note ?? null,
          createdById: actor.id,
        },
        include: ENTRY_INCLUDE,
      });

      await this.audit.record(tx, actor.shopId, {
        actorId: actor.id,
        action: 'CASH_ENTRY_CREATED',
        entityType: 'CashEntry',
        entityId: entry.id,
        after: {
          accountId: entry.accountId,
          direction: entry.direction,
          amount: entry.amount,
          currency: entry.currency,
          occurredAt: entry.occurredAt.toISOString(),
        },
        ip,
      });

      return toEntryDto(entry, this.timeZone, new Date());
    });
  }

  async update(
    id: string,
    input: UpdateCashEntryInput,
    precondition: Precondition,
    actor: RequestUser,
    ip: string | null,
  ): Promise<CashEntryDto> {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.cashEntry.findUnique({
        where: { id },
        include: ENTRY_INCLUDE,
      });
      if (!before) throw entryNotFound();
      this.assertEditable(before.sourceType, before.createdAt);

      const data: Prisma.CashEntryUpdateInput = {};
      if (input.amount !== undefined) {
        data.amount = new Prisma.Decimal(roundMoney(input.amount, before.currency));
      }
      if (input.categoryId !== undefined) {
        await this.assertCategoryFits(tx, input.categoryId, before.direction);
        data.category = input.categoryId
          ? { connect: { id: input.categoryId } }
          : { disconnect: true };
      }
      if (input.note !== undefined) data.note = input.note;

      const after = await tx.cashEntry
        .update({
          where: { id, updatedAt: precondition.updatedAt },
          data,
          include: ENTRY_INCLUDE,
        })
        .catch(async (error: unknown) => {
          if (isRecordNotFound(error)) {
            const current = await tx.cashEntry.findUnique({ where: { id } });
            throw staleResource(current?.updatedAt ?? before.updatedAt, precondition.expected);
          }
          throw error;
        });

      await this.audit.record(tx, actor.shopId, {
        actorId: actor.id,
        action: 'CASH_ENTRY_UPDATED',
        entityType: 'CashEntry',
        entityId: id,
        before: { amount: before.amount, categoryId: before.categoryId, note: before.note },
        after: { amount: after.amount, categoryId: after.categoryId, note: after.note },
        ip,
      });

      return toEntryDto(after, this.timeZone, new Date());
    });
  }

  /**
   * §11.8 — o'sha kuni ichida o'chirish.
   *
   * Ertasiga yozuv **teskari yozuv** bilan tuzatiladi (u qaytarish
   * moduli bilan, 6-bosqichda keladi): o'tgan kunning kassa hisoboti
   * bir marta chiqarilgandan keyin o'zgarmasligi kerak.
   */
  async remove(id: string, actor: RequestUser, ip: string | null): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const entry = await tx.cashEntry.findUnique({ where: { id } });
      if (!entry) throw entryNotFound();
      this.assertEditable(entry.sourceType, entry.createdAt);

      await tx.cashEntry.delete({ where: { id } });

      await this.audit.record(tx, actor.shopId, {
        actorId: actor.id,
        action: 'CASH_ENTRY_DELETED',
        entityType: 'CashEntry',
        entityId: id,
        before: {
          accountId: entry.accountId,
          direction: entry.direction,
          amount: entry.amount,
          currency: entry.currency,
          occurredAt: entry.occurredAt.toISOString(),
        },
        ip,
      });
    });
  }

  // ──────────────────────── Boshlang'ich qoldiq (§11.4) ────────────────────────

  /**
   * Hisob ochilgandagi qoldiq — **daromad emas**.
   *
   * Shuning uchun alohida `sourceType` va alohida endpoint: oddiy kirim
   * sifatida kiritilsa, u kunlik tushumga qo'shilib, "bugun qancha
   * ishladim" degan savolga yolg'on javob berardi.
   */
  async setOpeningBalance(
    input: OpeningBalanceInput,
    actor: RequestUser,
    ip: string | null,
  ): Promise<CashEntryDto> {
    const occurredAt = this.resolveOccurredAt(input.occurredAt);

    return this.prisma.$transaction(async (tx) => {
      const account = await this.accounts.requireActiveAccount(tx, input.accountId, 'accountId');

      const existing = await tx.cashEntry.findFirst({
        where: { accountId: account.id, sourceType: CashSourceType.OPENING_BALANCE },
        select: { id: true },
      });
      if (existing) {
        throw AppException.conflict(
          ErrorCode.CASH_OPENING_BALANCE_EXISTS,
          "Bu hisob uchun boshlang'ich qoldiq allaqachon kiritilgan.",
          { entryId: existing.id },
        );
      }

      const entry = await tx.cashEntry.create({
        data: {
          accountId: account.id,
          direction: CashDirection.IN,
          amount: new Prisma.Decimal(roundMoney(input.amount, account.currency)),
          currency: account.currency,
          occurredAt,
          sourceType: CashSourceType.OPENING_BALANCE,
          note: input.note ?? null,
          createdById: actor.id,
        },
        include: ENTRY_INCLUDE,
      });

      await this.audit.record(tx, actor.shopId, {
        actorId: actor.id,
        action: 'CASH_OPENING_BALANCE_SET',
        entityType: 'CashEntry',
        entityId: entry.id,
        after: {
          accountId: entry.accountId,
          amount: entry.amount,
          currency: entry.currency,
          occurredAt: entry.occurredAt.toISOString(),
        },
        ip,
      });

      return toEntryDto(entry, this.timeZone, new Date());
    });
  }

  // ──────────────────────── Ayirboshlash (§11.6) ────────────────────────

  /**
   * Valyuta ayirboshlash — **bitta tranzaksiyada uchta yozuv**:
   * chiqim, kirim va ularni bog'lab turadigan `cash_exchanges` qatori.
   *
   * Daromad deb sanalmaydi: ikkala yozuv ham `EXCHANGE` turida va
   * hisobotda kurs farqi alohida satr bo'ladi (§11.6).
   */
  async exchange(
    input: CashExchangeInput,
    actor: RequestUser,
    ip: string | null,
  ): Promise<CashExchangeDto> {
    const occurredAt = this.resolveOccurredAt(input.occurredAt);

    return this.prisma.$transaction(async (tx) => {
      const from = await this.accounts.requireActiveAccount(
        tx,
        input.fromAccountId,
        'fromAccountId',
      );
      const to = await this.accounts.requireActiveAccount(tx, input.toAccountId, 'toAccountId');

      if (from.currency === to.currency) {
        throw AppException.rule(
          ErrorCode.CASH_EXCHANGE_SAME_CURRENCY,
          "Ayirboshlash uchun hisoblar valyutasi har xil bo'lishi kerak.",
          'toAccountId',
        );
      }

      const fromAmount = roundMoney(input.fromAmount, from.currency);
      // Ko'paytirish `Decimal` bilan: kurs kasrli (12,4) va `multiplyMoney`
      // ataylab faqat butun ko'paytuvchini qabul qiladi
      const toAmount = roundMoney(
        new Prisma.Decimal(fromAmount).mul(new Prisma.Decimal(input.rate)).toString(),
        to.currency,
      );

      const exchange = await tx.cashExchange.create({
        data: {
          fromAccountId: from.id,
          toAccountId: to.id,
          fromAmount: new Prisma.Decimal(fromAmount),
          toAmount: new Prisma.Decimal(toAmount),
          rate: new Prisma.Decimal(input.rate),
          occurredAt,
          note: input.note ?? null,
        },
      });

      await tx.cashEntry.createMany({
        data: [
          {
            accountId: from.id,
            direction: CashDirection.OUT,
            amount: new Prisma.Decimal(fromAmount),
            currency: from.currency,
            occurredAt,
            sourceType: CashSourceType.EXCHANGE,
            sourceId: exchange.id,
            note: input.note ?? null,
            createdById: actor.id,
          },
          {
            accountId: to.id,
            direction: CashDirection.IN,
            amount: new Prisma.Decimal(toAmount),
            currency: to.currency,
            occurredAt,
            sourceType: CashSourceType.EXCHANGE,
            sourceId: exchange.id,
            note: input.note ?? null,
            createdById: actor.id,
          },
        ],
      });

      await this.audit.record(tx, actor.shopId, {
        actorId: actor.id,
        action: 'CASH_EXCHANGED',
        entityType: 'CashExchange',
        entityId: exchange.id,
        after: {
          fromAccountId: from.id,
          toAccountId: to.id,
          fromAmount,
          toAmount,
          rate: input.rate,
          occurredAt: occurredAt.toISOString(),
        },
        ip,
      });

      return toExchangeDto(exchange);
    });
  }

  // ──────────────────────── To'lovdan kirim (§17.2) ────────────────────────

  /**
   * Tasdiqlangan to'lov uchun kassa kirimi.
   *
   * **Yagona yo'l**: savdo moduli kassaga faqat shu funksiya orqali
   * yozadi va faqat `CONFIRMED` to'lov uchun. O'tkazma
   * (`PENDING_VERIFICATION`) tasdiqlangunicha kassada ko'rinmaydi —
   * aks holda hali kelmagan pul qoldiqni oshirib turardi.
   *
   * Tranzaksiya **tashqaridan** beriladi: yozuv savdo tasdiqlash
   * tranzaksiyasining ichida bo'lishi shart (ARCHITECTURE §6).
   */
  async createFromPayment(
    tx: Prisma.TransactionClient,
    params: {
      paymentId: string;
      accountId: string;
      amount: string;
      currency: Currency;
      occurredAt: Date;
      actorId: string | null;
      note?: string | null;
    },
  ): Promise<void> {
    await tx.cashEntry.create({
      data: {
        accountId: params.accountId,
        direction: CashDirection.IN,
        amount: new Prisma.Decimal(params.amount),
        currency: params.currency,
        occurredAt: params.occurredAt,
        sourceType: CashSourceType.PAYMENT,
        sourceId: params.paymentId,
        paymentId: params.paymentId,
        note: params.note ?? null,
        createdById: params.actorId,
      },
    });
  }

  /**
   * Savdo qaytarilganda/bekor qilinganda pulning kassadan chiqishi
   * (§8, §11.7).
   *
   * **Chiqim aynan to'lov tushgan hisobdan** bo'ladi va aynan o'sha
   * valyutada: naqd olingan pul naqd qaytadi, kartaga tushgani kartadan.
   * Aks holda §11.1 buzilardi — kassa yashigidagi pulni sanab tizim
   * bilan solishtirib bo'lmay qolardi.
   *
   * `sourceType = REVERSAL` (§11.7): bu yozuv qo'lda tahrirlanmaydi va
   * hisobotda daromadning kamayishi sifatida emas, teskari yozuv
   * sifatida ko'rinadi.
   *
   * `reversesEntryId` ATAYLAB to'ldirilmaydi: bitta to'lov bitta kassa
   * kirimini tug'diradi, lekin qisman qaytarishda chiqim undan kichik
   * bo'ladi va "bu yozuv anavini bekor qiladi" degan bog'lanish yolg'on
   * bo'lardi. Bog'lanish `paymentId` orqali saqlanadi — u ikkala
   * yozuvda ham bir xil.
   */
  async createReversal(
    tx: Prisma.TransactionClient,
    params: {
      accountId: string;
      paymentId: string;
      /** Teskari `sales` qatori (§17.4) — yozuvning manbasi. */
      reversalId: string;
      amount: string;
      currency: Currency;
      occurredAt: Date;
      actorId: string | null;
    },
  ): Promise<void> {
    await tx.cashEntry.create({
      data: {
        accountId: params.accountId,
        direction: CashDirection.OUT,
        amount: new Prisma.Decimal(params.amount),
        currency: params.currency,
        occurredAt: params.occurredAt,
        sourceType: CashSourceType.REVERSAL,
        sourceId: params.reversalId,
        paymentId: params.paymentId,
        createdById: params.actorId,
      },
    });
  }

  // ──────────────────────────── Yordamchilar ────────────────────────────

  /**
   * Kelajakdagi sana qabul qilinmaydi.
   *
   * Sabab kassa qoldig'ida: ertaga tushadigan pul bugungi qoldiqqa
   * qo'shilib, kun oxirida sanalgan naqd puldan farq qilib qolardi —
   * §11.3 da nomlangan muammoning aynan o'zi.
   */
  private resolveOccurredAt(raw: string | undefined): Date {
    if (!raw) return new Date();
    const occurredAt = new Date(raw);
    if (occurredAt.getTime() > Date.now()) {
      throw AppException.rule(
        ErrorCode.VALIDATION_FAILED,
        "Kelajakdagi sana bilan yozuv kiritib bo'lmaydi.",
        'occurredAt',
      );
    }
    return occurredAt;
  }

  private assertEditable(sourceType: CashSourceType, createdAt: Date): void {
    if (sourceType !== CashSourceType.MANUAL) {
      throw AppException.rule(
        ErrorCode.CASH_ENTRY_NOT_MANUAL,
        "Bu yozuv avtomatik yaratilgan — u savdo yoki to'lovni qaytarish orqali tuzatiladi.",
      );
    }
    if (businessDay(createdAt, this.timeZone) !== businessDay(new Date(), this.timeZone)) {
      throw AppException.rule(
        ErrorCode.CASH_ENTRY_NOT_TODAY,
        'Yozuv faqat kiritilgan kuni tahrirlanadi. Kechagi yozuv teskari yozuv bilan tuzatiladi.',
      );
    }
  }

  /**
   * Kategoriya yo'nalishga mos kelishi (§11.10).
   *
   * "Ijara" — chiqim kategoriyasi; uni kirimga qo'yish hisobotda
   * xarajatni daromadga aylantirib yuborardi.
   */
  private async assertCategoryFits(
    tx: Prisma.TransactionClient,
    categoryId: string | null,
    direction: CashDirection,
  ): Promise<void> {
    if (!categoryId) return;

    const category = await tx.cashCategory.findUnique({
      where: { id: categoryId },
      select: { direction: true, isActive: true, name: true },
    });
    if (!category || !category.isActive) {
      throw AppException.rule(ErrorCode.NOT_FOUND, 'Kategoriya topilmadi.', 'categoryId');
    }
    if (category.direction !== null && category.direction !== direction) {
      throw AppException.rule(
        ErrorCode.VALIDATION_FAILED,
        `"${category.name}" kategoriyasi bu yo'nalishga to'g'ri kelmaydi.`,
        'categoryId',
      );
    }
  }
}

function entryNotFound(): AppException {
  return AppException.notFound(ErrorCode.NOT_FOUND, 'Kassa yozuvi topilmadi.');
}
