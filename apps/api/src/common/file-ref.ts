import { ErrorCode, type FileKind } from '@hisobai/contracts';
import type { Prisma } from '@prisma/client';

import { AppException } from './app.exception';
import type { PrismaService } from '../database/prisma.service';

/** `tx.fileAsset` yoki `this.prisma.fileAsset` — ikkalasi ham shu shaklga mos. */
type FileLookupClient = Prisma.TransactionClient | PrismaService;

/**
 * Mavjud faylni biriktirishdan oldingi tekshiruv — 10-bosqich C qismi
 * (§15.6, §18.1, §19.2, §19.7, §20.9): fayl joriy Shop'ga tegishli VA
 * kerakli `kind`ga mos kelishi shart.
 *
 * `findFirst({ where: { id } })` — `shopId` qo'lda yozilmaydi (§21.7):
 * `FileAsset` shop-scoped model, RLS/extension so'rovni joriy Shop bilan
 * avtomatik cheklaydi. Boshqa Shop'ning fayli shu sabab shunchaki
 * "topilmadi" bo'lib ko'rinadi — natija qasddan noto'g'ri `kind` bilan
 * BIR XIL emas: ikkalasi alohida ushlanadi, chunki ikkinchisi client
 * xatosi (422, maydonga bog'langan), birinchisi esa "boshqa Shop
 * urinishi" (404, 403 emas — Cross-Shop miss falsafasi, `API.md`).
 */
export async function requireFileRef(
  client: FileLookupClient,
  fileId: string,
  kind: FileKind,
  notFoundMessage: string,
): Promise<void> {
  const file = await client.fileAsset.findFirst({
    where: { id: fileId },
    select: { kind: true },
  });
  if (!file) throw AppException.notFound(ErrorCode.NOT_FOUND, notFoundMessage);

  if (file.kind !== kind) {
    throw AppException.badRequest(
      ErrorCode.VALIDATION_FAILED,
      "Fayl turi bu maydon uchun mos emas.",
      'fileId',
    );
  }
}
