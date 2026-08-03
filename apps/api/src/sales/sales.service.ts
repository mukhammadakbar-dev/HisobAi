import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ConfirmSaleDto } from './dto/confirm-sale.dto';
import { SaleDto, SaleItemDto } from '@baraka/contracts';
import { Prisma, InventoryItemStatus, SaleStatus, SaleKind } from '@prisma/client';

@Injectable()
export class SalesService {
  constructor(private readonly prisma: PrismaService) {}

  private mapToDto(sale: any): SaleDto {
    return {
      id: sale.id,
      customerId: sale.customerId,
      customer: sale.customer
        ? {
            id: sale.customer.id,
            fullName: sale.customer.fullName,
            phoneE164: sale.customer.phoneE164,
            address: sale.customer.address,
            note: sale.customer.note,
            totalDebt: 0,
            salesCount: 0,
            activeContractsCount: 0,
            createdAt: sale.customer.createdAt.toISOString(),
            updatedAt: sale.customer.updatedAt.toISOString(),
          }
        : undefined,
      kind: sale.kind,
      status: sale.status,
      subtotal: Number(sale.subtotal),
      discount: Number(sale.discount),
      total: Number(sale.total),
      soldAt: sale.soldAt.toISOString(),
      saleItems: (sale.saleItems || []).map((item: any) => ({
        id: item.id,
        saleId: item.saleId,
        inventoryItemId: item.inventoryItemId,
        productId: item.productId,
        product: item.product
          ? {
              id: item.product.id,
              category: item.product.category,
              brand: item.product.brand,
              model: item.product.model,
              storage: item.product.storage,
              color: item.product.color,
              isSerialized: item.product.isSerialized,
              defaultSalePrice: Number(item.product.defaultSalePrice),
              minStockAlert: item.product.minStockAlert,
              createdAt: item.product.createdAt.toISOString(),
              updatedAt: item.product.updatedAt.toISOString(),
            }
          : undefined,
        inventoryItem: item.inventoryItem
          ? {
              id: item.inventoryItem.id,
              productId: item.inventoryItem.productId,
              imei: item.inventoryItem.imei,
              serialNumber: item.inventoryItem.serialNumber,
              costPrice: Number(item.inventoryItem.costPrice),
              status: item.inventoryItem.status,
              receivedAt: item.inventoryItem.receivedAt.toISOString(),
              createdAt: item.inventoryItem.createdAt.toISOString(),
            }
          : undefined,
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        costSnapshot: Number(item.costSnapshot),
        createdAt: item.createdAt.toISOString(),
      })),
      installmentContract: sale.installmentContract,
      createdAt: sale.createdAt.toISOString(),
      updatedAt: sale.updatedAt.toISOString(),
    };
  }

  async createDraft(dto: CreateSaleDto): Promise<SaleDto> {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('Savdoga kamida bitta mahsulot qo\'shilishi shart');
    }

    let subtotal = 0;
    const saleItemsData = [];

    for (const itemDto of dto.items) {
      let costSnapshot = 0;

      if (itemDto.inventoryItemId) {
        const invItem = await this.prisma.inventoryItem.findUnique({
          where: { id: itemDto.inventoryItemId },
        });
        if (!invItem) {
          throw new NotFoundException(`Ombor birligi (${itemDto.inventoryItemId}) topilmadi`);
        }
        costSnapshot = Number(invItem.costPrice);
      } else {
        const product = await this.prisma.product.findUnique({
          where: { id: itemDto.productId },
        });
        if (!product) {
          throw new NotFoundException(`Mahsulot (${itemDto.productId}) topilmadi`);
        }
        costSnapshot = Number(product.defaultSalePrice) * 0.8; // Default cost fallback
      }

      const itemTotal = itemDto.unitPrice * itemDto.quantity;
      subtotal += itemTotal;

      saleItemsData.push({
        inventoryItemId: itemDto.inventoryItemId || null,
        productId: itemDto.productId,
        quantity: itemDto.quantity,
        unitPrice: new Prisma.Decimal(itemDto.unitPrice),
        costSnapshot: new Prisma.Decimal(costSnapshot),
      });
    }

    const discount = dto.discount || 0;
    const total = Math.max(0, subtotal - discount);

