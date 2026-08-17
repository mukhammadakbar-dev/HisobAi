import { ErrorCode, FileKind, UserRole } from '@hisobai/contracts';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

import type { AuditEntry } from '../audit/audit.service';
import { AppException } from '../common/app.exception';
import { readPrecondition } from '../common/optimistic-lock';
import type { RequestUser } from '../common/request-user';
import { CustomersService } from './customers.service';

/**
 * Mijoz servisining jimgina buziladigan xulqlari:
 *
 *  - §6.3 dublikat javobida **kimda** ekani aytilmasa, ega raqamni
 *    qidirib yurishga majbur bo'ladi;
 *  - §6.9 belgi olib tashlanganda sabab qolib ketsa, belgi qayta
 *    qo'yilganda eskirgan sabab qaytib chiqadi;
 *  - telefon bo'yicha qidiruvda ajratgichlar tozalanmasa, u **hech
 *    qachon** ishlamaydi (bazada E.164, formada "90 123 45 67");
 *  - audit'ga passport raqamlari tushsa, jurnal shaxsga doir
 *    ma'lumotning ikkinchi nusxasiga aylanadi.
 */

const ACTOR = { id: 'user-1', role: UserRole.SHOP_ADMIN } as RequestUser;
/** Kelajakdagi rol: `UserRole` da hali yo'q, lekin qulf hozirdan ishlashi kerak. */
const SELLER = { id: 'user-2', role: 'SELLER' } as unknown as RequestUser;
const UPDATED_AT = new Date('2026-08-11T09:30:00.123Z');

interface Row {
  id: string;
  fullName: string;
  phonePrimary: string;
  phoneSecondary: string | null;
  address: string | null;
  note: string | null;
  passportSeries: string | null;
  passportNumber: string | null;
  pinfl: string | null;
  passportFileId: string | null;
  isFlagged: boolean;
  flagReason: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

function customer(
  over: Partial<Row> & { id: string; fullName: string; phonePrimary: string },
): Row {
  return {
    phoneSecondary: null,
    address: null,
    note: null,
    passportSeries: null,
    passportNumber: null,
    pinfl: null,
    passportFileId: null,
    isFlagged: false,
    flagReason: null,
    isActive: true,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: UPDATED_AT,
    ...over,
  };
}

function makeService(rows: Row[] = [], files: Record<string, { kind: string }> = {}) {
  const store = new Map(rows.map((row) => [row.id, row]));
  const audit = {
    record: vi.fn((_tx: unknown, _shopId: string | null, _entry: AuditEntry) => Promise.resolve()),
    recordDetached: vi.fn((_shopId: string | null, _entry: AuditEntry) => Promise.resolve()),
  };
  const queries: Prisma.CustomerWhereInput[] = [];

  const delegate = {
    findMany: ({ where, take }: { where?: Prisma.CustomerWhereInput; take?: number }) => {
      queries.push(where ?? {});
      return Promise.resolve([...store.values()].slice(0, take));
    },
    findUnique: ({ where }: { where: { id?: string; phonePrimary?: string } }) => {
      const found = where.id
        ? store.get(where.id)
        : [...store.values()].find((row) => row.phonePrimary === where.phonePrimary);
      return Promise.resolve(found ?? null);
    },
    // `phoneTaken()` endi `findFirst` ishlatadi (§14.5 — unique
    // `(shopId, phonePrimary)`ga o'tgach, `findUnique` shopId'ni ham
    // talab qiladi — buni qo'lda yozish §21.7 ni buzardi).
    findFirst: ({ where }: { where: { phonePrimary?: string } }) => {
      const found = [...store.values()].find((row) => row.phonePrimary === where.phonePrimary);
      return Promise.resolve(found ?? null);
    },
    create: ({ data }: { data: Partial<Row> }) => {
      if ([...store.values()].some((row) => row.phonePrimary === data.phonePrimary)) {
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError('duplicate', {
            code: 'P2002',
            clientVersion: 'test',
          }),
        );
      }
      const created = customer({
        id: `customer-${String(store.size + 1)}`,
        fullName: '',
        phonePrimary: '',
        ...data,
      });
      store.set(created.id, created);
      return Promise.resolve(created);
    },
    update: ({
      where,
      data,
    }: {
      where: { id: string; updatedAt?: Date | { lte: Date } };
      data: Partial<Row>;
    }) => {
      const current = store.get(where.id);
      if (!current) {
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError('yo‘q', {
            code: 'P2025',
            clientVersion: 'test',
          }),
        );
      }
      if (
        where.updatedAt instanceof Date &&
        where.updatedAt.getTime() !== current.updatedAt.getTime()
      ) {
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError('eskirgan', {
            code: 'P2025',
            clientVersion: 'test',
          }),
        );
      }
      if (
        data.phonePrimary &&
        [...store.values()].some(
          (row) => row.id !== where.id && row.phonePrimary === data.phonePrimary,
        )
      ) {
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError('duplicate', {
            code: 'P2002',
            clientVersion: 'test',
          }),
        );
      }
      const updated = {
        ...current,
        ...data,
        updatedAt: new Date(current.updatedAt.getTime() + 1000),
      };
      store.set(updated.id, updated);
      return Promise.resolve(updated);
    },
  };

  // §19.2 — boshqa Shop'ning fayli xaritada yo'q, xuddi RLS uni
  // filtrlab tashlagandek (`common/file-ref.spec.ts` asosiy tekshiruv).
  const fileAsset = {
    findFirst: ({ where }: { where: { id: string } }) =>
      Promise.resolve(files[where.id] ?? null),
  };

  const prisma = {
    customer: delegate,
    fileAsset,
    $transaction: <T>(
      fn: (tx: { customer: typeof delegate; fileAsset: typeof fileAsset }) => Promise<T>,
    ) => fn({ customer: delegate, fileAsset }),
  };

  const service = new CustomersService(prisma as never, audit as never);
  return { service, store, audit, queries };
}

