import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ContractStatus,
  ErrorCode,
  ScheduleStatus,
  convertMoney,
  roundMoney,
  sumMoney,
  type CloseContractInput,
  type InstallmentContractDto,
  type InstallmentQuery,
  type InstallmentSummaryDto,
  type Page,
  type PaymentDto,
  type RebuildScheduleInput,
} from '@hisobai/contracts';
import { Prisma } from '@prisma/client';

import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app.exception';
import { businessDay } from '../common/dates';
import { normalizeLimit, toPage, toPrismaCursor } from '../common/pagination';
import type { RequestUser } from '../common/request-user';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';
import { outstandingOfRows } from '../payments/allocation.service';
import { PaymentsService } from '../payments/payments.service';
import {
  CONTRACT_INCLUDE,
  toContractDto,
  toSummaryDto,
  type ContractRow,
} from './installments.mappers';

/**
 * Nasiya shartnomalari (§9).
 *
 * Shartnoma bu yerda **yaratilmaydi** — u savdo tasdiqlash tranzaksiyasi
 * ichida tug'iladi (§9.1, `SaleConfirmationService`). Bu modul faqat
 * mavjud shartnoma ustidagi amallar: ko'rish, jadvalni qayta tuzish
 * (§9.10) va erta yopish (§9.12).
 */
