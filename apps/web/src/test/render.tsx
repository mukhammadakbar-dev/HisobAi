import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';

/**
 * `TanStack Query` provayderi bilan render (`FRONTEND.md` §2 — server state).
 *
 * Har chaqiruvda **yangi** `QueryClient`: testlar orasida kesh sizmasin —
 * aks holda bitta testda yozilgan kesh keyingisida "eski ma'lumot" bo'lib
 * ko'rinardi va xato faqat testlar tartibiga bog'liq bo'lib qolardi.
 *
 * `retry: false` — `ApiError` baribir qayta urinilmaydi (`query-client.ts`),
 * lekin testda `4xx`/tarmoq xatosini **darhol** ko'rish kerak, standart
 * qayta urinish kutish vaqtini yo'qotmasdan.
 */
export function renderWithProviders(ui: ReactElement): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}
