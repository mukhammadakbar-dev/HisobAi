import { SaleStatus } from '@hisobai/contracts';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { API_BASE } from '../../../test/msw/handlers';
import { server } from '../../../test/msw/server';
import { CASH_ACCOUNT_UZS_ID, SALE_ID, mockDraftSale } from '../../../test/msw/fixtures';
import { renderWithProviders } from '../../../test/render';
import { SaleForm } from './sale-form';

/**
 * Savdo tasdiqlash — idempotency kalitining umri (`FRONTEND.md` §13
 * "Majburiy", audit T-07, tuzatildi `76173b7`).
 *
 * `hooks/use-idempotency-key.ts` uch qoidani belgilaydi:
 *  1. muvaffaqiyatda kalit YUBORILADI va keyin yangilanadi;
 *  2. server aniq rad etganda (`4xx`, tarmoq/`REQUEST_IN_PROGRESS` emas)
 *     kalit YANGILANADI — aks holda tuzatib qayta yuborilgan savat
 *     `IDEMPOTENCY_KEY_REUSED` bilan rad etilardi (T-07 aynan shu edi);
 *  3. tarmoq xatosida (`status === 0`) kalit O'ZGARMAYDI — javob yo'lda
 *     yo'qolgan bo'lishi mumkin, eski kalit bilan qayta yuborish
 *     serverning saqlangan javobini qaytaradi (`API.md` §4, TZ §17.6).
 *
 * Bu uchala qoida faqat komponent darajasida sinaladi: hook o'zi to'g'ri
 * bo'lsa ham, `sale-form.tsx` uni **noto'g'ri chaqirsa** (masalan xatodan
 * keyin `renew()` chaqirsa yoki umuman chaqirmasa) xuddi T-07 dagidek
 * savat yo'qoladi. Shuning uchun MSW orqali haqiqiy `fetch` so'rovi
 * ushlanadi va sarlavha tekshiriladi — hook alohida mock qilinmaydi.
 *
 * Ssenariy `/sales/[id]` sahifasidagi mavjud qoralamani ochish: `sale`
 * prop bilan render qilinadi. Savat serverdan kelgan bitta qator bilan
 * oldindan to'ldirilgan (`test/msw/fixtures.ts`) — testning diqqati
 * mahsulot/IMEI tanlashda emas, faqat idempotency xulqida bo'lsin uchun.
 * Foydalanuvchidan talab qilinadigan yagona qadam — to'lov, chunki
 * `payments` holati `sale.payments` dan emas, har doim bo'sh qatordan
 * boshlanadi (§7.1 — to'lov faqat tasdiqlash paytida kiritiladi).
 */

