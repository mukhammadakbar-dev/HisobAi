'use client';

import Link from 'next/link';
import { Logo } from '../components/layout/logo';
import { useCurrentUser } from '../features/auth/queries';

export default function NotFound() {
  const user = useCurrentUser();
  const isUnauthenticated = user.error?.status === 401;
  const isAuthenticated = !user.isPending && !isUnauthenticated && Boolean(user.data);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface-page px-4 py-12">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <div className="mb-8">
          <Logo className="h-8 w-auto" />
        </div>

        <div className="w-full rounded-xl border border-border-default bg-surface-card p-8 shadow-sm">
          <h1 className="text-7xl font-extrabold tracking-tight text-content-primary">
            404
          </h1>
          <p className="mt-3 text-lg font-medium text-content-secondary">
            Sahifa topilmadi
          </p>
          <p className="mt-1 text-sm text-content-secondary">
            Siz qidirayotgan sahifa mavjud emas yoki ko‘chirilgan bo‘lishi mumkin.
          </p>

          <div className="mt-8 flex justify-center">
            {user.isPending ? null : isAuthenticated ? (
              <Link
                href="/dashboard"
                className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90"
              >
                Bosh sahifaga qaytish
              </Link>
            ) : (
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90"
              >
                Kirish sahifasiga qaytish
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