    const sale = await this.prisma.sale.create({
      data: {
        customerId: dto.customerId || null,
        kind: dto.kind,
        status: SaleStatus.DRAFT,
        subtotal: new Prisma.Decimal(subtotal),
        discount: new Prisma.Decimal(discount),
        total: new Prisma.Decimal(total),
        saleItems: {
          create: saleItemsData,
        },
      },
      include: {
        customer: true,
        saleItems: {
          include: { product: true, inventoryItem: true },
        },
      },
    });

    return this.mapToDto(sale);
  }

  async confirm(id: string, dto: ConfirmSaleDto, adminId?: string): Promise<SaleDto> {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id },
        include: {
          customer: true,
          saleItems: {
            include: { product: true, inventoryItem: true },
          },
        },
      });

      if (!sale) {
        throw new NotFoundException('Savdo topilmadi');
      }

      if (sale.status !== SaleStatus.DRAFT) {
        throw new BadRequestException(`Ushbu savdo allaqachon ${sale.status} holatida`);
      }

      const total = Number(sale.total);

      // 1 & 2 & 3. Validate & Update Inventory Items & Stock Movements
      for (const item of sale.saleItems) {
        if (item.inventoryItemId) {
          const invItem = await tx.inventoryItem.findUnique({
            where: { id: item.inventoryItemId },
          });

          if (!invItem || invItem.status !== InventoryItemStatus.AVAILABLE) {
            throw new ConflictException(
              `Mahsulot birligi (IMEI: ${invItem?.imei || item.inventoryItemId}) allaqachon sotilgan yoki band qilingan`,
            );
          }

          // Mark serialized item as SOLD
          await tx.inventoryItem.update({
            where: { id: item.inventoryItemId },
            data: { status: InventoryItemStatus.SOLD },
          });

          // Stock Movement audit
          await tx.stockMovement.create({
            data: {
              inventoryItemId: item.inventoryItemId,
              productId: item.productId,
              type: 'SALE',
              quantity: 1,
              referenceType: 'SALE_CONFIRM',
              referenceId: sale.id,
            },
          });
        } else {
          // Non-serialized item stock movement
          await tx.stockMovement.create({
            data: {
              productId: item.productId,
              type: 'SALE',
              quantity: item.quantity,
              referenceType: 'SALE_CONFIRM',
              referenceId: sale.id,
            },
          });
        }
      }

      // 4. CASH Sale Handling
      if (sale.kind === SaleKind.CASH) {
        await tx.cashEntry.create({
          data: {
            direction: 'CASH_IN',
            amount: new Prisma.Decimal(total),
            occurredAt: new Date(),
            sourceType: 'SALE',
            sourceId: sale.id,
            saleId: sale.id,
            note: `Naqd savdo tasdiqlandi (ID: ${sale.id.substring(0, 8)})`,
          },
        });
      }

      // 5. INSTALLMENT Sale Handling
      if (sale.kind === SaleKind.INSTALLMENT) {
        if (!sale.customerId) {
          throw new BadRequestException('Nasiya savdosi uchun mijoz tanlanishi shart');
        }

        const downPayment = dto.downPayment || 0;
        const principal = Math.max(0, total - downPayment);
        const months = dto.installmentMonths && dto.installmentMonths > 0 ? dto.installmentMonths : 6;
        const monthlyAmount = principal / months;

        const contract = await tx.installmentContract.create({
          data: {
            saleId: sale.id,
            customerId: sale.customerId,
            principal: new Prisma.Decimal(principal),
            downPayment: new Prisma.Decimal(downPayment),
            outstandingAmount: new Prisma.Decimal(principal),
            status: 'ACTIVE',
          },
        });

        // Generate Payment Schedule
        const startDate = dto.startDate ? new Date(dto.startDate) : new Date();
        for (let i = 1; i <= months; i++) {
          const dueDate = new Date(startDate);
          dueDate.setMonth(dueDate.getMonth() + i);

          await tx.paymentSchedule.create({
            data: {
              contractId: contract.id,
              dueDate,
              amountDue: new Prisma.Decimal(monthlyAmount),
              amountPaid: new Prisma.Decimal(0),
              status: 'PENDING',
            },
          });
        }

        // Down payment cash entry
        if (downPayment > 0) {
          const payment = await tx.payment.create({
            data: {
              contractId: contract.id,
              amount: new Prisma.Decimal(downPayment),
              method: 'CASH',
              status: 'CONFIRMED',
              paidAt: new Date(),
            },
          });

          await tx.cashEntry.create({
            data: {
              direction: 'CASH_IN',
              amount: new Prisma.Decimal(downPayment),
              occurredAt: new Date(),
              sourceType: 'DOWN_PAYMENT',
              sourceId: payment.id,
              saleId: sale.id,
              paymentId: payment.id,
              note: `Nasiya boshlang'ich to'lovi (Shartnoma: ${contract.id.substring(0, 8)})`,
            },
          });
        }
      }

      // 6. Update Sale Status & Create Audit Log
      const confirmedSale = await tx.sale.update({
        where: { id: sale.id },
        data: {
          status: SaleStatus.CONFIRMED,
          soldAt: new Date(),
        },
        include: {
          customer: true,
          saleItems: { include: { product: true, inventoryItem: true } },
          installmentContract: true,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: adminId || null,
          action: 'CONFIRM_SALE',
          entityType: 'SALE',
          entityId: sale.id,
          afterJson: { total, kind: sale.kind },
        },
      });

      return this.mapToDto(confirmedSale);
    });
  }

  async reverse(id: string, adminId?: string): Promise<SaleDto> {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findUnique({
        where: { id },
        include: {
          customer: true,
          saleItems: { include: { product: true, inventoryItem: true } },
          installmentContract: true,
        },
      });

      if (!sale) {
        throw new NotFoundException('Savdo topilmadi');
      }

      if (sale.status !== SaleStatus.CONFIRMED) {
        throw new BadRequestException('Faqat tasdiqlangan savdo qaytarilishi / bekor qilinishi mumkin');
      }

      const total = Number(sale.total);

      // 1. Revert Inventory Items & Create Reversing Stock Movements
      for (const item of sale.saleItems) {
        if (item.inventoryItemId) {
          await tx.inventoryItem.update({
            where: { id: item.inventoryItemId },
            data: { status: InventoryItemStatus.AVAILABLE },
          });

          await tx.stockMovement.create({
            data: {
              inventoryItemId: item.inventoryItemId,
              productId: item.productId,
              type: 'RETURN',
              quantity: 1,
              referenceType: 'SALE_REVERSE',
              referenceId: sale.id,
            },
          });
        }
      }

      // 2. Reversing Cash Entry (CASH_OUT)
      await tx.cashEntry.create({
        data: {
          direction: 'CASH_OUT',
          amount: new Prisma.Decimal(total),
          occurredAt: new Date(),
          sourceType: 'SALE_REVERSAL',
          sourceId: sale.id,
          saleId: sale.id,
          note: `Savdo bekor qilindi (ID: ${sale.id.substring(0, 8)})`,
        },
      });

      // 3. Cancel Installment Contract if exists
      if (sale.installmentContract) {
        await tx.installmentContract.update({
          where: { id: sale.installmentContract.id },
          data: { status: 'CANCELLED' },
        });
      }

      // 4. Update Sale status to REVERSED
      const reversedSale = await tx.sale.update({
        where: { id: sale.id },
        data: { status: SaleStatus.REVERSED },
        include: {
          customer: true,
          saleItems: { include: { product: true, inventoryItem: true } },
          installmentContract: true,
        },
      });

      // 5. Create Audit Log
      await tx.auditLog.create({
        data: {
          actorId: adminId || null,
          action: 'REVERSE_SALE',
          entityType: 'SALE',
          entityId: sale.id,
          afterJson: { status: SaleStatus.REVERSED },
        },
      });

      return this.mapToDto(reversedSale);
    });
  }

  async findAll(customerId?: string, status?: SaleStatus): Promise<SaleDto[]> {
    const where: any = {};
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;

    const sales = await this.prisma.sale.findMany({
      where,
      include: {
        customer: true,
        saleItems: { include: { product: true, inventoryItem: true } },
        installmentContract: true,
      },
      orderBy: { soldAt: 'desc' },
    });

    return sales.map((s) => this.mapToDto(s));
  }

  async findOne(id: string): Promise<SaleDto> {
    const sale = await this.prisma.sale.findUnique({
      where: { id },
      include: {
        customer: true,
        saleItems: { include: { product: true, inventoryItem: true } },
        installmentContract: true,
      },
    });

    if (!sale) {
      throw new NotFoundException('Savdo topilmadi');
    }

    return this.mapToDto(sale);
  }
}
