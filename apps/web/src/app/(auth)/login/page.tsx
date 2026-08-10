import type { Metadata } from 'next';

import { LoginForm } from '../../../features/auth/components/login-form';

export const metadata: Metadata = { title: 'Kirish · HisobAI' };

/**
 * `DECISIONS.md` §2 — tizimga kirishning yagona eshigi.
 *
 * Sahifada biznes mantiq yo'q (`FRONTEND.md` §3): u faqat `features/auth`
 * dagi formani chaqiradi.
 */
export default function LoginPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-xl font-semibold">Tizimga kirish</h1>
        <p className="m-0 text-sm text-text-secondary">Do‘kon hisobingiz bilan kiring.</p>
      </div>

      <LoginForm />
    </div>
  );
}
