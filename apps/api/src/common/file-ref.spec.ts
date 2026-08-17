import { FileKind } from '@hisobai/contracts';
import { describe, expect, it } from 'vitest';

import { AppException } from './app.exception';
import { requireFileRef } from './file-ref';

/**
 * `requireFileRef` — 5 ta biriktirish nuqtasining (mahsulot rasmi,
 * passport, logotip, kassa ilovasi, chek) umumiy IDOR himoyasi.
 *
 * `findFirst` mock'i shop-scoping'ni RLS o'rniga qo'lda taqlid qiladi:
 * boshqa Shop'ning fayli — `files` xaritasida yo'q, xuddi RLS uni
 * filtrlab tashlagandek.
 */
function fakeClient(files: Record<string, { kind: FileKind }>) {
  return {
    fileAsset: {
      findFirst: ({ where }: { where: { id: string } }) =>
        Promise.resolve(files[where.id] ?? null),
    },
  } as never;
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

describe('requireFileRef', () => {
  it('to‘g‘ri kind — jim o‘tadi', async () => {
    const client = fakeClient({ 'file-1': { kind: FileKind.PRODUCT_IMAGE } });

    await expect(
      requireFileRef(client, 'file-1', FileKind.PRODUCT_IMAGE, 'Topilmadi.'),
    ).resolves.toBeUndefined();
  });

  it('boshqa Shop’ning fayli (RLS uni ko‘rsatmaydi) — 404, 403 emas', async () => {
    const client = fakeClient({});

    const error = await expectAppException(
      requireFileRef(client, 'boshqa-shop-fayli', FileKind.PASSPORT, 'Pasport fayli topilmadi.'),
      'NOT_FOUND',
    );
    expect(error.message).toBe('Pasport fayli topilmadi.');
  });

  it('kind mos kelmasa — VALIDATION_FAILED, maydonga bog‘langan', async () => {
    const client = fakeClient({ 'file-1': { kind: FileKind.RECEIPT } });

    const error = await expectAppException(
      requireFileRef(client, 'file-1', FileKind.PASSPORT, 'Topilmadi.'),
      'VALIDATION_FAILED',
    );
    expect(error.field).toBe('fileId');
  });
});
