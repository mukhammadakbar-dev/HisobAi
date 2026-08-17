import type { FileDto } from '@hisobai/contracts';
import type { FileAsset } from '@prisma/client';

/** `storageKey` ataylab javobga chiqmaydi (`API.md` §7). */
export function toFileDto(row: FileAsset): FileDto {
  return {
    id: row.id,
    kind: row.kind,
    originalName: row.originalName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt.toISOString(),
  };
}
