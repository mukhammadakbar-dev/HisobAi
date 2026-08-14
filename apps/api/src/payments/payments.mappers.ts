import type { PaymentAllocationDto, PaymentDto } from '@hisobai/contracts';
import type { Prisma } from '@prisma/client';

/**
 * To'lov qatorini DTO'ga aylantirish.
 *
 * Taqsimotlar **har doim** yuklanadi: ular §10.6 dagi qaytarishning
 * yagona asosi va ekranda "qaysi oy yopildi" degan savolga javob
 * beradi. Ularsiz to'lov kartasi shunchaki summa bo'lib qolardi.
 */

export const PAYMENT_INCLUDE = {
  cashAccount: { select: { id: true, name: true } },
  contract: {
    select: {
      id: true,
      sale: { select: { id: true, customerId: true, customer: { select: { fullName: true } } } },
    },
  },
  allocations: {
    include: { schedule: { select: { id: true, sequence: true, dueDate: true } } },
    orderBy: { createdAt: 'asc' },
  },
} satisfies Prisma.PaymentInclude;

export type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof PAYMENT_INCLUDE }>;

export function toPaymentDto(row: PaymentRow): PaymentDto {
  return {
    id: row.id,
    contractId: row.contractId,
    saleId: row.saleId ?? row.contract?.sale.id ?? null,
    customerId: row.contract?.sale.customerId ?? null,
    customerName: row.contract?.sale.customer?.fullName ?? null,
    method: row.method,
    status: row.status,
    paidAmount: row.paidAmount.toString(),
    paidCurrency: row.paidCurrency,
    exchangeRate: row.exchangeRate.toString(),
    appliedAmount: row.appliedAmount.toString(),
    appliedCurrency: row.appliedCurrency,
    cashAccountId: row.cashAccountId,
    cashAccountName: row.cashAccount?.name ?? null,
    paidAt: row.paidAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    rejectedReason: row.rejectedReason,
    reversesPaymentId: row.reversesPaymentId,
    allocations: row.allocations.map(toAllocationDto),
    createdAt: row.createdAt.toISOString(),
  };
}

function toAllocationDto(allocation: PaymentRow['allocations'][number]): PaymentAllocationDto {
  return {
    scheduleId: allocation.scheduleId,
    sequence: allocation.schedule.sequence,
    // Kalendar sana (§2.2) — vaqt qismi ma'nosiz
    dueDate: allocation.schedule.dueDate.toISOString().slice(0, 10),
    amount: allocation.amount.toString(),
  };
}
