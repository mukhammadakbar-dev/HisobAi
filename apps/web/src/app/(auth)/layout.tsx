import type { ReactNode } from 'react';

import { Logo } from '../../components/layout/logo';
import { ThemeToggle } from '../../components/layout/theme-toggle';

/**
 * Ochiq sahifalar qobig'i (`/login`, `/reset-password`).
 *
 * `AppShell` dan ataylab ajratilgan: bu yerda navigatsiya, kurs chizig'i
 * va chiqish tugmasi bo'lmaydi — ularning hammasi sessiyani talab qiladi.
 * Mavzu tanlash esa qoladi: kirishdan oldin ham ekran o'qilishi kerak.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-surface-page px-5 py-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-between gap-4">
          <Logo className="h-8 w-auto" />
          <ThemeToggle />
        </div>

        <div className="rounded-lg border border-border-default bg-surface-card p-5">
          {children}
        </div>
      </div>
    </div>
  );
}
