'use client';

import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';

import { Button } from './index';

/**
 * Modal oyna va tasdiqlash dialogi (`design.md` §6, `FRONTEND.md` §7).
 *
 * Ilgari dialog har joyda qo'lda yozilardi va uchta narsa yo'q edi:
 * fokus oyna ichida qulflanmasdi (Tab bosilsa fokus orqadagi sahifaga
 * chiqib ketardi), `Esc` ishlamasdi, orqa fon esa skroll qilaverardi —
 * telefonda modal ochiq turib sahifa qimirlab ketardi. Uchalasi ham shu
 * yerda bir marta hal qilinadi.
 *
 * Mobilda oyna pastdan chiqadi (bosh barmoq yetadigan joy), `sm:` dan
 * boshlab markazda turadi.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Sarlavha ostidagi tushuntirish. Ekran o'quvchisiga ham ulanadi. */
  description?: string;
  children?: ReactNode;
  /** Amal tugmalari. Bo'sh qoldirilsa faqat yopish qoladi. */
  footer?: ReactNode;
}

export function Modal({ open, onClose, title, description, children, footer }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return undefined;

    // Yopilgach fokus qaytadigan element — odatda oynani ochgan tugma
    restoreRef.current = document.activeElement as HTMLElement | null;

    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    const panel = panelRef.current;
    (panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel)?.focus();

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const nodes = panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (!first || !last) return;

      // Ro'yxat aylanadi: oxirgidan keyin birinchisi, birinchidan oldin oxirgisi
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      body.style.overflow = previousOverflow;
      restoreRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      onMouseDown={(event) => {
        // Faqat fonning O'ZIGA bosilganda yopiladi — oyna ichidan
        // boshlangan tanlash sichqoncha fonda uzilsa yopilib ketmasin
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="flex max-h-[90dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-lg border border-border-default bg-surface-card p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl outline-none sm:max-w-md sm:rounded-lg sm:pb-5"
      >
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="m-0 text-lg font-semibold text-text-primary">
            {title}
          </h2>
          {description && (
            <p id={descriptionId} className="m-0 text-sm text-text-secondary">
              {description}
            </p>
          )}
        </div>

        {children}

        {footer && <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>
  );
}

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description?: string;
  /** Tasdiqlash tugmasi matni — bajariladigan ishni aytadi (`design.md` §7). */
  confirmLabel: string;
  cancelLabel?: string;
  /** O'chirish, bekor qilish, qaytarish kabi ortga qaytmaydigan amallar uchun. */
  destructive?: boolean;
  pending?: boolean;
  pendingLabel?: string;
}

/**
 * Ortga qaytarib bo'lmaydigan amal oldidan so'raladigan tasdiq.
 *
 * `Modal` ustiga qurilgan — ya'ni fokus, `Esc` va scroll-lock bepul keladi.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Bekor qilish',
  destructive = false,
  pending = false,
  pendingLabel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? (pendingLabel ?? 'Bajarilmoqda…') : confirmLabel}
          </Button>
        </>
      }
    />
  );
}
