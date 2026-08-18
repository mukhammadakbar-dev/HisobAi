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

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';
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
function getOrigin(): string {
  if (typeof window !== 'undefined') return window.location.origin;
  return 'http://localhost:3000';
}

export function prefetchCsrf(): void {
  if (typeof window === 'undefined') return;
  if (!readCookie(CSRF_COOKIE)) {
    fetch(buildUrl('/health/live', undefined), { credentials: 'include' }).catch(() => undefined);
  }
}

// Brauzerda fayl yuklanganda avtomatik CSRF tokenini tayyorlab qo'yadi
prefetchCsrf();

async function ensureCsrfToken(): Promise<string | undefined> {
  let token = readCookie(CSRF_COOKIE);
  if (token) return token;

  await fetch(buildUrl('/health/live', undefined), { credentials: 'include' }).catch(() => undefined);
  token = readCookie(CSRF_COOKIE);
  if (!token) {
    // Brauzer kuki yozib ulgurishi uchun qisqa 50ms kutiladi
    await new Promise((resolve) => setTimeout(resolve, 50));
    token = readCookie(CSRF_COOKIE);
  }
  return token;
}

function buildUrl(path: string, query: RequestOptions['query']): string {
  const fullPath = `${BASE_URL}${path}`;
  const url =
    fullPath.startsWith('http://') || fullPath.startsWith('https://')
      ? new URL(fullPath)
      : new URL(fullPath, getOrigin());
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function clearCsrfCookie(): void {
  if (typeof document !== 'undefined') {
    document.cookie = `${CSRF_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: RequestOptions = {},
  isRetry = false,
): Promise<T> {
  const headers: Record<string, string> = {};
  const isMutation = method !== 'GET' && method !== 'HEAD';
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';

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
      body: isFormData ? body : (body === undefined ? undefined : JSON.stringify(body)),
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

    // CSRF token yaroqsiz bo'lsa — eski cookieni tozalab, bir marta avtomatik qayta urinadi
    if (!isRetry && response.status === 403 && error?.code === ErrorCode.AUTH_CSRF_INVALID) {
      clearCsrfCookie();
      await ensureCsrfToken();
      return request<T>(method, path, body, options, true);
    }

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

  upload: <T>(path: string, formData: FormData, options?: RequestOptions): Promise<T> =>
    request<T>('POST', path, formData, options),

  patch: <T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>('PATCH', path, body, options),

  put: <T>(path: string, body?: unknown, options?: RequestOptions): Promise<T> =>
    request<T>('PUT', path, body, options),

  delete: <T>(path: string, options?: RequestOptions): Promise<T> =>
    request<T>('DELETE', path, undefined, options),
};