const { pushMock } = vi.hoisted(() => ({ pushMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

/** UUID v4 ko'rinishi — `randomId()` (`lib/random-id.ts`) natijasi shunday. */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

beforeEach(() => {
  pushMock.mockClear();
});

/**
 * Formani "Tasdiqlash" tugmasi bosishga tayyor holatga keltiradi: mavjud
 * qoralama render qilinadi, kassa hisobi tanlanadi va savdo summasiga
 * teng naqd to'lov kiritiladi (§17.10 — naqd savdoda qoldiq nolga
 * tushmaguncha tugma o'chirilgan).
 */
async function renderReadyToConfirm(
  user: ReturnType<typeof userEvent.setup>,
): Promise<HTMLElement> {
  renderWithProviders(<SaleForm sale={mockDraftSale()} />);

  const accountSelect = await screen.findByLabelText('Kassa hisobi');
  await user.selectOptions(accountSelect, CASH_ACCOUNT_UZS_ID);
  await user.type(screen.getByLabelText('Summa (UZS)'), '1000000');

  const confirmButton = screen.getByRole('button', { name: 'Tasdiqlash' });
  await waitFor(() => {
    expect(confirmButton).toBeEnabled();
  });
  return confirmButton;
}

/** Har chaqiruvda yuborilgan `Idempotency-Key` sarlavhalarini yig'adi. */
function captureConfirmIdempotencyKeys(
  respond: (call: number) => { status: number; body: unknown },
): string[] {
  const keys: string[] = [];
  let call = 0;

  server.use(
    http.patch(`${API_BASE}/sales/${SALE_ID}`, () => HttpResponse.json(mockDraftSale())),
    http.post(`${API_BASE}/sales/${SALE_ID}/confirm`, ({ request }) => {
      call += 1;
      keys.push(request.headers.get('Idempotency-Key') ?? '');
      const { status, body } = respond(call);
      return HttpResponse.json(body, { status });
    }),
  );

  return keys;
}

describe('SaleForm — Idempotency-Key umri (§5.4, TZ §17.6, T-07)', () => {
  it('tasdiqlash muvaffaqiyatli bo‘lsa Idempotency-Key sarlavhasi yuboriladi', async () => {
    const user = userEvent.setup();
    const keys = captureConfirmIdempotencyKeys(() => ({
      status: 200,
      body: mockDraftSale({ status: SaleStatus.CONFIRMED, number: '2026-00001' }),
    }));

    const confirmButton = await renderReadyToConfirm(user);
    await user.click(confirmButton);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(`/sales/${SALE_ID}`);
    });

    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(UUID_PATTERN);
  });

  it('server 4xx qaytarsa (SALE_ITEM_NOT_AVAILABLE) va ega qayta yuborsa — kalit YANGI bo‘ladi', async () => {
    const user = userEvent.setup();
    const keys = captureConfirmIdempotencyKeys((call) =>
      call === 1
        ? {
            status: 422,
            body: {
              error: {
                code: 'SALE_ITEM_NOT_AVAILABLE',
                message: 'Bu mahsulot allaqachon sotilgan. Savatdan olib tashlang.',
                requestId: 'req-1',
              },
            },
          }
        : { status: 200, body: mockDraftSale({ status: SaleStatus.CONFIRMED, number: '2026-00002' }) },
    );

    const confirmButton = await renderReadyToConfirm(user);
    await user.click(confirmButton);

    // Server rad etgan — banner ko'rinadi, savat esa saqlanib qoladi
    // (aks holda T-07: eski kalit bilan qayta bosish `IDEMPOTENCY_KEY_REUSED`
    // olib sahifani yangilashga majburlardi, ya'ni savat yo'qolardi)
    await screen.findByText('Bu mahsulot allaqachon sotilgan. Savatdan olib tashlang.');

    const retryButton = screen.getByRole('button', { name: 'Tasdiqlash' });
    await waitFor(() => {
      expect(retryButton).toBeEnabled();
    });
    await user.click(retryButton);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(`/sales/${SALE_ID}`);
    });

    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(UUID_PATTERN);
    expect(keys[1]).toMatch(UUID_PATTERN);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('tarmoq xatosida (status 0) kalit O‘ZGARMAYDI — §17.6 asosiy ssenariysi', async () => {
    const user = userEvent.setup();
    // `HttpResponse.error()` javob TANASI emas — u `fetch`ni tarmoq
    // darajasida rad etadi (`api-client.ts` buni `ApiError.network()`,
    // ya'ni `status === 0` ga aylantiradi), shuning uchun umumiy
    // `captureConfirmIdempotencyKeys` bu yerga mos kelmaydi: u har doim
    // JSON javob qaytaradi.
    const keys: string[] = [];
    server.use(
      http.patch(`${API_BASE}/sales/${SALE_ID}`, () => HttpResponse.json(mockDraftSale())),
      http.post(`${API_BASE}/sales/${SALE_ID}/confirm`, ({ request }) => {
        const key = request.headers.get('Idempotency-Key') ?? '';
        if (keys.length === 0) {
          keys.push(key);
          return HttpResponse.error();
        }
        keys.push(key);
        return HttpResponse.json(mockDraftSale({ status: SaleStatus.CONFIRMED, number: '2026-00003' }));
      }),
    );

    const confirmButton = await renderReadyToConfirm(user);
    await user.click(confirmButton);

    await screen.findByText("Internet yo'q. Ulanishni tekshirib, qaytadan urinib ko'ring.");

    const retryButton = screen.getByRole('button', { name: 'Tasdiqlash' });
    await waitFor(() => {
      expect(retryButton).toBeEnabled();
    });
    await user.click(retryButton);

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith(`/sales/${SALE_ID}`);
    });

    expect(keys).toHaveLength(2);
    expect(keys[0]).toMatch(UUID_PATTERN);
    expect(keys[1]).toBe(keys[0]);
  });
});
