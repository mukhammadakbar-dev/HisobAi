import type { Metadata } from 'next';

import { PlatformLoginForm } from '../../../../features/platform/components/platform-login-form';

export const metadata: Metadata = { title: 'Platforma · Kirish' };

/**
 * §25.4 — SUPERADMIN uchun alohida kirish eshigi. Business `/login`
 * bilan bir xil forma emas: boshqa jadval, boshqa sessiya (§21.3).
 */
export default function SuperadminLoginPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-xl font-semibold">Platforma boshqaruvi</h1>
        <p className="m-0 text-sm text-text-secondary">
          Bu sahifa do‘kon hisoblari uchun emas. Do‘kon egasi bo‘lsangiz{' '}
          <a href="/login" className="text-link underline-offset-2 hover:underline">
            asosiy kirish sahifasiga
          </a>{' '}
          o‘ting.
        </p>
      </div>

      <PlatformLoginForm />
    </div>
  );
}
