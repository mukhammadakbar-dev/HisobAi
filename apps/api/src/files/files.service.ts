import { randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode, FileKind, UserRole } from '@hisobai/contracts';
import type { FileDownloadDto, FileDto } from '@hisobai/contracts';

import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app.exception';
import type { RequestUser } from '../common/request-user';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import type { ResolvedDownload } from '../storage/local-storage.provider';
import { LocalStorageProvider } from '../storage/local-storage.provider';
import { StorageProvider } from '../storage/storage.provider';
import {
  ALLOWED_MIME_TYPES,
  detectMimeType,
  extensionFor,
  sanitizeFilename,
  stripImageMetadata,
} from './file-validation';
import { toFileDto } from './files.mappers';

/** `API.md` §7 — `PASSPORT` uchun 5 daqiqa, qolganlari uchun konfiguratsiyadagi standart (15). */
const PASSPORT_URL_TTL_MINUTES = 5;

/**
 * Fayl yuklash va vaqtinchalik havola (§15, `API.md` §7).
 *
 * `PERMISSIONS.md:80` — `SELLER` faqat `RECEIPT` yuklay oladi, `SHOP_ADMIN`/
 * `MANAGER` to'liq. `UserRole` enum'ida `MANAGER`/`SELLER` hali yo'q
 * (§16.14), shuning uchun bu qoida bu yerda **yozilmaydi**: ishlamaydigan
 * shart "himoya bor" degan yolg'on taassurot qoldirardi. `@Roles(SHOP_ADMIN)`
 * (`files.controller.ts`) hozircha yagona ruxsat qatlami — kind bo'yicha
 * cheklov enum kengaytirilganda shu yerga qo'shiladi.
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageProvider,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * §7 — hajm, MIME oq ro'yxati, magic-byte va EXIF tozalash. Nom
   * saqlashda ishlatilmaydi: `storageKey` UUID asosida.
   */
  async upload(
    file: Express.Multer.File,
    kind: FileKind,
    actor: RequestUser,
    ip: string | null,
  ): Promise<FileDto> {
    const maxBytes = this.config.get('MAX_UPLOAD_MB', { infer: true }) * 1024 * 1024;
    if (file.size > maxBytes) {
      throw AppException.rule(
        ErrorCode.FILE_TOO_LARGE,
        `Fayl hajmi ${String(this.config.get('MAX_UPLOAD_MB', { infer: true }))} MB dan oshmasin.`,
        'file',
      );
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw AppException.rule(
        ErrorCode.FILE_TYPE_NOT_ALLOWED,
        "Ruxsat etilgan format: JPEG, PNG, WEBP yoki PDF.",
        'file',
      );
    }

    // Magic-byte — e'lon qilingan `Content-Type` fayl imzosiga mos
    // kelishi shart (§7): mos kelmasa, kim oshirilgan kengaytma yoki
    // qalbaki `Content-Type` bilan boshqa turdagi fayl yashiringan.
    const detected = detectMimeType(file.buffer);
    if (!detected || detected !== file.mimetype) {
      throw AppException.rule(
        ErrorCode.FILE_TYPE_NOT_ALLOWED,
        "Fayl mazmuni e'lon qilingan formatga mos kelmadi.",
        'file',
      );
    }

    // Konteyner darajasidagi bayt-ba-bayt tozalash (piksel/skan
    // ma'lumotiga tegilmaydi) — buzilgan/kutilmagan tuzilma bo'lsa
    // xato tashlaydi, bu yerda "content mos kelmadi" bilan bir xil
    // xato kodiga tarjima qilinadi.
    let cleanBuffer: Buffer;
    try {
      cleanBuffer = stripImageMetadata(file.buffer, detected);
    } catch {
      throw AppException.rule(
        ErrorCode.FILE_TYPE_NOT_ALLOWED,
        "Fayl tuzilishi buzilgan yoki qo'llab-quvvatlanmaydi.",
        'file',
      );
    }
    const key = `${actor.shopId}/${kind}/${randomUUID()}.${extensionFor(detected)}`;
    await this.storage.put(key, cleanBuffer, detected);

    const created = await this.prisma.fileAsset.create({
      data: {
        storageKey: key,
        originalName: sanitizeFilename(file.originalname),
        mimeType: detected,
        sizeBytes: cleanBuffer.length,
        kind,
        uploadedById: actor.id,
      },
    });

    // O'qish emas, yaratish — tranzaksiyasiz `recordDetached` yetarli
    // (`AuditService` izohi): moliyaviy amal emas, boshqa yozuvga bog'liq
    // emas.
    await this.audit.recordDetached(actor.shopId, {
      actorId: actor.id,
      action: 'FILE_UPLOADED',
      entityType: 'FileAsset',
      entityId: created.id,
      after: { kind: created.kind, mimeType: created.mimeType, sizeBytes: created.sizeBytes },
      ip,
    });

    return toFileDto(created);
  }

  /**
   * §15.5, §7 — vaqtinchalik havola. `PASSPORT` uchun audit yoziladi
   * (§6.7): qiymat emas, faqat fakt — kimdir shu faylga qaraganini
   * bilish kifoya, passport ma'lumoti jurnalda ikkinchi marta saqlanmasin.
   */
  async getDownloadUrl(
    id: string,
    actor: RequestUser,
    ip: string | null,
  ): Promise<FileDownloadDto> {
    const row = await this.prisma.fileAsset.findFirst({ where: { id } });
    if (!row) throw AppException.notFound(ErrorCode.NOT_FOUND, 'Fayl topilmadi.');

    if (row.kind === FileKind.PASSPORT) {
      assertCanAccessPassport(actor);
      await this.audit.recordDetached(actor.shopId, {
        actorId: actor.id,
        action: 'FILE_PASSPORT_ACCESSED',
        entityType: 'FileAsset',
        entityId: row.id,
        ip,
      });
    }

    const ttlMinutes =
      row.kind === FileKind.PASSPORT
        ? PASSPORT_URL_TTL_MINUTES
        : this.config.get('STORAGE_URL_TTL_MINUTES', { infer: true });
    const ttlSeconds = ttlMinutes * 60;

    const url = await this.storage.getSignedUrl(row.storageKey, ttlSeconds, {
      mimeType: row.mimeType,
      downloadName: row.originalName,
    });

    return { url, expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString() };
  }

  /**
   * `GET /files/download/:token` — faqat `local` drayverda ma'noli.
   * `minio` rejimida bu marshrutga hech qachon havola berilmaydi
   * (`getDownloadUrl` to'g'ridan-to'g'ri MinIO URL'ini qaytaradi), shuning
   * uchun bu yerga tushgan so'rov yaroqsiz — `404`.
   */
  async resolveLocalDownload(token: string): Promise<ResolvedDownload | null> {
    if (!(this.storage instanceof LocalStorageProvider)) return null;
    return this.storage.resolveDownload(token);
  }
}

/** `PERMISSIONS.md:92` P5 — `PASSPORT` faqat `SHOP_ADMIN`. */
function assertCanAccessPassport(actor: RequestUser): void {
  if (actor.role !== UserRole.SHOP_ADMIN) {
    throw AppException.forbidden(
      ErrorCode.FORBIDDEN,
      "Pasport faylini faqat administrator ko'ra oladi.",
    );
  }
}
