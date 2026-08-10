'use client';

import { errorMessage } from '../../lib/messages';

/**
 * Loading · error · empty (`FRONTEND.md` §7).
 *
 * Har ro'yxat va kartochka uchun to'rtala holat loyihalanadi. Bu
 * komponentlar shuni arzon qiladi — aks holda "keyin qo'shamiz" bo'lib
 * qolib ketadi.
 */

/**
 * Skeleton — spinner emas.
 *
 * Sabab: skeleton jadval shaklini saqlaydi va yuklab bo'lgach sahifa
 * sakramaydi. Spinner esa kontent kelganda layoutni siljitadi.
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-md bg-surface-raised ${className}`} aria-hidden="true" />
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Yuklanmoqda">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4">
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      ))}
    </div>
  );
}

/**
 * Xato holati.
 *
 * `design.md` §7: nima bo'lgani va nima qilish kerakligi aytiladi,
 * uzr so'ralmaydi.
 */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-lg border border-danger-bg bg-danger-bg p-4"
    >
      <p className="m-0 font-medium text-danger">{errorMessage(error)}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="min-h-11 rounded-md border border-border-default bg-surface-card px-4 text-sm font-semibold text-text-primary"
        >
          Qayta urinish
        </button>
      )}
    </div>
  );
}

/**
 * Bo'sh holat.
 *
 * "Ma'lumot yo'q" emas — keyingi qadam aytiladi (`design.md` §6).
 */
export function EmptyState({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border-default px-4 py-10 text-center">
      <p className="m-0 text-text-secondary">{title}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="min-h-11 rounded-md bg-action px-4 text-sm font-semibold text-action-text"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
