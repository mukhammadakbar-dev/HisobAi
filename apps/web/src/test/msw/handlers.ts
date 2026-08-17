import { http, HttpResponse } from 'msw';
import type { Page } from '@hisobai/contracts';

import {
  mockCashAccountUsd,
  mockCashAccountUzs,
  mockInventoryItem,
  mockProduct,
  mockTodayRate,
  mockUser,
} from './fixtures';

/** `lib/api-client.ts` dagi `BASE_URL` bilan bir xil — `NEXT_PUBLIC_API_URL` testda berilmagan. */
export const API_BASE = 'http://localhost:4000/api/v1';

function page<T>(data: T[]): Page<T> {
  return { data, nextCursor: null, hasMore: false };
}

/**
 * Standart `GET` javoblari — savdo formasi ochilishi uchun zarur bo'lgan
 * so'rovlarning hammasi (`SaleForm` bir vaqtda mahsulot, mijoz, kassa
 * hisobi, kurs va joriy foydalanuvchini so'raydi). Har test faylida
 * takrorlanmasin deb shu yerda bir marta.
 *
 * Moliyaviy `POST`/`PATCH` (qoralama saqlash, tasdiqlash) bu ro'yxatda
 * YO'Q — ularning javobi har testning o'z ssenariysiga bog'liq
 * (muvaffaqiyat / `4xx` / tarmoq xatosi), shuning uchun `server.use(...)`
 * bilan testning o'zida qo'shiladi.
 */
export const handlers = [
  http.get(`${API_BASE}/auth/me`, () => HttpResponse.json(mockUser)),
  http.get(`${API_BASE}/products`, () => HttpResponse.json(page([mockProduct]))),
  http.get(`${API_BASE}/customers`, () => HttpResponse.json(page([]))),
  http.get(`${API_BASE}/cash-accounts`, () =>
    HttpResponse.json([mockCashAccountUzs, mockCashAccountUsd]),
  ),
  http.get(`${API_BASE}/exchange-rates/today`, () => HttpResponse.json(mockTodayRate)),
  http.get(`${API_BASE}/inventory`, () => HttpResponse.json(page([mockInventoryItem]))),
  http.get(`${API_BASE}/inventory/batches`, () => HttpResponse.json(page([]))),
];
