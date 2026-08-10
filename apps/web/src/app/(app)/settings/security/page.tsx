'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { ChangePasswordForm } from '../../../../features/auth/components/change-password-form';
import { LoginAttemptsCard } from '../../../../features/auth/components/login-attempts-card';
import { SessionsCard } from '../../../../features/auth/components/sessions-card';
import { useCurrentUser } from '../../../../features/auth/queries';
import { can } from '../../../../lib/permissions';

/**
 * Xavfsizlik (§2.7, §2.10, §17.16).
 *
 * Uchta mustaqil blok: har biri o'z so'rovi va o'z holatlariga ega —
 * bittasi yiqilsa qolgani ko'rinaveradi (`FRONTEND.md` §7).
 */
export default function SecurityPage() {
  const user = useCurrentUser();

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/settings"
          className="inline-flex w-fit items-center gap-1 text-sm font-medium text-link hover:underline"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Sozlamalar
        </Link>
        <h1 className="m-0 text-2xl font-semibold">Xavfsizlik</h1>
        <p className="m-0 text-text-secondary">
          Parol, kirgan qurilmalar va kirish urinishlari tarixi.
        </p>
      </header>

      <ChangePasswordForm />

      {can(user.data, 'session.manage') && <SessionsCard />}

      {can(user.data, 'audit.view') && <LoginAttemptsCard />}
    </div>
  );
}
