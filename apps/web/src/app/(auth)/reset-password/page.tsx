'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

import { ResetPasswordForm } from '../../../features/auth/components/reset-password-form';

/**
 * Emaildagi tiklash havolasi shu yerga tushadi (§2.5).
 *
 * Manzil `auth.service.ts` da quriladi: `${WEB_ORIGIN}/reset-password?token=…`
 * — shuning uchun marshrut nomi o'zgartirilmaydi, aks holda yuborilgan
 * xatlardagi havolalar ishlamay qoladi.
 */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className="m-0 text-text-secondary">Yuklanmoqda…</p>}>
      <ResetPasswordContent />
    </Suspense>
  );
}

function ResetPasswordContent() {
  const token = useSearchParams().get('token');

  if (!token) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="m-0 text-xl font-semibold">Havola to‘liq emas</h1>
        <p className="m-0 text-sm text-text-secondary">
          Parolni tiklash havolasi noto‘g‘ri yoki to‘liq nusxalanmagan. Tiklashni qaytadan boshlang.
        </p>
        <Link
          href="/login"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-action px-4 text-sm font-semibold text-action-text"
        >
          Kirishga qaytish
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-xl font-semibold">Yangi parol</h1>
        <p className="m-0 text-sm text-text-secondary">
          Yangi parolni kiriting — shundan keyin barcha qurilmalardan qayta kirish kerak bo‘ladi.
        </p>
      </div>

      <ResetPasswordForm token={token} />
    </div>
  );
}
