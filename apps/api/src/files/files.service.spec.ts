import { ErrorCode, FileKind, UserRole } from '@hisobai/contracts';
import type { FileAsset } from '@prisma/client';
import sharp from 'sharp';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { AppException } from '../common/app.exception';
import type { RequestUser } from '../common/request-user';
import { FilesService } from './files.service';

/**
 * Jimgina buziladigan xulqlar:
 *
 *  - magic-byte e'lon qilingan `Content-Type`ga mos kelmasa, fayl
 *    qalbaki formatda yashiringan bo'lishi mumkin (§7);
 *  - `PASSPORT` havolasi audit'ga tushmasa, §6.7 kuzatuvsiz qoladi;
 *  - `storageKey` javobga chiqsa, ichki joylashuv sizib chiqadi (§7).
 */

const ACTOR: RequestUser = {
  id: 'user-1',
  email: 'a@a.uz',
  displayName: 'Admin',
  role: UserRole.SHOP_ADMIN,
  theme: 'SYSTEM' as RequestUser['theme'],
  sessionId: 'sess-1',
  shopId: 'shop-1',
};

let jpegBuffer: Buffer;
let pngBuffer: Buffer;

beforeAll(async () => {
  jpegBuffer = await sharp({ create: { width: 2, height: 2, channels: 3, background: '#fff' } })
    .jpeg()
    .toBuffer();
  pngBuffer = await sharp({
    create: { width: 2, height: 2, channels: 3, background: '#fff' },
  })
    .png()
    .toBuffer();
});

function multerFile(over: Partial<Express.Multer.File> & { buffer: Buffer }): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'rasm.jpg',
    encoding: '7bit',
    mimetype: 'image/jpeg',
    size: over.buffer.length,
    stream: undefined as unknown as Express.Multer.File['stream'],
    destination: '',
    filename: '',
    path: '',
    ...over,
  };
}

function makeService(rows: FileAsset[] = []) {
  const store = new Map(rows.map((row) => [row.id, row]));
  let created: Record<string, unknown> | undefined;

  const prisma = {
    fileAsset: {
      create: ({ data }: { data: Record<string, unknown> }) => {
        created = data;
        const row = { id: 'file-1', createdAt: new Date('2026-08-17T00:00:00.000Z'), ...data };
        return Promise.resolve(row as unknown as FileAsset);
      },
      findFirst: ({ where }: { where: { id: string } }) =>
        Promise.resolve(store.get(where.id) ?? null),
    },
  };

  const storage = {
    put: vi.fn(() => Promise.resolve()),
    getSignedUrl: vi.fn(() => Promise.resolve('https://storage.example/signed')),
    delete: vi.fn(() => Promise.resolve()),
    healthCheck: vi.fn(() => Promise.resolve(true)),
  };

  const audit = { record: vi.fn(), recordDetached: vi.fn(() => Promise.resolve()) };

  const config = {
    get: (key: string) => {
      if (key === 'MAX_UPLOAD_MB') return 10;
      if (key === 'STORAGE_URL_TTL_MINUTES') return 15;
      throw new Error(`unexpected config key: ${key}`);
    },
  };

  const service = new FilesService(
    prisma as never,
    storage as never,
    audit as never,
    config as never,
  );
  return { service, storage, audit, getCreated: () => created };
}

describe('FilesService.upload', () => {
  it("hajm limitidan katta faylni FILE_TOO_LARGE bilan rad etadi", async () => {
    const { service } = makeService();
    const oversized = multerFile({ buffer: jpegBuffer, size: 11 * 1024 * 1024 });

    await expect(service.upload(oversized, FileKind.RECEIPT, ACTOR, null)).rejects.toMatchObject({
      code: ErrorCode.FILE_TOO_LARGE,
    });
  });

  it("oq ro'yxatda yo'q MIME'ni rad etadi", async () => {
    const { service } = makeService();
    const file = multerFile({ buffer: jpegBuffer, mimetype: 'text/html' });

    await expect(service.upload(file, FileKind.RECEIPT, ACTOR, null)).rejects.toMatchObject({
      code: ErrorCode.FILE_TYPE_NOT_ALLOWED,
    });
  });

  it("e'lon qilingan MIME fayl imzosiga mos kelmasa rad etadi", async () => {
    const { service } = makeService();
    // `Content-Type: image/jpeg`, lekin bayt imzosi PNG — qalbaki e'lon.
    const file = multerFile({ buffer: pngBuffer, mimetype: 'image/jpeg' });

    await expect(service.upload(file, FileKind.RECEIPT, ACTOR, null)).rejects.toMatchObject({
      code: ErrorCode.FILE_TYPE_NOT_ALLOWED,
    });
  });

  it('muvaffaqiyatli yuklashda storageKey javobda chiqmaydi', async () => {
    const { service, storage, getCreated } = makeService();
    const file = multerFile({ buffer: jpegBuffer });

    const dto = await service.upload(file, FileKind.RECEIPT, ACTOR, '1.2.3.4');

    expect(dto).not.toHaveProperty('storageKey');
    expect(dto.kind).toBe(FileKind.RECEIPT);
    expect(storage.put).toHaveBeenCalledTimes(1);

    const key = getCreated()?.storageKey as string;
    expect(key.startsWith(`${ACTOR.shopId}/${FileKind.RECEIPT}/`)).toBe(true);
    expect(key.endsWith('.jpg')).toBe(true);
  });
});

describe('FilesService.getDownloadUrl', () => {
  const baseRow: FileAsset = {
    id: 'file-1',
    shopId: 'shop-1',
    storageKey: 'shop-1/RECEIPT/uuid.jpg',
    originalName: 'chek.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 100,
    kind: FileKind.RECEIPT,
    uploadedById: 'user-1',
    createdAt: new Date('2026-08-17T00:00:00.000Z'),
  };

  it("mavjud bo'lmagan faylni 404 bilan rad etadi (Cross-Shop bilan bir xil)", async () => {
    const { service } = makeService([]);
    await expect(service.getDownloadUrl('missing', ACTOR, null)).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it('PASSPORT havolasi berilganda audit yoziladi, RECEIPT esa yozmaydi', async () => {
    const passportRow = { ...baseRow, id: 'file-2', kind: FileKind.PASSPORT };
    const { service, audit } = makeService([baseRow, passportRow]);

    await service.getDownloadUrl('file-1', ACTOR, null);
    expect(audit.recordDetached).not.toHaveBeenCalled();

    await service.getDownloadUrl('file-2', ACTOR, null);
    expect(audit.recordDetached).toHaveBeenCalledWith(
      ACTOR.shopId,
      expect.objectContaining({ action: 'FILE_PASSPORT_ACCESSED', entityId: 'file-2' }),
    );
  });

  it('PASSPORT uchun 5 daqiqa, boshqasi uchun 15 daqiqa TTL beriladi', async () => {
    const passportRow = { ...baseRow, id: 'file-2', kind: FileKind.PASSPORT };
    const { service, storage } = makeService([baseRow, passportRow]);

    await service.getDownloadUrl('file-1', ACTOR, null);
    expect(storage.getSignedUrl).toHaveBeenLastCalledWith(
      baseRow.storageKey,
      15 * 60,
      expect.anything(),
    );

    await service.getDownloadUrl('file-2', ACTOR, null);
    expect(storage.getSignedUrl).toHaveBeenLastCalledWith(
      passportRow.storageKey,
      5 * 60,
      expect.anything(),
    );
  });
});
