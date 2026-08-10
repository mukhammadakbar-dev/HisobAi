import { ErrorCode } from '@hisobai/contracts';
import { Prisma, type Settings } from '@prisma/client';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuditEntry } from '../audit/audit.service';
import { AppException } from '../common/app.exception';
import { readPrecondition } from '../common/optimistic-lock';
import type { RequestUser } from '../common/request-user';
import { SettingsService } from './settings.service';

/**
 * Sozlamalar servisining ikkita xulqi sinaladi, chunki ikkalasi ham
 * **jimgina** buziladi:
 *
 *  - §3.10 audit diff — butun obyekt yozilsa jurnal o'qib bo'lmas
 *    bo'lib qoladi va "kim ustamani o'zgartirdi" degan savol javobsiz;
 *  - `API.md` §8 optimistik qulf — shartli `UPDATE` ishlamay qolsa,
 *    ikkinchi qurilmaning o'zgarishi bildirmasdan ustidan yoziladi.
 */

const ACTOR: RequestUser = {
  id: 'user-1',
  email: 'ega@hisobai.uz',
  displayName: "Do'kon egasi",
  role: 'OWNER',
  theme: 'SYSTEM',
  sessionId: 'session-1',
} as RequestUser;

const UPDATED_AT = new Date('2026-08-10T09:30:00.123Z');

function baseRow(): Settings {
  return {
    id: 1,
    shopName: 'HisobAI',
    logoFileId: null,
    address: null,
    phone: null,
    workStart: '09:00',
    workEnd: '19:00',
    weekendDays: [0],
    lowStockThreshold: 3,
    defaultInstallmentMonths: 6,
    defaultDownPaymentPercent: new Prisma.Decimal('30'),
    storeRateMarkupPercent: new Prisma.Decimal('0'),
    reminderHour: 9,
    updatedById: null,
    updatedAt: UPDATED_AT,
  } as Settings;
}

/** `where.updatedAt` — aniq sana yoki `{ lte }` (sarlavha varianti). */
function matchesFilter(actual: Date, filter: Date | { lte: Date } | undefined): boolean {
  if (filter === undefined) return true;
  if (filter instanceof Date) return actual.getTime() === filter.getTime();
  return actual.getTime() <= filter.lte.getTime();
}

function makeService(initial: Settings = baseRow()) {
  let row = initial;
  // Argumentlar tiplanadi: test audit yozuvining MAZMUNINI tekshiradi
  const audit = { record: vi.fn((_tx: unknown, _entry: AuditEntry) => Promise.resolve()) };

  const model = {
    upsert: () => Promise.resolve(row),
    findUniqueOrThrow: () => Promise.resolve(row),

    update: ({
      where,
      data,
    }: {
      where: { id: number; updatedAt?: Date | { lte: Date } };
      data: Record<string, unknown>;
    }) => {
      if (!matchesFilter(row.updatedAt, where.updatedAt)) {
        /**
         * Prisma shartga mos qator topmasa `P2025` beradi — va uni
         * **rad etilgan promise** sifatida beradi, sinxron `throw`
         * bilan emas. Dublyor shuni takrorlashi shart: sinxron tashlansa
         * servisdagi `.catch(...)` umuman ulanmaydi va test haqiqiy
         * xulqni sinamay qo'yadi.
         */
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError('Record to update not found.', {
            code: 'P2025',
            clientVersion: 'test',
          }),
        );
      }
      // `@updatedAt` — Prisma har yozuvda yangilaydi
      row = { ...row, ...data, updatedAt: new Date(row.updatedAt.getTime() + 1000) } as Settings;
      return Promise.resolve(row);
    },
  };

  const prisma = {
    settings: model,
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => fn({ settings: model }),
  };

  const service = new SettingsService(prisma as never, audit as never);
  return { service, audit, current: () => row };
}

/** Formadan kelgan token — forma yuklangan versiyaga bog'langan. */
function preconditionFor(updatedAt: Date) {
  return readPrecondition({ headers: {} } as unknown as Request, updatedAt.toISOString());
}

describe('SettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('get() — Decimal maydonlar satr sifatida chiqadi (`API.md` §2.1)', async () => {
    const { service } = makeService();

    const dto = await service.get();
    expect(dto.defaultDownPaymentPercent).toBe('30');
    expect(dto.storeRateMarkupPercent).toBe('0');
    expect(typeof dto.updatedAt).toBe('string');
  });

  it('§3.10 — audit’ga FAQAT o‘zgargan maydon tushadi', async () => {
    const { service, audit } = makeService();

    await service.update(
      ACTOR,
      { storeRateMarkupPercent: '2' },
      preconditionFor(UPDATED_AT),
      '::1',
    );

    expect(audit.record).toHaveBeenCalledOnce();
    const entry = audit.record.mock.calls[0]?.[1];

    expect(entry?.action).toBe('SETTINGS_UPDATED');
    expect(entry?.before).toEqual({ storeRateMarkupPercent: '0' });
    expect(entry?.after).toEqual({ storeRateMarkupPercent: '2' });
    // O'zgarmagan 10 ta maydon jurnalni to'ldirmaydi
    expect(Object.keys(entry?.after as Record<string, unknown>)).toHaveLength(1);
  });

  it('hech narsa o‘zgarmasa audit yozuvi yaratilmaydi', async () => {
    const { service, audit } = makeService();

    await service.update(ACTOR, { shopName: 'HisobAI' }, preconditionFor(UPDATED_AT), null);

    expect(audit.record).not.toHaveBeenCalled();
  });

  it('`API.md` §8 — eskirgan token bilan yozuv rad etiladi', async () => {
    const { service, current } = makeService();
    const stale = new Date(UPDATED_AT.getTime() - 5000);

    try {
      await service.update(ACTOR, { shopName: 'Boshqa nom' }, preconditionFor(stale), null);
      expect.unreachable('konflikt kutilgan edi');
    } catch (error) {
      const exception = error as AppException;
      expect(exception.code).toBe(ErrorCode.STALE_RESOURCE);
      expect(exception.details).toEqual({
        expectedUpdatedAt: stale.toISOString(),
        actualUpdatedAt: UPDATED_AT.toISOString(),
      });
    }

    // Eng muhimi: yozuv o'zgarmadi
    expect(current().shopName).toBe('HisobAI');
  });

  it('to‘g‘ri token bilan yozuv o‘tadi va `updatedAt` oldinga siljiydi', async () => {
    const { service } = makeService();

    const saved = await service.update(
      ACTOR,
      { shopName: 'Yangi do‘kon' },
      preconditionFor(UPDATED_AT),
      null,
    );

    expect(saved.shopName).toBe('Yangi do‘kon');
    expect(new Date(saved.updatedAt).getTime()).toBeGreaterThan(UPDATED_AT.getTime());
    expect(saved.updatedById).toBe(ACTOR.id);
  });

  it('ketma-ket ikkinchi yozuv eski token bilan o‘tmaydi', async () => {
    const { service } = makeService();
    const precondition = preconditionFor(UPDATED_AT);

    await service.update(ACTOR, { shopName: 'Birinchi' }, precondition, null);

    // O'sha tokenni qayta ishlatish — "ikki qurilma" holatining aynan o'zi
    await expect(
      service.update(ACTOR, { shopName: 'Ikkinchi' }, precondition, null),
    ).rejects.toThrow(AppException);
  });
});
