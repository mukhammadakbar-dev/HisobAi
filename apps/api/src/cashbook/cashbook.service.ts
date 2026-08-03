import {
  Injectable,
  OnModuleInit,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCashEntryDto } from './dto/create-cash-entry.dto';
import { CreateCashCategoryDto } from './dto/create-cash-category.dto';
import { QueryCashEntriesDto } from './dto/query-cash-entries.dto';
import { CashCategoryDto, CashEntryDto } from '@baraka/contracts';
import { Prisma, CashDirection } from '@prisma/client';

const SYSTEM_CATEGORIES = [
  { name: 'Ijara / Rent', direction: CashDirection.CASH_OUT, isSystem: true },
  { name: 'Yetkazish / Delivery', direction: CashDirection.CASH_OUT, isSystem: true },
  { name: 'Maosh / Salary', direction: CashDirection.CASH_OUT, isSystem: true },
  { name: 'Kommunal / Utilities', direction: CashDirection.CASH_OUT, isSystem: true },
  { name: 'Boshqa chiqim / Other Expense', direction: CashDirection.CASH_OUT, isSystem: true },
  { name: 'Sarmoya / Investment', direction: CashDirection.CASH_IN, isSystem: true },
  { name: 'Savdo tushumi / Sales Revenue', direction: CashDirection.CASH_IN, isSystem: true },
  { name: 'Boshqa daromad / Other Income', direction: CashDirection.CASH_IN, isSystem: true },
];

@Injectable()
export class CashbookService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.seedCategories();
  }

  private async seedCategories() {
    for (const cat of SYSTEM_CATEGORIES) {
      const existing = await this.prisma.cashCategory.findFirst({
        where: { name: cat.name, direction: cat.direction },
      });
      if (!existing) {
        await this.prisma.cashCategory.create({
          data: cat,
        });
      }
    }
  }

  private mapCategoryDto(cat: any): CashCategoryDto {
    return {
      id: cat.id,
      name: cat.name,
      direction: cat.direction as any,
      isSystem: cat.isSystem,
      createdAt: cat.createdAt.toISOString(),
    };
  }

  private mapEntryDto(entry: any): CashEntryDto {
    return {
      id: entry.id,
      direction: entry.direction as any,
      amount: Number(entry.amount),
      occurredAt: entry.occurredAt.toISOString(),
      categoryId: entry.categoryId,
      category: entry.category ? this.mapCategoryDto(entry.category) : null,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      saleId: entry.saleId,
      paymentId: entry.paymentId,
      note: entry.note,
      attachmentUrl: entry.attachmentUrl,
      createdAt: entry.createdAt.toISOString(),
    };
  }

  async getCategories(direction?: CashDirection): Promise<CashCategoryDto[]> {
    const where: any = {};
    if (direction) where.direction = direction;

    const categories = await this.prisma.cashCategory.findMany({
      where,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });

    return categories.map((c) => this.mapCategoryDto(c));
  }

  async createCategory(
    dto: CreateCashCategoryDto,
    adminId?: string,
  ): Promise<CashCategoryDto> {
    const existing = await this.prisma.cashCategory.findFirst({
      where: { name: dto.name, direction: dto.direction },
    });

    if (existing) {
      throw new BadRequestException('Bunday kategoriya allaqachon mavjud');
    }

    const category = await this.prisma.cashCategory.create({
      data: {
        name: dto.name,
        direction: dto.direction,
        isSystem: false,
      },
    });

    if (adminId) {
      await this.prisma.auditLog.create({
        data: {
          actorId: adminId,
          action: 'CREATE_CASH_CATEGORY',
          entityType: 'CASH_CATEGORY',
          entityId: category.id,
          afterJson: { name: category.name, direction: category.direction },
        },
      });
    }

    return this.mapCategoryDto(category);
  }

  async createEntry(
    dto: CreateCashEntryDto,
    adminId?: string,
  ): Promise<CashEntryDto> {
    if (dto.categoryId) {
      const category = await this.prisma.cashCategory.findUnique({
        where: { id: dto.categoryId },
      });
      if (!category) {
        throw new NotFoundException('Kategoriya topilmadi');
      }
    }

    const entry = await this.prisma.cashEntry.create({
      data: {
        direction: dto.direction,
        amount: new Prisma.Decimal(dto.amount),
        categoryId: dto.categoryId || null,
        occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : new Date(),
        sourceType: 'MANUAL',
        note: dto.note || null,
        attachmentUrl: dto.attachmentUrl || null,
      },
      include: {
        category: true,
      },
    });

    if (adminId) {
      await this.prisma.auditLog.create({
        data: {
          actorId: adminId,
          action: 'CREATE_CASH_ENTRY',
          entityType: 'CASH_ENTRY',
          entityId: entry.id,
          afterJson: {
            amount: dto.amount,
            direction: dto.direction,
            note: dto.note,
          },
        },
      });
    }

    return this.mapEntryDto(entry);
  }

  async getEntries(query: QueryCashEntriesDto): Promise<CashEntryDto[]> {
    const where: any = {};

    if (query.direction) {
      where.direction = query.direction;
    }

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    if (query.from || query.to) {
      where.occurredAt = {};
      if (query.from) {
        where.occurredAt.gte = new Date(query.from);
      }
      if (query.to) {
        const toDate = new Date(query.to);
        toDate.setHours(23, 59, 59, 999);
        where.occurredAt.lte = toDate;
      }
    }

    const entries = await this.prisma.cashEntry.findMany({
      where,
      include: {
        category: true,
      },
      orderBy: { occurredAt: 'desc' },
    });

    return entries.map((e) => this.mapEntryDto(e));
  }
}
