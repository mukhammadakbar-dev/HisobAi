import type { ReactNode } from 'react';

import { Logo } from '../../components/layout/logo';
import { ThemeToggle } from '../../components/layout/theme-toggle';

/**
 * Platforma kirish qobig'i — faqat `/superadmin/login` (§25.4).
 *
 * **Nega `(superadmin)` guruhida emas:** o'sha qobiq sessiya darvozasi
 * (`usePlatformAdmin`) va sessiyasiz `/superadmin/login` ga yo'naltiradi
 * — login sahifasining o'zi u yerda bo'lsa, cheksiz yo'naltirish
 * halqasi hosil bo'lardi. Bu `(auth)` va `(app)` juftligidagi ajratish
 * bilan aynan bir xil naqsh.
 *
 * Ko'rinishi ham ataylab boshqacha: platforma paneli **do'kon xodimi
 * uchun emas**. "Platforma" yozuvi va boshqa rang urg'usi bu yerga
 * tasodifan kirgan SHOP_ADMIN darhol adashganini tushunishi uchun.
 */
export default function SuperadminAuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-surface-page px-5 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Logo className="h-8 w-auto" />
            <span className="rounded-md bg-info-bg px-2 py-0.5 text-xs font-semibold text-info">
              Platforma
            </span>
          </div>
          <ThemeToggle />
        </div>

        <div className="rounded-lg border border-border-default bg-surface-card p-5">{children}</div>
      </div>
    </div>
  );
}
