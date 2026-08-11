import { ErrorCode } from '@hisobai/contracts';
import type { ApiErrorBody } from '@hisobai/contracts';

import { ApiError } from './api-error';

/**
 * Yagona API kirish nuqtasi (`FRONTEND.md` §5.1).
 *
 * `fetch` to'g'ridan-to'g'ri chaqirilmaydi — aks holda CSRF sarlavhasi,
 * idempotency kaliti va xato ishlovi har joyda qaytadan yoziladi va
 * bittasi unutiladi.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const CSRF_COOKIE = 'hisobai_csrf';

export interface RequestOptions {
  /** Moliyaviy `POST` uchun majburiy (`API.md` §4). */
  idempotencyKey?: string;
  signal?: AbortSignal;
  /** So'rov parametrlari; `undefined` qiymatlar tashlab ketiladi. */
  query?: Record<string, string | number | boolean | undefined>;
}

/** `401` da chaqiriladi — keshni tozalash va `/login` ga yo'naltirish uchun. */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  onUnauthorized = handler;
}

function readCookie(name: string): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie);
  return match ? decodeURIComponent(match[1] ?? '') : undefined;
}

/**
 * CSRF cookie'si yo'q bo'lsa — uni oldindan oldiradi (`API.md` §1).
 *
 * Server cookie'ni **istalgan** so'rovda qo'yadi (`CsrfCookieMiddleware`),
 * lekin `/login` sahifasi hech qanday so'rov yubormaydi: `(auth)` qobig'i
 * ataylab `GET /auth/me` ni chaqirmaydi (sessiya talab qilmaydigan sahifa).
 * Natijada **birinchi** login urinishi har doim `403 AUTH_CSRF_INVALID`
 * bilan tugardi va faqat ikkinchisi o'tardi — yangi brauzerda, incognito'da
 * va cookie tozalangandan keyin ham. Ishga tushirib tekshirilganda aynan shu
 * chiqdi.
 *
 * Nega bu yerda: `api-client` — CSRF sarlavhasi qo'yiladigan yagona joy,
 * ya'ni tuzatish ham shu yerda turishi kerak. Login formasiga qo'yilsa,
 * keyingi ochiq forma (parol tiklash) uni qaytadan unutardi.
 *
 * `GET /health/live` tanlangan: u `@Public()`, javobi kichik va hech qanday
 * yon ta'siri yo'q. `GET /auth/me` esa `401` qaytarib, sessiya tugagan deb
 * keshni tozalash oqimini ishga tushirardi.
 */
async function ensureCsrfToken(): Promise<string | undefined> {
  const existing = readCookie(CSRF_COOKIE);
  if (existing) return existing;

  // Xato yutiladi: cookie olinmasa ham asosiy so'rov yuboriladi va
  // serverning o'z javobi (`403`) foydalanuvchiga ko'rinadi
  await fetch(`${BASE_URL}/health/live`, { credentials: 'include' }).catch(() => undefined);
  return readCookie(CSRF_COOKIE);
}

function buildUrl(path: string, query: RequestOptions['query']): string {
  const url = new URL(`${BASE_URL}${path}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  const isMutation = method !== 'GET' && method !== 'HEAD';

  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (isMutation) {
    const csrf = await ensureCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  if (options.idempotencyKey) {
    headers['Idempotency-Key'] = options.idempotencyKey;
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      credentials: 'include',
      signal: options.signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    // AbortError — foydalanuvchi sahifadan chiqdi, xato emas
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw ApiError.network();
  }

  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const shape = payload as ApiErrorBody | null;
    const error = shape?.error;

    if (response.status === 401) {
      onUnauthorized?.();
    }

    throw new ApiError({
      code: error?.code ?? ErrorCode.INTERNAL_ERROR,
      message: error?.message ?? "Server javob bermadi. Qayta urinib ko'ring.",
      status: response.status,
      field: error?.field,
      details: error?.details,
      requestId: error?.requestId,
    });
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions): Promise<T> =>
    request<T>('GET', path, undefined, options),

  post: <T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>('POST', path, body, options),

  patch: <T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>('PATCH', path, body, options),

  put: <T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>('PUT', path, body, options),

  delete: <T>(path: string, options?: RequestOptions): Promise<T> =>
    request<T>('DELETE', path, undefined, options),
};
