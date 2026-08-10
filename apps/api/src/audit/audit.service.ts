import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { serializeDecimals } from '../common/decimal-serializer.interceptor';
import { PrismaService } from '../database/prisma.service';

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

/**
 * Audit yozuvlari (§2.2, §3.10, §6.7).
 *
 * Ikki chaqirish usuli bor va ular ataylab ajratilgan:
 *
 *  - `record()` — **tranzaksiya ichida**. Savdo tasdiqlash, to'lov,
 *    qaytarish kabi moliyaviy amallarda audit yozuvi asosiy o'zgarish
 *    bilan bitta tranzaksiyada bo'lishi shart (ARCHITECTURE §6): amal
 *    saqlanib, audit yozilmay qolishi mumkin emas.
 *  - `recordDetached()` — tranzaksiyadan tashqarida, o'qish amallari
 *    uchun (masalan passport rasmini ko'rish, §6.7).
 *
 * `Decimal` qiymatlari JSONB ga satr sifatida yoziladi — xom `Decimal`
 * obyekti tushsa, keyin o'qib bo'lmaydigan shakl chiqadi.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({ data: toData(entry) });
  }

  async recordDetached(entry: AuditEntry): Promise<void> {
    await this.prisma.auditLog.create({ data: toData(entry) });
  }
}

function toData(entry: AuditEntry): Prisma.AuditLogUncheckedCreateInput {
  return {
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    beforeJson: toJson(entry.before),
    afterJson: toJson(entry.after),
    ip: entry.ip ?? null,
  };
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return serializeDecimals(value) as Prisma.InputJsonValue;
}
