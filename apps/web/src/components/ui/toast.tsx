'use client';

import { AlertTriangle, Check, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Qisqa bildirishnoma navbati (`design.md` §6).
 *
 * Ilgari bu faqat `/customers` da bor edi va manzil qatoridagi
 * `?savedName=...` orqali ishlardi — ya'ni xabar URL'ga yozilib qolardi,
 * sahifa yangilansa qayta chiqardi va boshqa ekranlarda umuman yo'q edi.
 * Endi yagona navbat: `useToast().show(...)`.
 *
 * Muvaffaqiyat va ogohlantirish o'zi yo'qoladi, XATO esa qolaveradi —
 * pul harakati bilan bog'liq xatoni foydalanuvchi ko'rmay qolmasligi
 * kerak, uni qo'lda yopadi.
 */

type ToastTone = 'success' | 'warning' | 'danger';

interface ToastItem {
  id: number;
  tone: ToastTone;
  text: string;
}

interface ToastApi {
  success: (text: string) => void;
  warning: (text: string) => void;
  danger: (text: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const AUTO_DISMISS_MS: Record<ToastTone, number | null> = {
  success: 4000,
  warning: 6000,
  danger: null,
};

const TONE_STYLES: Record<ToastTone, { accent: string; icon: typeof Check }> = {
  success: { accent: 'text-success', icon: Check },
  warning: { accent: 'text-warning', icon: AlertTriangle },
  danger: { accent: 'text-danger', icon: AlertTriangle },
};

const BORDER_STYLES: Record<ToastTone, string> = {
  success: 'border-l-success',
  warning: 'border-l-warning',
  danger: 'border-l-danger',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (tone: ToastTone, text: string) => {
      const id = nextId.current;
      nextId.current += 1;
      setItems((current) => [...current, { id, tone, text }]);

      const timeout = AUTO_DISMISS_MS[tone];
      if (timeout !== null) {
        setTimeout(() => {
          dismiss(id);
        }, timeout);
      }
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (text) => {
        push('success', text);
      },
      warning: (text) => {
        push('warning', text);
      },
      danger: (text) => {
        push('danger', text);
      },
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/*
        `aria-live="polite"` — ekran o'quvchisi joriy o'qishini uzmasdan
        xabarni aytadi. Modal (`z-50`) ustida turadi: modal ichidagi
        amaldan kelgan xabar oyna ortida qolib ketmasligi kerak.
      */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-3 top-3 z-60 flex flex-col items-center gap-2 sm:inset-x-auto sm:right-4 sm:top-4 sm:items-end"
      >
        {items.map((item) => {
          const { accent, icon: Icon } = TONE_STYLES[item.tone];
          return (
            <div
              key={item.id}
              role={item.tone === 'danger' ? 'alert' : 'status'}
              className={`pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-md border border-border-default border-l-3 ${BORDER_STYLES[item.tone]} bg-surface-card p-3 shadow-xl`}
            >
              <Icon size={18} aria-hidden="true" className={`mt-0.5 shrink-0 ${accent}`} />
              <p className="m-0 flex-1 text-sm leading-snug text-text-primary">{item.text}</p>
              <button
                type="button"
                onClick={() => {
                  dismiss(item.id);
                }}
                aria-label="Xabarni yopish"
                className="-m-1 flex size-8 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:text-text-primary"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/**
 * Provider `app/providers.tsx` da butun ilovani o'raydi, shuning uchun
 * bu hook har qanday client komponentda ishlaydi.
 */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast faqat ToastProvider ichida ishlaydi');
  return api;
}
