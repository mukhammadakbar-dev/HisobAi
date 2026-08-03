import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import {
  PaymentDto,
  InstallmentContractDto,
  PaymentScheduleDto,
} from '@baraka/contracts';
import {
  Prisma,
  PaymentMethod,
  PaymentStatus,
  InstallmentStatus,
  ScheduleStatus,
} from '@prisma/client';

@Injectable()
export class PaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  private mapContractDto(contract: any): InstallmentContractDto {
    return {
      id: contract.id,
      saleId: contract.saleId,
      customerId: contract.customerId,
      customer: contract.customer
        ? {
            id: contract.customer.id,
            fullName: contract.customer.fullName,
            phoneE164: contract.customer.phoneE164,
            address: contract.customer.address,
            note: contract.customer.note,
            totalDebt: 0,
            salesCount: 0,
            activeContractsCount: 0,
            createdAt: contract.customer.createdAt.toISOString(),
            updatedAt: contract.customer.updatedAt.toISOString(),
          }
        : undefined,
      principal: Number(contract.principal),
      downPayment: Number(contract.downPayment),
      outstandingAmount: Number(contract.outstandingAmount),
      status: contract.status as any,
      paymentSchedules: (contract.paymentSchedules || []).map((s: any) => ({
        id: s.id,
        contractId: s.contractId,
        dueDate: s.dueDate.toISOString(),
        amountDue: Number(s.amountDue),
        amountPaid: Number(s.amountPaid),
        status: s.status as any,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      payments: (contract.payments || []).map((p: any) => ({
        id: p.id,
        contractId: p.contractId,
        amount: Number(p.amount),
        method: p.method as any,
        status: p.status as any,
        receiptUrl: p.receiptUrl,
        paidAt: p.paidAt ? p.paidAt.toISOString() : null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
      createdAt: contract.createdAt.toISOString(),
      updatedAt: contract.updatedAt.toISOString(),
    };
  }

  private mapPaymentDto(payment: any): PaymentDto {
    return {
      id: payment.id,
      contractId: payment.contractId,
      amount: Number(payment.amount),
      method: payment.method as any,
      status: payment.status as any,
      receiptUrl: payment.receiptUrl,
      paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
    };
  }

  // Apply payment to schedule items chronologically
  private async applyPaymentToSchedules(
    tx: Prisma.TransactionClient,
    contractId: string,
    amount: number,
  ) {
    const schedules = await tx.paymentSchedule.findMany({
      where: { contractId },
      orderBy: { dueDate: 'asc' },
    });

    let remaining = amount;

    for (const sched of schedules) {
      if (remaining <= 0) break;

      const due = Number(sched.amountDue);
      const paid = Number(sched.amountPaid);
      const needed = Math.max(0, due - paid);

      if (needed > 0) {
        const add = Math.min(remaining, needed);
        const newPaid = paid + add;
        remaining -= add;

        const newStatus =
          newPaid >= due ? ScheduleStatus.PAID : ScheduleStatus.PARTIAL;

        await tx.paymentSchedule.update({
          where: { id: sched.id },
          data: {
            amountPaid: new Prisma.Decimal(newPaid),
            status: newStatus,
          },
        });
      }
    }
  }

  async createPayment(dto: CreatePaymentDto, adminId?: string): Promise<PaymentDto> {
    const contract = await this.prisma.installmentContract.findUnique({
      where: { id: dto.contractId },
    });

    if (!contract) {
      throw new NotFoundException('Nasiya shartnomasi topilmadi');
    }

    if (dto.method === PaymentMethod.CASH) {
      // Immediate Confirmation for CASH payment
      return this.prisma.$transaction(async (tx) => {
        const payment = await tx.payment.create({
          data: {
            contractId: dto.contractId,
            amount: new Prisma.Decimal(dto.amount),
            method: PaymentMethod.CASH,
            status: PaymentStatus.CONFIRMED,
            receiptUrl: dto.receiptUrl || null,
            paidAt: new Date(),
          },
        });

        // Cash Entry
        await tx.cashEntry.create({
          data: {
            direction: 'CASH_IN',
            amount: new Prisma.Decimal(dto.amount),
            occurredAt: new Date(),
            sourceType: 'INSTALLMENT_PAYMENT',
            sourceId: payment.id,
            saleId: contract.saleId,
            paymentId: payment.id,
            note: `Nasiya oylik to'lovi qabul qilindi (Shartnoma: ${contract.id.substring(0, 8)})`,
          },
        });

        // Update Outstanding Balance
        const currentOutstanding = Number(contract.outstandingAmount);
        const newOutstanding = Math.max(0, currentOutstanding - dto.amount);
        const newContractStatus =
          newOutstanding === 0 ? InstallmentStatus.CLOSED : contract.status;

        await tx.installmentContract.update({
          where: { id: contract.id },
          data: {
            outstandingAmount: new Prisma.Decimal(newOutstanding),
            status: newContractStatus,
          },
        });

        // Apply to schedules
        await this.applyPaymentToSchedules(tx, contract.id, dto.amount);

        // Audit Log
        await tx.auditLog.create({
          data: {
            actorId: adminId || null,
            action: 'CREATE_CASH_PAYMENT',
            entityType: 'PAYMENT',
            entityId: payment.id,
            afterJson: { amount: dto.amount, method: dto.method },
          },
        });

        return this.mapPaymentDto(payment);
      });
    } else {
      // CARD_TRANSFER payment: Created as PENDING_VERIFICATION
      const payment = await this.prisma.payment.create({
        data: {
          contractId: dto.contractId,
          amount: new Prisma.Decimal(dto.amount),
          method: PaymentMethod.CARD_TRANSFER,
          status: PaymentStatus.PENDING_VERIFICATION,
          receiptUrl: dto.receiptUrl || null,
        },
      });

      return this.mapPaymentDto(payment);
    }
  }

  async confirmPayment(paymentId: string, adminId?: string): Promise<PaymentDto> {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { contract: true },
      });

      if (!payment) {
        throw new NotFoundException('To\'lov topilmadi');
      }

      if (payment.status !== PaymentStatus.PENDING_VERIFICATION) {
        throw new BadRequestException(`Ushbu to'lov holati: ${payment.status}`);
      }

      const amount = Number(payment.amount);
      const contract = payment.contract;

      // Update payment status
      const confirmedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: {
          status: PaymentStatus.CONFIRMED,
          paidAt: new Date(),
        },
      });

      // Create Cash Entry
      await tx.cashEntry.create({
        data: {
          direction: 'CASH_IN',
          amount: new Prisma.Decimal(amount),
          occurredAt: new Date(),
          sourceType: 'INSTALLMENT_PAYMENT',
          sourceId: paymentId,
          saleId: contract.saleId,
          paymentId: paymentId,
          note: `Karta to'lovi tasdiqlandi (Shartnoma: ${contract.id.substring(0, 8)})`,
        },
      });

      // Update Outstanding Balance
      const currentOutstanding = Number(contract.outstandingAmount);
      const newOutstanding = Math.max(0, currentOutstanding - amount);
      const newContractStatus =
        newOutstanding === 0 ? InstallmentStatus.CLOSED : contract.status;

      await tx.installmentContract.update({
        where: { id: contract.id },
        data: {
          outstandingAmount: new Prisma.Decimal(newOutstanding),
          status: newContractStatus,
        },
      });

      // Apply to schedules
      await this.applyPaymentToSchedules(tx, contract.id, amount);

      // Audit Log
      await tx.auditLog.create({
        data: {
          actorId: adminId || null,
          action: 'CONFIRM_TRANSFER_PAYMENT',
          entityType: 'PAYMENT',
          entityId: paymentId,
          afterJson: { amount, status: PaymentStatus.CONFIRMED },
        },
      });

      return this.mapPaymentDto(confirmedPayment);
    });
  }

  async rejectPayment(paymentId: string, adminId?: string): Promise<PaymentDto> {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException('To\'lov topilmadi');
    }

    if (payment.status !== PaymentStatus.PENDING_VERIFICATION) {
      throw new BadRequestException('Faqat tekshiruvdagi to\'lov rad etilishi mumkin');
    }

    const rejected = await this.prisma.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.REJECTED },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: adminId || null,
        action: 'REJECT_TRANSFER_PAYMENT',
        entityType: 'PAYMENT',
        entityId: paymentId,
        afterJson: { status: PaymentStatus.REJECTED },
      },
    });

    return this.mapPaymentDto(rejected);
  }

  async reversePayment(paymentId: string, adminId?: string): Promise<PaymentDto> {
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({
        where: { id: paymentId },
        include: { contract: true },
      });

      if (!payment) {
        throw new NotFoundException('To\'lov topilmadi');
      }

      if (payment.status !== PaymentStatus.CONFIRMED) {
        throw new BadRequestException('Faqat tasdiqlangan to\'lov qaytarilishi / bekor qilinishi mumkin');
      }

      const amount = Number(payment.amount);
      const contract = payment.contract;

      // Reversing Cash Entry (CASH_OUT)
      await tx.cashEntry.create({
        data: {
          direction: 'CASH_OUT',
          amount: new Prisma.Decimal(amount),
          occurredAt: new Date(),
          sourceType: 'PAYMENT_REVERSAL',
          sourceId: paymentId,
          saleId: contract.saleId,
          paymentId: paymentId,
          note: `To'lov bekor qilindi (Shartnoma: ${contract.id.substring(0, 8)})`,
        },
      });

      // Update payment status to REVERSED
      const reversedPayment = await tx.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.REVERSED },
      });

      // Restore Outstanding Amount
      const currentOutstanding = Number(contract.outstandingAmount);
      const restoredOutstanding = currentOutstanding + amount;

      await tx.installmentContract.update({
        where: { id: contract.id },
        data: {
          outstandingAmount: new Prisma.Decimal(restoredOutstanding),
          status: InstallmentStatus.ACTIVE,
        },
      });

      // Audit Log
      await tx.auditLog.create({
        data: {
          actorId: adminId || null,
          action: 'REVERSE_PAYMENT',
          entityType: 'PAYMENT',
          entityId: paymentId,
          afterJson: { status: PaymentStatus.REVERSED },
        },
      });

      return this.mapPaymentDto(reversedPayment);
    });
  }

  async getPendingPayments(): Promise<PaymentDto[]> {
    const payments = await this.prisma.payment.findMany({
      where: { status: PaymentStatus.PENDING_VERIFICATION },
      include: {
        contract: {
          include: { customer: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return payments.map((p) => this.mapPaymentDto(p));
  }

  async getContracts(
    status?: InstallmentStatus,
    customerId?: string,
  ): Promise<InstallmentContractDto[]> {
    const where: any = {};
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;

    const contracts = await this.prisma.installmentContract.findMany({
      where,
      include: {
        customer: true,
        sale: { include: { saleItems: { include: { product: true } } } },
        paymentSchedules: { orderBy: { dueDate: 'asc' } },
        payments: { orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return contracts.map((c) => this.mapContractDto(c));
  }

  async getContract(contractId: string): Promise<InstallmentContractDto> {
    const contract = await this.prisma.installmentContract.findUnique({
      where: { id: contractId },
      include: {
        customer: true,
        sale: { include: { saleItems: { include: { product: true } } } },
        paymentSchedules: { orderBy: { dueDate: 'asc' } },
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!contract) {
      throw new NotFoundException('Nasiya shartnomasi topilmadi');
    }

    return this.mapContractDto(contract);
  }

  async updateSchedule(
    contractId: string,
    dto: UpdateScheduleDto,
    adminId?: string,
  ): Promise<InstallmentContractDto> {
    const contract = await this.prisma.installmentContract.findUnique({
      where: { id: contractId },
      include: { payments: true },
    });

    if (!contract) {
      throw new NotFoundException('Nasiya shartnomasi topilmadi');
    }

    // Check if any confirmed payments have been made against this contract
    const hasConfirmedPayments = contract.payments.some(
      (p) => p.status === PaymentStatus.CONFIRMED,
    );

    if (hasConfirmedPayments) {
      throw new BadRequestException(
        'To\'lov qabul qilingan shartnoma to\'lov jadvalini erkin tahrirlab bo\'lmaydi',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Delete existing payment schedules
      await tx.paymentSchedule.deleteMany({
        where: { contractId },
      });

      // Create new payment schedules
      for (const item of dto.schedules) {
        await tx.paymentSchedule.create({
          data: {
            contractId,
            dueDate: new Date(item.dueDate),
            amountDue: new Prisma.Decimal(item.amountDue),
            amountPaid: new Prisma.Decimal(0),
            status: ScheduleStatus.PENDING,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: adminId || null,
          action: 'UPDATE_PAYMENT_SCHEDULE',
          entityType: 'INSTALLMENT_CONTRACT',
          entityId: contractId,
          afterJson: { schedulesCount: dto.schedules.length },
        },
      });

      const updated = await tx.installmentContract.findUnique({
        where: { id: contractId },
        include: {
          customer: true,
          paymentSchedules: { orderBy: { dueDate: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } },
        },
      });

      return this.mapContractDto(updated!);
    });
  }
}
