'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';

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
      router.push('/login');
    });
  }, [queryClient, router]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
