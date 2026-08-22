import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@hisobai/contracts';
import type {
  BatchQuery,
  InventoryBatchDto,
  InventoryItemDetailDto,
  InventoryItemDto,
  InventoryQuery,
  MovementQuery,
  Page,
  StockMovementDto,
} from '@hisobai/contracts';
import type { Prisma } from '@prisma/client';

import { AppException } from '../common/app.exception';
import { dayRangeFilter } from '../common/dates';
import { normalizeLimit, toPage, toPrismaCursor } from '../common/pagination';
import { containsInsensitive } from '../common/search';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import {
  BATCH_INCLUDE,
  ITEM_INCLUDE,
  MOVEMENT_INCLUDE,
  toBatchDto,
  toItemDto,
  toMovementDto,
} from './inventory.mappers';

/**
 * Ombor — o'qish (§5.1, §5.2, §5.10).
 *
 * Yozish amallari ataylab bu servisda emas: qabul qilish
 * `InventoryReceivingService` da, tuzatish va inventarizatsiya esa
 * keyingi bosqichlarda (§18 qamrovi). Shu sabab bu yerdagi hamma narsa
 * `findMany` — tranzaksiya ham, qulf ham kerak emas.
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** §5.3 — qidiruv ikkala IMEI, seriya raqami va mahsulot nomini qamraydi. */
  async listItems(query: InventoryQuery): Promise<Page<InventoryItemDto>> {
    const limit = normalizeLimit(query.limit);
    const direction = query.sort === 'receivedAt' ? 'asc' : 'desc';

    const where: Prisma.InventoryItemWhereInput = {};
    if (query.productId) where.productId = query.productId;
    if (query.status) where.status = { in: query.status };
    if (query.q) {
      // Joker belgilar oddiy belgiga aylanadi — izoh `common/search.ts` da
      const contains = containsInsensitive(query.q);
      where.OR = [
        { imei1: contains },
        { imei2: contains },
        { serialNumber: contains },
        { product: { displayName: contains } },
      ];
    }

    const [rows, totalCount] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where,
        orderBy: [{ receivedAt: direction }, { id: direction }],
        include: ITEM_INCLUDE,
        ...toPrismaCursor(query.cursor, limit),
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);

    return toPage(rows.map(toItemDto), limit, (dto) => dto.receivedAt, totalCount);
  }

  /** §5.10 — birlik va uning butun tarixi; harakatlar hech qachon o'chirilmaydi. */
  async requireItem(id: string): Promise<InventoryItemDetailDto> {
    const row = await this.prisma.inventoryItem.findUnique({
      where: { id },
      include: ITEM_INCLUDE,
    });
    if (!row) throw AppException.notFound(ErrorCode.NOT_FOUND, 'Ombor birligi topilmadi.');

    const movements = await this.prisma.stockMovement.findMany({
      where: { inventoryItemId: id },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      include: MOVEMENT_INCLUDE,
    });

    return { ...toItemDto(row), movements: movements.map(toMovementDto) };
  }

  async listBatches(query: BatchQuery): Promise<Page<InventoryBatchDto>> {
    const limit = normalizeLimit(query.limit);
    const direction = query.sort === 'receivedAt' ? 'asc' : 'desc';

    const where: Prisma.InventoryBatchWhereInput = query.productId
      ? { productId: query.productId }
      : {};

    const [rows, totalCount] = await Promise.all([
      this.prisma.inventoryBatch.findMany({
        where,
        orderBy: [{ receivedAt: direction }, { id: direction }],
        include: BATCH_INCLUDE,
        ...toPrismaCursor(query.cursor, limit),
      }),
      this.prisma.inventoryBatch.count({ where }),
    ]);

    return toPage(rows.map(toBatchDto), limit, (dto) => dto.receivedAt, totalCount);
  }

  async listMovements(query: MovementQuery): Promise<Page<StockMovementDto>> {
    const limit = normalizeLimit(query.limit);
    const direction = query.sort === 'occurredAt' ? 'asc' : 'desc';

    const where: Prisma.StockMovementWhereInput = {};
    if (query.productId) where.productId = query.productId;
    if (query.inventoryItemId) where.inventoryItemId = query.inventoryItemId;
    if (query.type) where.type = { in: query.type };
    if (query.referenceType) where.referenceType = query.referenceType;
    if (query.referenceId) where.referenceId = query.referenceId;

    // Sana chegaralari do'kon zonasida hisoblanadi (`API.md` §5.2)
    const occurredAt = dayRangeFilter(query.from, query.to, this.timeZone);
    if (occurredAt) where.occurredAt = occurredAt;

    const [rows, totalCount] = await Promise.all([
      this.prisma.stockMovement.findMany({
        where,
        orderBy: [{ occurredAt: direction }, { id: direction }],
        include: MOVEMENT_INCLUDE,
        ...toPrismaCursor(query.cursor, limit),
      }),
      this.prisma.stockMovement.count({ where }),
    ]);

    return toPage(rows.map(toMovementDto), limit, (dto) => dto.occurredAt, totalCount);
  }

  private get timeZone(): string {
    return this.config.get('TIMEZONE', { infer: true });
  }
}
