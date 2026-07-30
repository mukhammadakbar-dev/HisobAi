import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { InventoryItemDto, LowStockAlertDto } from '@baraka/contracts';
import { Prisma, InventoryItemStatus } from '@prisma/client';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  private mapToDto(item: any): InventoryItemDto {
    return {
      id: item.id,
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
      imei: item.imei,
      serialNumber: item.serialNumber,
      costPrice: Number(item.costPrice),
      status: item.status,
      receivedAt: item.receivedAt.toISOString(),
      createdAt: item.createdAt.toISOString(),
    };
  }

  async receiveStock(dto: ReceiveStockDto): Promise<InventoryItemDto[]> {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });

    if (!product) {
      throw new NotFoundException('Mahsulot shabloni topilmadi');
    }

    const receivedDate = dto.receivedAt ? new Date(dto.receivedAt) : new Date();

    if (product.isSerialized) {
      // Serialized product: Requires IMEI or Serial Number
      const imei = dto.imei?.trim() || null;
      const serialNumber = dto.serialNumber?.trim() || null;

      if (!imei && !serialNumber) {
        throw new BadRequestException(
          'Seriyali mahsulot uchun IMEI yoki Seriya raqami kiritilishi shart',
        );
      }

      // Check unique IMEI / Serial
      if (imei) {
        const existingImei = await this.prisma.inventoryItem.findFirst({
          where: { imei },
        });
        if (existingImei) {
          throw new ConflictException(`Ushbu IMEI (${imei}) ma'lumotlar bazasida mavjud`);
        }
      }

      if (serialNumber) {
        const existingSerial = await this.prisma.inventoryItem.findFirst({
          where: { serialNumber },
        });
        if (existingSerial) {
          throw new ConflictException(
            `Ushbu Seriya raqami (${serialNumber}) ma'lumotlar bazasida mavjud`,
          );
        }
      }

      // Create single item & movement inside transaction
      const result = await this.prisma.$transaction(async (tx) => {
        const item = await tx.inventoryItem.create({
          data: {
            productId: product.id,
            imei,
            serialNumber,
            costPrice: new Prisma.Decimal(dto.costPrice),
            status: InventoryItemStatus.AVAILABLE,
            receivedAt: receivedDate,
          },
          include: { product: true },
        });

        await tx.stockMovement.create({
          data: {
            inventoryItemId: item.id,
            productId: product.id,
            type: 'RECEIVE',
            quantity: 1,
            referenceType: 'STOCK_RECEIVE',
            referenceId: item.id,
          },
        });

        return item;
      });

      return [this.mapToDto(result)];
    } else {
      // Non-serialized product: Quantity based
      const qty = dto.quantity && dto.quantity > 0 ? dto.quantity : 1;

      const createdItems = await this.prisma.$transaction(async (tx) => {
        const items = [];
        for (let i = 0; i < qty; i++) {
          const item = await tx.inventoryItem.create({
            data: {
              productId: product.id,
              costPrice: new Prisma.Decimal(dto.costPrice),
              status: InventoryItemStatus.AVAILABLE,
              receivedAt: receivedDate,
            },
            include: { product: true },
          });
          items.push(item);
        }

        await tx.stockMovement.create({
          data: {
            productId: product.id,
            type: 'RECEIVE',
            quantity: qty,
            referenceType: 'STOCK_RECEIVE_BATCH',
          },
        });

        return items;
      });

      return createdItems.map((item) => this.mapToDto(item));
    }
  }

  async findAll(status?: InventoryItemStatus, search?: string): Promise<InventoryItemDto[]> {
    const where: any = {};
    if (status) {
      where.status = status;
    }

    if (search) {
      const q = search.trim();
      where.OR = [
        { imei: { contains: q, mode: 'insensitive' } },
        { serialNumber: { contains: q, mode: 'insensitive' } },
        { product: { model: { contains: q, mode: 'insensitive' } } },
        { product: { brand: { contains: q, mode: 'insensitive' } } },
        { product: { category: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const items = await this.prisma.inventoryItem.findMany({
      where,
      include: { product: true },
      orderBy: { receivedAt: 'desc' },
    });

    return items.map((item) => this.mapToDto(item));
  }

  async search(query: string): Promise<InventoryItemDto[]> {
    if (!query || query.trim().length === 0) {
      return [];
    }
    return this.findAll(undefined, query);
  }

  async getLowStockAlerts(): Promise<LowStockAlertDto[]> {
    const products = await this.prisma.product.findMany();
    const alerts: LowStockAlertDto[] = [];

    for (const product of products) {
      const availableCount = await this.prisma.inventoryItem.count({
        where: {
          productId: product.id,
          status: InventoryItemStatus.AVAILABLE,
        },
      });

      if (availableCount <= product.minStockAlert) {
        alerts.push({
          product: {
            id: product.id,
            category: product.category,
            brand: product.brand,
            model: product.model,
            storage: product.storage,
            color: product.color,
            isSerialized: product.isSerialized,
            defaultSalePrice: Number(product.defaultSalePrice),
            minStockAlert: product.minStockAlert,
            createdAt: product.createdAt.toISOString(),
            updatedAt: product.updatedAt.toISOString(),
          },
          availableQuantity: availableCount,
          minStockAlert: product.minStockAlert,
        });
      }
    }

    return alerts;
  }
}
