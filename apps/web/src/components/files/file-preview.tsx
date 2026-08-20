'use client';

import { AlertCircle, FileText } from 'lucide-react';
import { useFileUrl } from '../../features/files/queries';
import { errorMessage } from '../../lib/messages';
import { Skeleton } from '../states';

export interface FilePreviewProps {
  fileId: string;
  alt?: string;
  className?: string;
}

/**
 * Faylni ko'rish komponenti (`FRONTEND.md` §7, `design.md` §5).
 *
 * `useFileUrl(fileId)` orqali vaqtinchalik havolani oladi. Rasm `<img>`
 * bilan chiziladi, rasm bo'lmagan fayl (§15.7 oq ro'yxatida `application/pdf`
 * ham bor) esa ochish havolasi bilan — aks holda PDF o'rniga buzuq rasm
 * ko'rinardi. Loading holatida Skeleton, xatolikda esa xabar ko'rsatiladi.
 */
export function FilePreview({
  fileId,
  alt = 'Biriktirilgan fayl',
  className = '',
}: FilePreviewProps) {
  const { data, isLoading, isError, error } = useFileUrl(fileId);

  if (isLoading) {
    return (
      <div
        className={`relative flex min-h-24 w-full items-center justify-center overflow-hidden rounded-md border border-border-default bg-surface-raised ${className}`}
        role="status"
        aria-label="Fayl yuklanmoqda"
      >
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (isError || !data?.url) {
    return (
      <div
        role="alert"
        className={`flex min-h-24 w-full flex-col items-center justify-center gap-1.5 rounded-md border border-danger-bg bg-danger-bg p-3 text-center text-xs text-danger ${className}`}
      >
        <AlertCircle className="h-5 w-5 shrink-0 text-danger" aria-hidden="true" />
        <span>{error ? errorMessage(error) : 'Faylni ochib bo‘lmadi'}</span>
      </div>
    );
  }

  if (!data.mimeType.startsWith('image/')) {
    return (
      <div
        className={`relative flex items-center justify-center overflow-hidden rounded-md border border-border-default bg-surface-raised ${className}`}
      >
        <a
          href={data.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-24 w-full flex-col items-center justify-center gap-1.5 p-3 text-center text-xs font-medium text-text-primary"
        >
          <FileText className="h-6 w-6 shrink-0 text-text-secondary" aria-hidden="true" />
          <span>{alt}</span>
          <span className="text-text-secondary">Ochish</span>
        </a>
      </div>
    );
  }

  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden rounded-md border border-border-default bg-surface-raised ${className}`}
    >
      <img
        src={data.url}
        alt={alt}
        className="max-h-64 w-full rounded-md object-contain"
        loading="lazy"
      />
    </div>
  );
}
