'use client';

import { ContractStatus } from '@hisobai/contracts';
import type { InstallmentContractDto } from '@hisobai/contracts';
import { Download, FileText } from 'lucide-react';
import { useState } from 'react';

import { ErrorState, TableSkeleton } from '../../../components/states';
import { Badge, Button, Card } from '../../../components/ui';
import { formatDateTime } from '../../../lib/format';
import { FormError } from '../../auth/components/form-error';
import { filesApi, useContractDocuments, useGenerateContractPdf } from '../queries';

/**
 * Nasiya shartnomasi PDF hujjatlari va versiyalari (§15, §16.10).
 *
 * - PDF yaratish: Mavjud shartnoma snapshot'idan serverda PDF yig'iladi (§15.1).
 *   Bekor qilingan (`CANCELLED`) shartnomada yangi PDF yaratish taqiqlanadi.
 *   Mazmun o'zgarmagan bo'lsa (sha256 mos kelsa), server yangi versiya ochmaydi (§15.2).
 * - Yuklab olish: `GET /files/:fileId` orqali 15 daqiqalik vaqtinchalik havola
 *   olinadi va yangi oynada ochiladi (§15.5, `API.md` §7).
 */
export function ContractDocuments({ contract }: { contract: InstallmentContractDto }) {
  const documents = useContractDocuments(contract.id);
  const generatePdf = useGenerateContractPdf(contract.id);

  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const isCancelled = contract.status === ContractStatus.CANCELLED;

  const handleDownload = async (fileId: string): Promise<void> => {
    try {
      setDownloadError(null);
      setDownloadingFileId(fileId);
      const res = await filesApi.getDownloadUrl(fileId);
      if (res?.url) {
        window.open(res.url, '_blank', 'noopener,noreferrer');
      } else {
        setDownloadError('Yuklab olish havolasini olib bo‘lmadi.');
      }
    } catch {
      setDownloadError('Faylni yuklab olishda xatolik yuz berdi. Qayta urinib ko‘ring.');
    } finally {
      setDownloadingFileId(null);
    }
  };

  const handleGenerate = (): void => {
    setDownloadError(null);
    generatePdf.mutate();
  };

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-text-secondary" aria-hidden="true" />
          <h2 className="m-0 text-lg font-semibold">Shartnoma PDF</h2>
        </div>

        <Button
          type="button"
          variant="secondary"
          disabled={isCancelled || generatePdf.isPending}
          onClick={handleGenerate}
        >
          {generatePdf.isPending ? 'Yaratilmoqda…' : 'PDF yaratish'}
        </Button>
      </div>

      {isCancelled && (
        <p className="m-0 text-sm text-text-secondary">
          Bekor qilingan shartnoma uchun yangi PDF yaratib bo‘lmaydi.
        </p>
      )}

      <FormError error={generatePdf.error} />

      {downloadError && (
        <p
          role="alert"
          className="m-0 rounded-md bg-danger-bg px-3 py-2 text-sm font-medium text-danger"
        >
          {downloadError}
        </p>
      )}

      {documents.isPending ? (
        <TableSkeleton rows={2} />
      ) : documents.isError ? (
        <ErrorState
          error={documents.error}
          onRetry={() => {
            void documents.refetch();
          }}
        />
      ) : documents.data.length === 0 ? (
        <div className="rounded-md border border-dashed border-border-default p-4 text-center text-sm text-text-secondary">
          Hozircha PDF hujjat yaratilmagan. Yuqoridagi &ldquo;PDF yaratish&rdquo; tugmasini bosib
          shartnoma faylini shakllantiring.
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {documents.data.map((doc, index) => {
            const isDownloading = downloadingFileId === doc.fileId;
            const isLatest = index === 0;

            return (
              <li
                key={doc.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-default bg-surface-card p-3"
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="font-semibold text-text-primary">Versiya {doc.version}</span>
                  {isLatest && <Badge tone="info">So‘nggi</Badge>}
                  <span className="text-sm text-text-secondary">
                    {formatDateTime(doc.createdAt)}
                  </span>
                  {doc.contentHash && (
                    <span
                      className="hidden font-mono text-xs text-text-tertiary sm:inline"
                      title={doc.contentHash}
                    >
                      sha256:{doc.contentHash.slice(0, 8)}
                    </span>
                  )}
                </div>

                <Button
                  type="button"
                  variant="secondary"
                  disabled={isDownloading}
                  onClick={() => void handleDownload(doc.fileId)}
                  className="flex items-center gap-1.5 py-1.5 text-sm"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  {isDownloading ? 'Yuklanmoqda…' : 'Yuklab olish'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
