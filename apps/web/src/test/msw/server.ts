import { setupServer } from 'msw/node';

import { handlers } from './handlers';

/**
 * Node muhitidagi (vitest + jsdom) MSW serveri — global `fetch` darajasida
 * ushlaydi (`FRONTEND.md` §5.1: yagona kirish nuqtasi `api-client.ts`).
 * Hayot davri `vitest.setup.ts` da boshqariladi.
 */
export const server = setupServer(...handlers);
