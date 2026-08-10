import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

/**
 * UI primitivlari (`design.md` §5, §6).
 *
 * Qat'iy qoidalar shu yerda bir marta bajariladi:
 *  - bosish maydoni ≥ 44×44px (do'konda telefon bilan ishlanadi);
 *  - burchak: input/tugma 10px, karta 14px, badge 6px;
 *  - fokus halqasi hech qachon o'chirilmaydi (`globals.css` da global);
 *  - bir ekranda faqat BITTA asosiy tugma.
 */

type ButtonVariant = 'primary' | 'secondary' | 'danger';

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: 'bg-action text-action-text hover:bg-action-hover',
  secondary:
    'bg-surface-card text-text-primary border border-border-default hover:bg-surface-raised',
  danger: 'bg-danger text-white',
};

export function Button({
  variant = 'secondary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_STYLES[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`min-h-11 w-full rounded-md border border-border-default bg-surface-card px-3 text-base text-text-primary placeholder:text-text-tertiary ${className}`}
      {...rest}
    />
  );
}

export function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {/* placeholder label o'rnini bosmaydi — a11y (§11) */}
      <label htmlFor={htmlFor} className="text-sm font-medium text-text-secondary">
        {label}
      </label>
      {children}
      {error && (
        <p className="m-0 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  // design.md §5 — oddiy kartada soya emas, chegara
  return (
    <div className={`rounded-lg border border-border-default bg-surface-card p-4 ${className}`}>
      {children}
    </div>
  );
}

type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'muted';

const BADGE_STYLES: Record<BadgeTone, string> = {
  success: 'bg-success-bg text-success',
  warning: 'bg-warning-bg text-warning',
  danger: 'bg-danger-bg text-danger',
  info: 'bg-info-bg text-info',
  muted: 'bg-muted-bg text-muted',
};

/**
 * Status belgisi.
 *
 * TZ §20 — **rang yagona signal emas**: badge'da doim matn bo'ladi,
 * shuning uchun rang ko'rmaydigan foydalanuvchi ham holatni tushunadi.
 */
export function Badge({ tone, children }: { tone: BadgeTone; children: ReactNode }) {
  return (
    <span
      className={`inline-block rounded-sm px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${BADGE_STYLES[tone]}`}
    >
      {children}
    </span>
  );
}
