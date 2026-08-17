'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { Upload, Loader2 } from 'lucide-react';
import type { FileKind } from '@hisobai/contracts';

import { useUploadFile } from '../../features/files/queries';
import { errorMessage } from '../../lib/messages';
import { Button } from '../ui';
import { FilePreview } from './file-preview';

/** Maksimal fayl hajmi: 10 MB (`API.md` §7, §15). */
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

export interface FileUploadProps {
  kind: FileKind;
  onUploaded: (fileId: string) => void;
  accept?: string;
  label?: string;
  existingFileId?: string | null;
  className?: string;
}

/**
 * Umumiy fayl yuklash komponenti (`FRONTEND.md` §7, `API.md` §7).
 *
 * - 10 MB hajmni client tomonida tekshiradi;
 * - Tanlangan faylni `FormData` orqali `POST /files` ga yuklaydi;
 * - Muvaffaqiyatli bo'lsa `onUploaded(fileId)` chaqiradi;
 * - Mavjud yoki yuklangan faylni `FilePreview` orqali ko'rsatadi.
 */
export function FileUpload({
  kind,
  onUploaded,
  accept,
  label,
  existingFileId,
  className = '',
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [uploadedFileId, setUploadedFileId] = useState<string | null>(null);

  const uploadMutation = useUploadFile();
  const activeFileId = uploadedFileId ?? existingFileId;

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setClientError('Fayl 10 MB dan katta.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setClientError(null);
    uploadMutation.mutate(
      { file, kind },
      {
        onSuccess: (data) => {
          setUploadedFileId(data.id);
          onUploaded(data.id);
          if (inputRef.current) inputRef.current.value = '';
        },
        onError: (err) => {
          setClientError(errorMessage(err));
          if (inputRef.current) inputRef.current.value = '';
        },
      },
    );
  };

  const handleButtonClick = () => {
    inputRef.current?.click();
  };

  const displayError = clientError ?? (uploadMutation.error ? errorMessage(uploadMutation.error) : null);

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {label && (
        <span className="text-sm font-medium text-text-secondary">
          {label}
        </span>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
        aria-label={label ?? 'Fayl tanlash'}
        disabled={uploadMutation.isPending}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={handleButtonClick}
          disabled={uploadMutation.isPending}
          className="gap-2"
        >
          {uploadMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Yuklanmoqda...</span>
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" aria-hidden="true" />
              <span>{activeFileId ? 'Faylni almashtirish' : 'Fayl tanlash'}</span>
            </>
          )}
        </Button>

        <span className="text-xs text-text-tertiary">
          Maksimal hajm: 10 MB
        </span>
      </div>

      {displayError && (
        <p className="m-0 text-sm text-danger" role="alert">
          {displayError}
        </p>
      )}

      {activeFileId && !uploadMutation.isPending && (
        <div className="mt-1">
          <FilePreview fileId={activeFileId} alt={label ?? 'Fayl'} />
        </div>
      )}
    </div>
  );
}