function precondition(expected: Date = UPDATED_AT) {
  return readPrecondition({ headers: {} } as Request, expected.toISOString());
}

async function expectAppException(promise: Promise<unknown>, code: string): Promise<AppException> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(AppException);
  const app = error as AppException;
  expect(app.code).toBe(code);
  return app;
}

const CREATE_INPUT = {
  fullName: 'Alisher Karimov',
  phonePrimary: '+998901234567',
  phoneSecondary: null,
  address: null,
  note: null,
  passportSeries: null,
  passportNumber: null,
  pinfl: null,
};

describe('CustomersService', () => {
  describe('yaratish', () => {
    it('mijozni saqlaydi va audit yozadi', async () => {
      const { service, audit } = makeService();

      const created = await service.create(CREATE_INPUT, ACTOR, null);

      expect(created.fullName).toBe('Alisher Karimov');
      expect(created.phonePrimary).toBe('+998901234567');
      expect(audit.recordDetached).toHaveBeenCalledOnce();
    });

    it('§6.3 — dublikat javobida mijozning nomi bo‘ladi', async () => {
      const { service } = makeService([
        customer({ id: 'c-1', fullName: 'Alisher Karimov', phonePrimary: '+998901234567' }),
      ]);

      const error = await expectAppException(
        service.create({ ...CREATE_INPUT, fullName: 'Boshqa odam' }, ACTOR, null),
        ErrorCode.CUSTOMER_PHONE_TAKEN,
      );

      expect(error.userMessage).toContain('Alisher Karimov');
      expect(error.details).toMatchObject({ existingId: 'c-1', isActive: true });
    });

    it('arxivdagi mijoz ham raqamni band qilib turadi', async () => {
      const { service } = makeService([
        customer({
          id: 'c-1',
          fullName: 'Eski mijoz',
          phonePrimary: '+998901234567',
          isActive: false,
        }),
      ]);

      const error = await expectAppException(
        service.create(CREATE_INPUT, ACTOR, null),
        ErrorCode.CUSTOMER_PHONE_TAKEN,
      );

      // UI arxivdagi yozuvni tiklashni taklif qila oladi
      expect(error.details).toMatchObject({ isActive: false });
    });

    it('passport raqamlari audit jurnaliga tushmaydi', async () => {
      const { service, audit } = makeService();

      // Qiymatlar ataylab telefon raqamiga o'xshamaydi — aks holda test
      // passport emas, telefondagi bo'lakni topib, yolg'on o'tib ketardi
      await service.create(
        {
          ...CREATE_INPUT,
          passportSeries: 'AA',
          passportNumber: '7654321',
          pinfl: '99887766554433',
        },
        ACTOR,
        null,
      );

      const entry = audit.recordDetached.mock.calls[0]?.[1];
      const after = JSON.stringify(entry?.after);
      expect(after).not.toContain('7654321');
      expect(after).not.toContain('99887766554433');
      // Fakt sifatida qoladi — nima o'zgargani ko'rinib tursin
      expect(after).toContain('hasPassport');
    });
  });

  describe('tahrirlash', () => {
    it('§6.9 — belgi olib tashlanganda sabab ham tozalanadi', async () => {
      const { service, store } = makeService([
        customer({
          id: 'c-1',
          fullName: 'Alisher Karimov',
          phonePrimary: '+998901234567',
          isFlagged: true,
          flagReason: "To'lovni kechiktiradi",
        }),
      ]);

      const updated = await service.update(
        'c-1',
        { isFlagged: false },
        precondition(),
        ACTOR,
        null,
      );

      expect(updated.isFlagged).toBe(false);
      expect(updated.flagReason).toBeNull();
      expect(store.get('c-1')?.flagReason).toBeNull();
    });

    it('sabab bilan belgilaydi', async () => {
      const { service } = makeService([
        customer({ id: 'c-1', fullName: 'Alisher Karimov', phonePrimary: '+998901234567' }),
      ]);

      const updated = await service.update(
        'c-1',
        { isFlagged: true, flagReason: 'Ikki marta qaytargan' },
        precondition(),
        ACTOR,
        null,
      );

      expect(updated).toMatchObject({ isFlagged: true, flagReason: 'Ikki marta qaytargan' });
    });

    it('§6.13 — arxivlanadi, o‘chirilmaydi', async () => {
      const { service, store } = makeService([
        customer({ id: 'c-1', fullName: 'Alisher Karimov', phonePrimary: '+998901234567' }),
      ]);

      const updated = await service.update('c-1', { isActive: false }, precondition(), ACTOR, null);

      expect(updated.isActive).toBe(false);
      expect(store.has('c-1')).toBe(true);
    });

    it('boshqa mijozning raqamiga o‘tkazib bo‘lmaydi', async () => {
      const { service } = makeService([
        customer({ id: 'c-1', fullName: 'Alisher Karimov', phonePrimary: '+998901234567' }),
        customer({ id: 'c-2', fullName: 'Bobur Aliyev', phonePrimary: '+998911112233' }),
      ]);

      await expectAppException(
        service.update('c-2', { phonePrimary: '+998901234567' }, precondition(), ACTOR, null),
        ErrorCode.CUSTOMER_PHONE_TAKEN,
      );
    });

    it('eskirgan qulf tokeni — STALE_RESOURCE', async () => {
      const { service } = makeService([
        customer({ id: 'c-1', fullName: 'Alisher Karimov', phonePrimary: '+998901234567' }),
      ]);

      await expectAppException(
        service.update(
          'c-1',
          { address: 'Chilonzor' },
          precondition(new Date('2026-08-01T00:00:00.000Z')),
          ACTOR,
          null,
        ),
        ErrorCode.STALE_RESOURCE,
      );
    });
  });

  describe('passport ko‘rinishi (`PERMISSIONS.md` §1)', () => {
    const WITH_PASSPORT = {
      ...CREATE_INPUT,
      passportSeries: 'AA',
      passportNumber: '7654321',
      pinfl: '99887766554433',
    };

    it('OWNER passportni ko‘radi', async () => {
      const { service } = makeService();

      const created = await service.create(WITH_PASSPORT, ACTOR, null);

      expect(created.passportNumber).toBe('7654321');
    });

    it('boshqa rol javobda passportni olmaydi', async () => {
      const { service } = makeService();
      await service.create(WITH_PASSPORT, ACTOR, null);

      const seen = await service.requireById('customer-1', SELLER);

      expect(seen.passportSeries).toBeNull();
      expect(seen.passportNumber).toBeNull();
      expect(seen.pinfl).toBeNull();
      // Ism va telefon o'z joyida — endpoint yopilmaydi, maydon kesiladi
      expect(seen.fullName).toBe('Alisher Karimov');
    });

    it('ko‘ra olmaydigan rol passportni o‘chira ham olmaydi', async () => {
      const { service, store } = makeService();
      await service.create(WITH_PASSPORT, ACTOR, null);
      const saved = store.get('customer-1');

      // Aynan xavfli holat: forma hamma maydonni yuboradi, ko'rinmagani `null` bo'lib
      await service.update(
        'customer-1',
        { address: 'Chilonzor', passportSeries: null, passportNumber: null, pinfl: null },
        precondition(saved?.updatedAt),
        SELLER,
        null,
      );

      expect(store.get('customer-1')?.passportNumber).toBe('7654321');
      expect(store.get('customer-1')?.address).toBe('Chilonzor');
    });

    // §19.2 — IDOR: boshqa Shop'ning yoki noto'g'ri `kind`dagi faylni
    // pasport sifatida biriktirib bo'lmaydi.
    it('boshqa Shop’ning faylini pasport sifatida biriktirib bo‘lmaydi', async () => {
      const { service } = makeService();

      await expectAppException(
        service.create({ ...CREATE_INPUT, passportFileId: 'boshqa-shop-fayli' }, ACTOR, null),
        ErrorCode.NOT_FOUND,
      );
    });

    it('noto‘g‘ri `kind`dagi faylni pasport sifatida biriktirib bo‘lmaydi', async () => {
      const { service } = makeService([], { 'file-1': { kind: FileKind.PRODUCT_IMAGE } });

      const error = await expectAppException(
        service.create({ ...CREATE_INPUT, passportFileId: 'file-1' }, ACTOR, null),
        ErrorCode.VALIDATION_FAILED,
      );
      expect(error.field).toBe('fileId');
    });

    it('to‘g‘ri `kind`dagi fayl pasport sifatida biriktiriladi va faqat ko‘ra oladigan rolga ko‘rinadi', async () => {
      const { service } = makeService([], { 'file-1': { kind: FileKind.PASSPORT } });

      const created = await service.create(
        { ...CREATE_INPUT, passportFileId: 'file-1' },
        ACTOR,
        null,
      );
      expect(created.passportFileId).toBe('file-1');

      const seen = await service.requireById('customer-1', SELLER);
      expect(seen.passportFileId).toBeNull();
    });

    it('ko‘ra olmaydigan rol pasport faylini ham biriktira olmaydi', async () => {
      const { service, store } = makeService();
      await service.create(WITH_PASSPORT, ACTOR, null);
      const saved = store.get('customer-1');

      await service.update(
        'customer-1',
        { passportFileId: 'boshqa-shop-fayli' },
        precondition(saved?.updatedAt),
        SELLER,
        null,
      );

      // Tekshiruv umuman chaqirilmagan: yozuv jimgina e'tiborsiz qoldirildi
      expect(store.get('customer-1')?.passportFileId).not.toBe('boshqa-shop-fayli');
    });
  });

  describe('qidiruv (§6.4)', () => {
    it('telefondagi ajratgichlar tozalanadi', async () => {
      const { service, queries } = makeService();

      await service.list({ q: '90 123 45 67', isActive: 'active', sort: 'fullName' });

      // Bazada `+998901234567` turadi — ajratgichli qidiruv hech narsa topmasdi
      expect(JSON.stringify(queries[0])).toContain('901234567');
    });

    it('qisqa matnda telefon sharti qo‘shilmaydi', async () => {
      const { service, queries } = makeService();

      await service.list({ q: 'Al', isActive: 'active', sort: 'fullName' });

      const where = JSON.stringify(queries[0]);
      expect(where).toContain('fullName');
      expect(where).not.toContain('phonePrimary');
    });

    it('arxiv filtri qo‘llanadi', async () => {
      const { service, queries } = makeService();

      await service.list({ isActive: 'archived', sort: 'fullName' });

      expect(queries[0]).toMatchObject({ isActive: false });
    });
  });
});
