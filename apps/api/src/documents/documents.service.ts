import { createHash, randomUUID } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ContractStatus,
  DocumentType,
  ErrorCode,
  FileKind,
  type DocumentGenerateDto,
  type DocumentVersionDto,
} from '@hisobai/contracts';

import { AuditService } from '../audit/audit.service';
import { AppException } from '../common/app.exception';
import { businessDay } from '../common/dates';
import { isUniqueViolation } from '../common/prisma-errors';
import type { RequestUser } from '../common/request-user';
import type { Env } from '../config/env';
import { PrismaService } from '../database/prisma.service';
import { requireShopId } from '../database/shop-context';
import { StorageProvider } from '../storage/storage.provider';
import {
  CONTRACT_PDF_INCLUDE,
  toGenerateDto,
  toPdfData,
  toVersionDto,
  type ContractPdfRow,
} from './documents.mappers';
import { buildContractPdf } from './pdf/contract-pdf.builder';

/**
 * Shartnoma hujjatlari — nasiya PDF'i (§15, §16.10).
 *
 * **PDF generatsiyasi va MinIO yozuvi savdo tasdiqlash tranzaksiyasi bilan
 * hech qanday aloqasi yo'q** — bu butunlay alohida, keyinroq bosiladigan
 * endpoint. `buildContractPdf` (CPU) va `storage.put` (tashqi I/O)
 * ATAYLAB `$transaction` TASHQARISIDA: ular sekin, DB qulfini
 * ushlab turishi mumkin edi (`ARCHITECTURE.md` §23.13 bilan bir mantiq —
 * tranzaksiya ichida faqat qisqa, ishonchli yozuvlar).
 */
@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageProvider,
    private readonly audit: AuditService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get timeZone(): string {
    return this.config.get('TIMEZONE', { infer: true });
  }

  /**
   * PDF yaratadi va versiyalaydi (§15.2, §15.3).
   *
   * **Dedup:** PDF avval to'liq quriladi va hash'i hisoblanadi — faqat
   * shundan keyin oxirgi versiya bilan solishtiriladi. Boshqacha bo'lsa
   * (masalan hashni oldindan taxmin qilish) mazmun o'zgarganini
   * bilmasdan turib qaror qabul qilingan bo'lardi. Hash mos kelsa —
   * MinIO'ga yozilmaydi, yangi `Document` qatori ochilmaydi, mavjudi
   * qaytariladi.
   */
  async generate(
    contractId: string,
    actor: RequestUser,
    ip: string | null,
  ): Promise<DocumentGenerateDto> {
    const contract = await this.prisma.installmentContract.findUnique({
      where: { id: contractId },
      include: CONTRACT_PDF_INCLUDE,
    });
    if (!contract) throw contractNotFound();
    assertGenerable(contract);

    // `Shop` — tenant chegarasining o'zi, RLS avtomatik filtrlamaydi
    // (`shops.service.ts`dagi bilan bir xil naqsh, §21.7).
    const shop = await this.prisma.shop.findUniqueOrThrow({ where: { id: requireShopId() } });

    // Shartnoma sanasi — `contract.createdAt`, generatsiya vaqti EMAS
    // (`contract-pdf.builder.ts`dagi izoh): aks holda hash hech qachon
    // barqaror bo'lmasdi.
    const contractDate = businessDay(contract.createdAt, this.timeZone);
    const pdfData = toPdfData(
      { name: shop.name, address: shop.address, phone: shop.phone },
      contract,
      contractDate,
    );
    const buffer = await buildContractPdf(pdfData);
    const contentHash = createHash('sha256').update(buffer).digest('hex');

    const latest = await this.prisma.document.findFirst({
      where: { contractId: contract.id },
      orderBy: { version: 'desc' },
    });
    if (latest && latest.contentHash === contentHash) {
      return toGenerateDto(latest);
    }

    const key = `${actor.shopId}/${FileKind.CONTRACT_PDF}/${randomUUID()}.pdf`;
    await this.storage.put(key, buffer, 'application/pdf');

    const nextVersion = (latest?.version ?? 0) + 1;
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        const file = await tx.fileAsset.create({
          data: {
            storageKey: key,
            originalName: `shartnoma-${contract.sale.number ?? contract.id}.pdf`,
            mimeType: 'application/pdf',
            sizeBytes: buffer.length,
            kind: FileKind.CONTRACT_PDF,
            uploadedById: actor.id,
          },
        });
        const doc = await tx.document.create({
          data: {
            type: DocumentType.INSTALLMENT_CONTRACT,
            contractId: contract.id,
            version: nextVersion,
            fileId: file.id,
            contentHash,
          },
        });

        await this.audit.record(tx, actor.shopId, {
          actorId: actor.id,
          action: 'DOCUMENT_GENERATED',
          entityType: 'Document',
          entityId: doc.id,
          after: { contractId: contract.id, version: nextVersion, fileId: file.id },
          ip,
        });

        return doc;
      });
      return toGenerateDto(created);
    } catch (error) {
      // `@@unique([contractId, version])` — ikkita parallel so'rov bir xil
      // "keyingi versiya"ni hisoblab qolishi mumkin (kam uchraydigan poyga,
      // bitta shartnoma uchun odatda bitta admin ishlaydi). Xato ravon:
      // ega qayta bossa, ikkinchi urinishda `latest` allaqachon yangilangan
      // bo'ladi.
      if (isUniqueViolation(error)) {
        throw AppException.conflict(
          ErrorCode.STALE_RESOURCE,
          'Hujjat parallel so‘rov bilan yaratildi — birozdan so‘ng qayta urinib ko‘ring.',
        );
      }
      throw error;
    }
  }

  /** Versiyalar ro'yxati — yangisidan eskisiga (§15.3). */
  async listVersions(contractId: string): Promise<DocumentVersionDto[]> {
    const contract = await this.prisma.installmentContract.findUnique({
      where: { id: contractId },
      select: { id: true },
    });
    if (!contract) throw contractNotFound();

    const docs = await this.prisma.document.findMany({
      where: { contractId },
      orderBy: { version: 'desc' },
    });
    return docs.map(toVersionDto);
  }
}

/** Bekor qilingan shartnomaga yangi hujjat yaratilmaydi. */
function assertGenerable(contract: ContractPdfRow): void {
  if (contract.status === ContractStatus.CANCELLED) {
    throw AppException.conflict(
      ErrorCode.INSTALLMENT_CONTRACT_NOT_ACTIVE,
      'Bekor qilingan shartnoma uchun hujjat yaratilmaydi.',
      { status: contract.status },
    );
  }
}

function contractNotFound(): AppException {
  return AppException.notFound(ErrorCode.NOT_FOUND, 'Shartnoma topilmadi.');
}
