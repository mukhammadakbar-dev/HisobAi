'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

import { ToastProvider } from '../components/ui/toast';
import { setUnauthorizedHandler } from '../lib/api-client';
import { createQueryClient } from '../lib/query-client';

export function Providers({ children }: { children: ReactNode }) {
  // `useState` bilan — har render'da yangi client yaratilmasin
  const [queryClient] = useState(createQueryClient);
  const router = useRouter();

  useEffect(() => {
    /**
     * Sessiya tugaganda kesh tozalanadi: aks holda `/login` ga
     * o'tgandan keyin ham eski ma'lumot ekranda qolib ketadi.
     */
    setUnauthorizedHandler(() => {
      queryClient.clear();

      /**
       * Ikki mustaqil sessiya tizimi bor (§21.3, `ARCHITECTURE.md`
       * §14.3), ya'ni "kirish sahifasi" ham ikkita. Platforma
       * panelidagi `401` ni `/login` ga otish SUPERADMIN'ni business
       * kirish formasiga olib borardi — u yerda uning hisobi umuman
       * yo'q (`platform_admins` alohida jadval), ya'ni foydalanuvchi
       * to'g'ri parol bilan ham kira olmasdi va sababi ko'rinmasdi.
       *
       * Manzil bo'yicha ajratish — `api-client` ga sessiya turini
       * bildirishdan ko'ra sodda: klient transporti ikkala yo'l uchun
       * bir xil, faqat qaytish nuqtasi boshqa.
       */
      const isPlatform = window.location.pathname.startsWith('/superadmin');
      router.push(isPlatform ? '/superadmin/login' : '/login');
    });
  }, [queryClient, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}