@Injectable()
export class InstallmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rates: ExchangeRatesService,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get timeZone(): string {
    return this.config.get('TIMEZONE', { infer: true });
  }

  private get today(): string {
    return businessDay(new Date(), this.timeZone);
  }

  /**
   * Qarzdorlar ro'yxati (§9).
   *
   * `overdue` filtri **bazada emas, xotirada** qo'llanadi: §9.8 bo'yicha
   * kechikish saqlanmaydi va uni SQL'da hisoblash "bugun" ni do'kon vaqt
   * zonasida aniqlashni talab qilardi — `AT TIME ZONE` bilan yozilgan
   * shart esa `dueDate` indeksidan foydalana olmasdi. Sahifa hajmi
   * cheklangani uchun (`limit`) bu qimmat emas.
   */
  async list(query: InstallmentQuery): Promise<Page<InstallmentSummaryDto>> {
    const limit = normalizeLimit(query.limit);

    const rows = await this.prisma.installmentContract.findMany({
      where: {
        status: query.status ? { in: query.status } : undefined,
        ...(query.customerId ? { sale: { customerId: query.customerId } } : {}),
      },
      include: CONTRACT_INCLUDE,
      orderBy: [{ createdAt: query.sort === 'createdAt' ? 'asc' : 'desc' }, { id: 'desc' }],
      ...toPrismaCursor(query.cursor, limit),
    });

    const today = this.today;
    const summaries = rows.map((row) => toSummaryDto(row, today));
    const filtered =
      query.overdue === 'true'
        ? summaries.filter((row) => row.isOverdue)
        : query.overdue === 'false'
          ? summaries.filter((row) => !row.isOverdue)
          : summaries;

    return toPage(filtered, limit, (dto) => dto.createdAt);
  }

  async requireById(id: string): Promise<InstallmentContractDto> {
    const row = await this.prisma.installmentContract.findUnique({
      where: { id },
      include: CONTRACT_INCLUDE,
    });
    if (!row) throw contractNotFound();
    return toContractDto(row, this.today);
  }

  /**
   * Jadvalni qayta tuzish (§9.10, §9.11).
   *
   * **Faqat to'lanmagan qatorlar almashtiriladi.** To'langan yoki qisman
   * to'langan qatorga tegib bo'lmaydi: ularga `payment_allocations`
   * bog'langan va ularni o'zgartirish to'lov tarixini haqiqatdan
   * ajratardi — "bu pul qayerga ketdi" degan savol javobsiz qolardi.
   *
   * **Umumiy qarz o'zgarmaydi** (§9.11): yangi qatorlar yig'indisi
   * almashtirilayotgan qatorlarning qoldig'iga teng bo'lishi shart. Bu
   * amal faqat sanalar va summalar TAQSIMOTINI o'zgartiradi. Aks holda
   * u qarzni jimgina kechirish yoki oshirish vositasiga aylanardi va
   * uni hech bir hisobot ko'rsatmasdi.
   */
  async rebuildSchedule(
    id: string,
    input: RebuildScheduleInput,
    actor: RequestUser,
    ip: string | null,
  ): Promise<InstallmentContractDto> {
    return this.prisma.$transaction(async (tx) => {
      const contract = await tx.installmentContract.findUnique({
        where: { id },
        include: CONTRACT_INCLUDE,
      });
      if (!contract) throw contractNotFound();
      assertActive(contract);

      const untouched = contract.schedules.filter(
        (schedule) => schedule.status !== ScheduleStatus.UNPAID,
      );
      const replaced = contract.schedules.filter(
        (schedule) => schedule.status === ScheduleStatus.UNPAID,
      );

      if (replaced.length === 0) {
        throw AppException.conflict(
          ErrorCode.INSTALLMENT_SCHEDULE_ROW_PAID,
          "Qayta tuzish uchun to'lanmagan qator yo'q — jadvalning hammasi to'langan yoki qisman to'langan.",
        );
      }

      const replacedTotal = sumMoney(
        replaced.map((schedule) => schedule.amountDue.minus(schedule.amountPaid).toString()),
        contract.currency,
      );
      const nextTotal = sumMoney(
        input.schedule.map((row) => row.amount),
        contract.currency,
      );

      if (nextTotal !== replacedTotal) {
        throw AppException.rule(
          ErrorCode.INSTALLMENT_SCHEDULE_SUM_MISMATCH,
          `Yangi jadval summasi qolgan qarzga teng bo'lishi kerak: ${nextTotal} ≠ ${replacedTotal}.`,
          'schedule',
          { expected: replacedTotal, received: nextTotal, currency: contract.currency },
        );
      }

      await tx.paymentSchedule.deleteMany({
        where: { id: { in: replaced.map((schedule) => schedule.id) } },
      });

      // Tegilmagan qatorlar o'z tartib raqamini SAQLAB qoladi: ularga
      // to'lov tarixi bog'langan va raqamni surish "3-oy to'landi" degan
      // yozuvni boshqa oyga ko'chirardi
      let sequence = untouched.reduce((max, schedule) => Math.max(max, schedule.sequence), 0);
      for (const row of input.schedule) {
        sequence += 1;
        await tx.paymentSchedule.create({
          data: {
            contractId: contract.id,
            sequence,
            dueDate: new Date(`${row.dueDate}T00:00:00.000Z`),
            amountDue: new Prisma.Decimal(roundMoney(row.amount, contract.currency)),
          },
        });
      }

      // §9.11 — sabab bilan audit'ga
      await this.audit.record(tx, actor.shopId, {
        actorId: actor.id,
        action: 'INSTALLMENT_SCHEDULE_REBUILT',
        entityType: 'InstallmentContract',
        entityId: contract.id,
        before: {
          rows: replaced.map((schedule) => ({
            sequence: schedule.sequence,
            dueDate: schedule.dueDate.toISOString().slice(0, 10),
            amountDue: schedule.amountDue.toString(),
          })),
        },
        after: {
          reason: input.reason,
          rows: input.schedule,
          total: nextTotal,
          currency: contract.currency,
        },
        ip,
      });

      const updated = await tx.installmentContract.findUniqueOrThrow({
        where: { id },
        include: CONTRACT_INCLUDE,
      });
      return toContractDto(updated, this.today);
    });
  }

  /**
   * Erta yopish (§9.12).
   *
   * Qolgan summa ko'rsatiladi, mijoz to'laydi, shartnoma yopiladi.
   * **Ustama qaytarilmaydi** — u savdo kunida to'liq tan olingan daromad
   * (§17.3), ya'ni erta to'lash uni kamaytirmaydi.
   *
   * Yopish alohida mexanizm emas: u oddiy to'lov sifatida yoziladi va
   * shartnomani `AllocationService` o'zi yopadi (§17.18). Alohida yo'l
   * yozilsa, kassaga pul tushishi ikkinchi marta boshqacha yozilardi va
   * §17.2 ("kassaga pul faqat to'lov orqali tushadi") buzilardi.
   *
   * `expectedOutstanding` — ekranda ko'rsatilgan qoldiq. Server undan
   * farq qilsa amal rad etiladi: oradan o'tgan vaqtda boshqa to'lov
   * tushgan bo'lishi mumkin va ega o'zi ko'rgan summadan boshqa summani
   * jimgina to'lab qo'ymasligi kerak.
   */
  async close(
    id: string,
    input: CloseContractInput,
    actor: RequestUser,
    ip: string | null,
  ): Promise<PaymentDto> {
    const contract = await this.prisma.installmentContract.findUnique({
      where: { id },
      include: CONTRACT_INCLUDE,
    });
    if (!contract) throw contractNotFound();
    assertActive(contract);

    const outstanding = outstandingOfRows(contract.schedules);

    // Solishtirish `Decimal` bilan: `outstanding` ataylab yaxlitlanmagan
    // (§16.11 dagi tiyin qoldig'i saqlanib qolishi kerak), ya'ni satr
    // taqqoslash "0.50" va "0.5" ni har xil deb hisoblardi
    if (!new Prisma.Decimal(input.expectedOutstanding).equals(outstanding)) {
      throw AppException.conflict(
        ErrorCode.STALE_RESOURCE,
        `Qarz qoldig'i o'zgargan: ${outstanding} ${contract.currency}. Sahifani yangilang.`,
        { outstanding, currency: contract.currency },
      );
    }

    const account = await this.prisma.cashAccount.findUnique({
      where: { id: input.cashAccountId },
      select: { currency: true },
    });
    if (!account) {
      throw AppException.rule(ErrorCode.NOT_FOUND, 'Kassa hisobi topilmadi.', 'cashAccountId');
    }

    // Qoldiq shartnoma valyutasida, pul esa hisob valyutasida keladi
    // (§10.5). Kurs — BUGUNGI: erta yopish bugun bo'layotgan to'lov
    const rate = await this.rates.requireForDate(this.today);
    const amount = convertMoney(
      outstanding,
      contract.currency,
      account.currency,
      rate.storeRate.toString(),
    );

    const payment = await this.payments.create(
      {
        contractId: contract.id,
        amount,
        currency: account.currency,
        method: input.method,
        cashAccountId: input.cashAccountId,
        note: input.note ?? null,
      },
      actor,
      ip,
    );

    await this.audit.recordDetached(actor.shopId, {
      actorId: actor.id,
      action: 'INSTALLMENT_CONTRACT_CLOSED_EARLY',
      entityType: 'InstallmentContract',
      entityId: contract.id,
      after: {
        outstanding,
        currency: contract.currency,
        paymentId: payment.id,
        paidAmount: payment.paidAmount,
        paidCurrency: payment.paidCurrency,
      },
      ip,
    });

    return payment;
  }
}

/** §9.7 — faqat FAOL shartnoma o'zgaradi. */
function assertActive(contract: ContractRow): void {
  if (contract.status !== ContractStatus.ACTIVE) {
    throw AppException.conflict(
      ErrorCode.INSTALLMENT_CONTRACT_NOT_ACTIVE,
      contract.status === ContractStatus.CLOSED
        ? 'Shartnoma allaqachon yopilgan.'
        : 'Shartnoma bekor qilingan.',
      { status: contract.status },
    );
  }
}

function contractNotFound(): AppException {
  return AppException.notFound(ErrorCode.NOT_FOUND, 'Shartnoma topilmadi.');
}
