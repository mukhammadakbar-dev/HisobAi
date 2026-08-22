import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ContractStatus,
  ErrorCode,
  FileKind,
  PaymentMethod,
  PaymentStatus,
  convertMoney,
  roundMoney,
  type CreatePaymentInput,
  type Page,
  type PaymentDto,
  type PaymentQuery,
  type RejectPaymentInput,
  type ReversePaymentInput,
} from '@hisobai/contracts';
import { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { CashEntriesService } from '../cash/cash-entries.service';
import { AppException } from '../common/app.exception';
import { businessDay, dayRangeFilter } from '../common/dates';
import { requireFileRef } from '../common/file-ref';
import { normalizeLimit, toPage, toPrismaCursor } from '../common/pagination';
import type { RequestUser } from '../common/request-user';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { AllocationService } from './allocation.service';
import { PAYMENT_INCLUDE, toPaymentDto, type PaymentRow } from './payments.mappers';

/** §10.4 — to'lov sanasini 7 kungacha orqaga qo'yish mumkin. */
const MAX_BACKDATE_DAYS = 7;

/**
 * Nasiya to'lovlari (§10, §12).
 *
 * Har amal — **bitta tranzaksiya**: to'lov, taqsimot, jadval keshi,
 * shartnoma holati va kassa yozuvi birga o'zgaradi (`ARCHITECTURE.md`
 * §6). Ular ajralib qolsa, kassadagi pul bilan qarz bir-biriga to'g'ri
 * kelmay qolardi va qaysi biri to'g'ri ekanini aniqlashning yo'li
 * bo'lmasdi.
 *
 * **Faqat `CONFIRMED` to'lov qarzni kamaytiradi va kassaga tushadi**
 * (§12, §17.2). Naqd va karta darhol tasdiqlanadi, o'tkazma esa
 * `PENDING_VERIFICATION` bo'lib turadi: pul hali kelgani noma'lum va
 * uni kassa qoldig'iga qo'shish "bor" deb ko'rsatilgan yo'q pul
 * bo'lardi.
 */
@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rates: ExchangeRatesService,
    private readonly cashEntries: CashEntriesService,
    private readonly allocation: AllocationService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get timeZone(): string {
    return this.config.get('TIMEZONE', { infer: true });
  }

  /**
   * To'lovlar ro'yxati (§12).
   *
   * `customerId` bo'yicha filtr shartnoma orqali o'tadi: to'lovda mijoz
   * ustuni yo'q va bo'lishi ham kerak emas — mijoz savdoda yozilgan va
   * uni ikkinchi joyda takrorlash ikki manba yaratardi.
   */
  async list(query: PaymentQuery): Promise<Page<PaymentDto>> {
    const limit = normalizeLimit(query.limit);
    const paidAt = dayRangeFilter(query.from, query.to, this.timeZone);

    const where: Prisma.PaymentWhereInput = {
      contractId: query.contractId,
      status: query.status ? { in: query.status } : undefined,
      ...(query.customerId ? { contract: { sale: { customerId: query.customerId } } } : {}),
      ...(paidAt ? { paidAt } : {}),
    };

    const [rows, totalCount] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: PAYMENT_INCLUDE,
        orderBy: [{ paidAt: query.sort === 'paidAt' ? 'asc' : 'desc' }, { id: 'desc' }],
        ...toPrismaCursor(query.cursor, limit),
      }),
      this.prisma.payment.count({ where }),
    ]);

    return toPage(rows.map(toPaymentDto), limit, (dto) => dto.paidAt, totalCount);
  }

  async requireById(id: string): Promise<PaymentDto> {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: PAYMENT_INCLUDE,
    });
    if (!payment) throw paymentNotFound();
    return toPaymentDto(payment);
  }

  /**
   * To'lov qabul qilish (§10).
   *
   * Ketma-ketlik:
   *
   *  1. shartnoma `ACTIVE` ekani tekshiriladi — yopilgan yoki bekor
   *     qilingan shartnomaga to'lov qabul qilish qarzsiz pul olish
   *     bo'lardi;
   *  2. summa **to'lov sanasidagi** kurs bo'yicha shartnoma valyutasiga
   *     keltiriladi (§10.5, §17.11);
   *  3. qarz qoldig'idan oshmasligi tekshiriladi (§10.2, §16.11);
   *  4. to'lov yoziladi — naqd/karta `CONFIRMED`, o'tkazma
   *     `PENDING_VERIFICATION` (§17.2);
   *  5. tasdiqlangan bo'lsa: taqsimot (§10.1) va kassa kirimi.
   */
  async create(
    input: CreatePaymentInput,
    actor: RequestUser,
    ip: string | null,
  ): Promise<PaymentDto> {
    const paidAt = this.resolvePaidAt(input.paidAt);
    /**
     * Kurs tranzaksiyadan TASHQARIDA — `SaleConfirmationService.confirm`
     * dagi bilan aynan bir xil sabab: tranzaksiya ichidan boshqa
     * servisning `PrismaService` iga qilingan so'rov `app.current_shop_id`
     * qo'yilmagan ulanishga tushadi va RLS hamma qatorni to'sadi.
     */
    const rate = await this.rates.requireForDate(businessDay(paidAt, this.timeZone));

    return this.prisma.$transaction(async (tx) => {
      const contract = await tx.installmentContract.findUnique({
        where: { id: input.contractId },
        select: { id: true, currency: true, status: true },
      });
      if (!contract) {
        throw AppException.rule(ErrorCode.NOT_FOUND, 'Shartnoma topilmadi.', 'contractId');
      }
      if (contract.status !== ContractStatus.ACTIVE) {
        throw AppException.conflict(
          ErrorCode.INSTALLMENT_CONTRACT_NOT_ACTIVE,
          contract.status === ContractStatus.CLOSED
            ? 'Shartnoma yopilgan — qarz qolmagan.'
            : 'Shartnoma bekor qilingan.',
          { status: contract.status },
        );
      }

      // §15.6, §10.3 — chek surati ixtiyoriy
      if (input.receiptFileId) {
        await requireFileRef(tx, input.receiptFileId, FileKind.RECEIPT, 'Chek fayli topilmadi.');
      }

      const account = await this.requireAccount(tx, input);

      const paidAmount = roundMoney(input.amount, input.currency);
      const appliedAmount = convertMoney(
        paidAmount,
        input.currency,
        contract.currency,
        rate.storeRate.toString(),
      );

      // §10.2, §16.11 — ortiqcha to'lov UMUMAN kiritilmaydi. Ortiqcha
      // naqd mijozga qaytim sifatida beriladi va tizimda yozuv
      // qoldirmaydi: yozilsa, u kassada qolgan mijoz puli — ya'ni
      // taqiqlangan "mijoz balansi" bo'lardi
      const outstanding = await this.allocation.outstandingOf(tx, contract.id, contract.currency);
      if (new Prisma.Decimal(appliedAmount).greaterThan(outstanding)) {
        throw AppException.rule(
          ErrorCode.PAYMENT_EXCEEDS_OUTSTANDING,
          `Qarz qoldig'i ${outstanding} ${contract.currency}. Ortig'ini mijozga qaytim qiling.`,
          'amount',
          { outstanding, applied: appliedAmount, currency: contract.currency },
        );
      }

      // §17.2 — o'tkazma Telegram cheki bilan qo'lda tasdiqlanadi
      const confirmedNow = input.method !== PaymentMethod.TRANSFER;
      const confirmedAt = confirmedNow ? new Date() : null;

      const payment = await tx.payment.create({
        data: {
          contractId: contract.id,
          paidAmount: new Prisma.Decimal(paidAmount),
          paidCurrency: input.currency,
          exchangeRate: rate.storeRate,
          appliedAmount: new Prisma.Decimal(appliedAmount),
          appliedCurrency: contract.currency,
          method: input.method,
          status: confirmedNow ? PaymentStatus.CONFIRMED : PaymentStatus.PENDING_VERIFICATION,
          paidAt,
          confirmedAt,
          confirmedById: confirmedNow ? actor.id : null,
          cashAccountId: account.id,
          createdById: actor.id,
          receiptFileId: input.receiptFileId ?? undefined,
        },
      });

      if (confirmedNow) {
        await this.applyConfirmed(tx, {
          payment: { ...payment, contractId: contract.id },
          currency: contract.currency,
          note: input.note ?? null,
          actor,
        });
      }

      await this.audit.record(tx, actor.shopId, {
        actorId: actor.id,
        action: 'PAYMENT_CREATED',
        entityType: 'Payment',
        entityId: payment.id,
        after: {
          contractId: contract.id,
          paidAmount,
          paidCurrency: input.currency,
          appliedAmount,
          appliedCurrency: contract.currency,
          exchangeRate: rate.storeRate.toString(),
          method: input.method,
          status: payment.status,
          // §10.4 — orqaga qo'yilgan sana auditda ko'rinib tursin
          backdated: businessDay(paidAt, this.timeZone) !== businessDay(new Date(), this.timeZone),
        },
        ip,
      });

      return this.reload(tx, payment.id);
    });
  }

  /**
   * O'tkazmani tasdiqlash (§12) — pul kelgani aniqlangach.
   *
   * Taqsimot va kassa kirimi **aynan shu paytda** paydo bo'ladi:
   * to'lov yaratilganda ular yozilmagan edi, chunki pul hali yo'q edi.
   */
  async confirm(id: string, actor: RequestUser, ip: string | null): Promise<PaymentDto> {
    return this.prisma.$transaction(async (tx) => {
      const payment = await this.requirePending(tx, id);
      const contract = await this.requireContract(tx, payment);

      const confirmed = await tx.payment.update({
        where: { id },
        data: {
          status: PaymentStatus.CONFIRMED,
          confirmedAt: new Date(),
          confirmedById: actor.id,
        },
      });

      await this.applyConfirmed(tx, {
        payment: { ...confirmed, contractId: contract.id },
        currency: contract.currency,
        note: null,
        actor,
      });

      await this.audit.record(tx, actor.shopId, {
        actorId: actor.id,
        action: 'PAYMENT_CONFIRMED',
        entityType: 'Payment',
        entityId: id,
        before: { status: PaymentStatus.PENDING_VERIFICATION },
        after: { status: PaymentStatus.CONFIRMED, appliedAmount: payment.appliedAmount.toString() },
        ip,
      });

      return this.reload(tx, id);
    });
  }

  /**
   * Rad etish (§12) — pul kelmadi.
   *
   * Taqsimot ham, kassa yozuvi ham bo'lmagan (to'lov hech qachon
   * `CONFIRMED` bo'lmagan), ya'ni bekor qiladigan narsa yo'q: faqat
   * holat va sabab yoziladi.
   */
  async reject(
    id: string,
    input: RejectPaymentInput,
    actor: RequestUser,
    ip: string | null,
  ): Promise<PaymentDto> {
    return this.prisma.$transaction(async (tx) => {
      await this.requirePending(tx, id);

      await tx.payment.update({
        where: { id },
        data: { status: PaymentStatus.REJECTED, rejectedReason: input.reason },
      });

      await this.audit.record(tx, actor.shopId, {
        actorId: actor.id,
        action: 'PAYMENT_REJECTED',
        entityType: 'Payment',
        entityId: id,
        before: { status: PaymentStatus.PENDING_VERIFICATION },
        after: { status: PaymentStatus.REJECTED, reason: input.reason },
        ip,
      });

      return this.reload(tx, id);
    });
  }

  /**
   * Tasdiqlangan to'lovni qaytarish (§10.6).
   *
   * **Teskari kassa yozuvi yaratiladi va qarz tiklanadi** — ikkalasi
   * bitta tranzaksiyada. Qarz aynan taqsimot qatorlari bo'yicha
   * tiklanadi (`deallocate`), qayta hisoblab emas.
   *
   * To'lovning o'zi o'chirilmaydi: u `REVERSED` bo'ladi va tarixda
   * qoladi. Savdo qaytarishdagi bilan bir xil qoida (§17.4) — moliyaviy
   * yozuv o'chirilmaydi, ustiga teskarisi qo'shiladi.
   */
  async reverse(
    id: string,
    input: ReversePaymentInput,
    actor: RequestUser,
    ip: string | null,
  ): Promise<PaymentDto> {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { id } });
      if (!payment) throw paymentNotFound();

      if (payment.status !== PaymentStatus.CONFIRMED) {
        throw AppException.conflict(
          ErrorCode.PAYMENT_ALREADY_REVERSED,
          "Faqat tasdiqlangan to'lov qaytariladi.",
          { status: payment.status },
        );
      }

      const contract = await this.requireContract(tx, payment);

      await this.allocation.deallocate(tx, {
        paymentId: id,
        contractId: contract.id,
        currency: contract.currency,
      });

      await tx.payment.update({
        where: { id },
        data: { status: PaymentStatus.REVERSED, rejectedReason: input.reason },
      });

      // §11.7 — kassadagi tuzatish faqat teskari yozuv orqali
      if (payment.cashAccountId) {
        await this.cashEntries.createReversal(tx, {
          accountId: payment.cashAccountId,
          paymentId: payment.id,
          reversalId: payment.id,
          amount: payment.paidAmount.toString(),
          currency: payment.paidCurrency,
          occurredAt: new Date(),
          actorId: actor.id,
        });
      }

      await this.audit.record(tx, actor.shopId, {
        actorId: actor.id,
        action: 'PAYMENT_REVERSED',
        entityType: 'Payment',
        entityId: id,
        before: { status: PaymentStatus.CONFIRMED },
        after: {
          status: PaymentStatus.REVERSED,
          reason: input.reason,
          restored: payment.appliedAmount.toString(),
          currency: contract.currency,
        },
        ip,
      });

      return this.reload(tx, id);
    });
  }

  // ──────────────────────────── Yordamchilar ────────────────────────────

  /** Tasdiqlangan to'lovning ikkita oqibati: taqsimot va kassa kirimi. */
  private async applyConfirmed(
    tx: Prisma.TransactionClient,
    params: {
      payment: {
        id: string;
        contractId: string;
        appliedAmount: Prisma.Decimal;
        paidAmount: Prisma.Decimal;
        paidCurrency: PaymentRow['paidCurrency'];
        cashAccountId: string | null;
        paidAt: Date;
      };
      currency: PaymentRow['appliedCurrency'];
      note: string | null;
      actor: RequestUser;
    },
  ): Promise<void> {
    const { payment, currency, note, actor } = params;

    await this.allocation.allocate(tx, {
      contractId: payment.contractId,
      paymentId: payment.id,
      amount: payment.appliedAmount.toString(),
      currency,
    });

    if (payment.cashAccountId) {
      await this.cashEntries.createFromPayment(tx, {
        paymentId: payment.id,
        accountId: payment.cashAccountId,
        amount: payment.paidAmount.toString(),
        currency: payment.paidCurrency,
        occurredAt: payment.paidAt,
        actorId: actor.id,
        note,
      });
    }
  }

  private async requirePending(tx: Prisma.TransactionClient, id: string): Promise<PaymentRow> {
    const payment = await tx.payment.findUnique({ where: { id }, include: PAYMENT_INCLUDE });
    if (!payment) throw paymentNotFound();

    if (payment.status !== PaymentStatus.PENDING_VERIFICATION) {
      throw AppException.conflict(
        ErrorCode.PAYMENT_NOT_PENDING,
        "Bu to'lov allaqachon hal qilingan.",
        { status: payment.status },
      );
    }
    return payment;
  }

  private async requireContract(
    tx: Prisma.TransactionClient,
    payment: { contractId: string | null },
  ): Promise<{ id: string; currency: PaymentRow['appliedCurrency'] }> {
    if (payment.contractId === null) {
      // Naqd savdo to'lovi — u shartnomaga bog'lanmagan va bu modul
      // orqali boshqarilmaydi: uni faqat savdoni qaytarish o'zgartiradi (§8)
      throw AppException.conflict(
        ErrorCode.VALIDATION_FAILED,
        "Bu to'lov nasiya shartnomasiga bog'lanmagan — savdoni qaytarish orqali tuzatiladi.",
      );
    }

    const contract = await tx.installmentContract.findUniqueOrThrow({
      where: { id: payment.contractId },
      select: { id: true, currency: true },
    });
    return contract;
  }

  private async requireAccount(
    tx: Prisma.TransactionClient,
    input: CreatePaymentInput,
  ): Promise<{ id: string }> {
    const account = await tx.cashAccount.findUnique({
      where: { id: input.cashAccountId },
      select: { id: true, currency: true, isActive: true, name: true },
    });
    if (!account || !account.isActive) {
      throw AppException.rule(ErrorCode.NOT_FOUND, 'Kassa hisobi topilmadi.', 'cashAccountId');
    }
    // §11.1 — pul o'z valyutasidagi hisobga tushadi; aks holda qoldiq
    // ikki valyutaning aralashmasi bo'lib qolardi
    if (account.currency !== input.currency) {
      throw AppException.rule(
        ErrorCode.PAYMENT_ACCOUNT_CURRENCY_MISMATCH,
        `"${account.name}" hisobi ${account.currency} da yuritiladi.`,
        'cashAccountId',
      );
    }
    return account;
  }

  private async reload(tx: Prisma.TransactionClient, id: string): Promise<PaymentDto> {
    const row = await tx.payment.findUniqueOrThrow({ where: { id }, include: PAYMENT_INCLUDE });
    return toPaymentDto(row);
  }

  private resolvePaidAt(raw: string | undefined): Date {
    if (!raw) return new Date();

    const paidAt = new Date(raw);
    const now = Date.now();
    if (paidAt.getTime() > now) {
      throw AppException.rule(
        ErrorCode.VALIDATION_FAILED,
        "To'lov sanasi kelajakda bo'lmaydi.",
        'paidAt',
      );
    }
    if (now - paidAt.getTime() > MAX_BACKDATE_DAYS * 86_400_000) {
      throw AppException.rule(
        ErrorCode.VALIDATION_FAILED,
        `To'lov sanasini ${String(MAX_BACKDATE_DAYS)} kundan ortiq orqaga qo'yib bo'lmaydi.`,
        'paidAt',
      );
    }
    return paidAt;
  }
}

function paymentNotFound(): AppException {
  return AppException.notFound(ErrorCode.NOT_FOUND, "To'lov topilmadi.");
}
