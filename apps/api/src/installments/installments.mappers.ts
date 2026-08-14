import { ScheduleStatus } from '@hisobai/contracts';
import type {
  InstallmentContractDto,
  InstallmentSummaryDto,
  PaymentScheduleDto,
} from '@hisobai/contracts';
import type { Prisma } from '@prisma/client';

import { outstandingOfRows } from '../payments/allocation.service';

/**
 * Shartnoma qatorlarini DTO'ga aylantirish.
 *
 * **§9.8 — "muddati o'tgan" saqlanmaydi, hisoblanadi.** Uni ustunga
 * yozish uni yangilab turadigan jarayonni talab qilardi va u ishlamay
 * qolgan kuni holat yolg'on ko'rsatardi (masalan hamma qarzdor "toza"
 * bo'lib qolardi). Hisob serverda: "bugun" do'kon vaqt zonasida
 * aniqlanadi (§1.3) va brauzer zonasi undan farq qilishi mumkin.
 *
 * Qarz qoldig'i ham ustunda yo'q — jadvaldan hisoblanadi
 * (`AllocationService.outstandingOf` bilan bir xil formula).
 */

export const CONTRACT_INCLUDE = {
  sale: {
    select: {
      id: true,
      number: true,
      customerId: true,
      customer: { select: { fullName: true } },
    },
  },
  schedules: { orderBy: { sequence: 'asc' } },
} satisfies Prisma.InstallmentContractInclude;

export type ContractRow = Prisma.InstallmentContractGetPayload<{
  include: typeof CONTRACT_INCLUDE;
}>;

export function toContractDto(row: ContractRow, today: string): InstallmentContractDto {
  return {
    id: row.id,
    saleId: row.saleId,
    saleNumber: row.sale.number,
    customerId: row.sale.customerId,
    customerName: row.sale.customer?.fullName ?? null,
    currency: row.currency,
    cashPrice: row.cashPrice.toString(),
    markupAmount: row.markupAmount.toString(),
    markupPercent: row.markupPercent?.toString() ?? null,
    downPayment: row.downPayment.toString(),
    principal: row.principal.toString(),
    outstanding: outstandingOf(row),
    status: row.status,
    closedAt: row.closedAt?.toISOString() ?? null,
    schedules: row.schedules.map((schedule) => toScheduleDto(schedule, today)),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toSummaryDto(row: ContractRow, today: string): InstallmentSummaryDto {
  const unpaid = row.schedules.filter((schedule) => schedule.status !== ScheduleStatus.PAID);

  return {
    id: row.id,
    saleId: row.saleId,
    saleNumber: row.sale.number,
    customerId: row.sale.customerId,
    customerName: row.sale.customer?.fullName ?? null,
    currency: row.currency,
    principal: row.principal.toString(),
    outstanding: outstandingOf(row),
    status: row.status,
    isOverdue: unpaid.some((schedule) => isOverdue(schedule, today)),
    // Jadval `sequence` bo'yicha tartiblangan, ya'ni birinchi to'lanmagan
    // qator — eng yaqin muddat
    nextDueDate: unpaid[0] ? calendarDateOf(unpaid[0].dueDate) : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toScheduleDto(
  schedule: ContractRow['schedules'][number],
  today: string,
): PaymentScheduleDto {
  return {
    id: schedule.id,
    sequence: schedule.sequence,
    dueDate: calendarDateOf(schedule.dueDate),
    amountDue: schedule.amountDue.toString(),
    amountPaid: schedule.amountPaid.toString(),
    status: schedule.status,
    isOverdue: isOverdue(schedule, today),
  };
}

/**
 * §9.8 — `dueDate < bugun` **va** qarz qolgan.
 *
 * Ikkinchi shart muhim: muddati o'tgan, lekin to'liq to'langan qator
 * kechikkan emas — u yopilgan. Faqat sanaga qarash butun tarixni
 * "kechikkan" qilib ko'rsatardi.
 */
function isOverdue(schedule: ContractRow['schedules'][number], today: string): boolean {
  if (schedule.status === ScheduleStatus.PAID) return false;
  return calendarDateOf(schedule.dueDate) < today;
}

function outstandingOf(row: ContractRow): string {
  return outstandingOfRows(row.schedules);
}

/** `@db.Date` ustuni — vaqt qismi ma'nosiz (§2.2). */
function calendarDateOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}
