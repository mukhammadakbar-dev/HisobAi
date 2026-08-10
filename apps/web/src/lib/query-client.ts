import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './api-error';

/**
 * TanStack Query konfiguratsiyasi (`FRONTEND.md` §5.6).
 *
 * §14.7 — **avtomatik yangilash yo'q**: trafik va batareya tejaladi.
 * Ma'lumot sahifa ochilganda va qo'lda tortilganda yangilanadi.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 5 * 60_000,

        // §14.7 — oynaga qaytganda so'rov yubormaydi
        refetchOnWindowFocus: false,
        // Internet qaytganda esa yubordi — bu foydalanuvchi kutgan xulq
        refetchOnReconnect: true,

        /**
         * Biznes xatosini qayta urinish ma'nosiz: IMEI band bo'lsa, u
         * ikkinchi so'rovda ham band bo'ladi. Faqat tarmoq va 5xx
         * takrorlanadi.
         */
        retry: (failureCount, error) => {
          if (error instanceof ApiError) return error.isRetriable && failureCount < 2;
          return failureCount < 2;
        },
      },
      mutations: {
        /**
         * Moliyaviy mutatsiya HECH QACHON avtomatik takrorlanmaydi.
         * Takrorlashdan himoya `Idempotency-Key` bilan serverda
         * qilinadi (§17.6) — client tomonidan ko'r-ko'rona qayta
         * yuborish ikki savdo yaratishi mumkin.
         */
        retry: false,
      },
    },
  });
}
