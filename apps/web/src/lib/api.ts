/**
 * API Fetch Client for HisobAI CRM with CSRF & Session Security
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

let cachedCsrfToken: string | null = null;

function getCsrfCookieValue(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )baraka_csrf=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function fetchCsrfToken(): Promise<string | null> {
  const cookieVal = getCsrfCookieValue();
  if (cookieVal) {
    cachedCsrfToken = cookieVal;
    return cookieVal;
  }

  if (cachedCsrfToken) {
    return cachedCsrfToken;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/auth/csrf`, {
      method: 'GET',
      credentials: 'include',
    });
    if (response.ok) {
      const data = await response.json();
      if (data?.csrfToken) {
        cachedCsrfToken = data.csrfToken;
        return data.csrfToken;
      }
    }
  } catch (err) {
    console.warn('Failed to fetch CSRF token:', err);
  }

  return null;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${API_BASE_URL}${endpoint}`;
  const method = (options.method || 'GET').toUpperCase();

  const isStateChanging = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  const isAuthMethod = endpoint.includes('/auth/login') || endpoint.includes('/auth/csrf');

  let csrfToken: string | null = null;
  if (isStateChanging && !isAuthMethod) {
    csrfToken = await fetchCsrfToken();
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Include HttpOnly cookies
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMessage = data?.message || data?.error || 'Server bilan aloqada xatolik yuz berdi';
    throw new Error(Array.isArray(errorMessage) ? errorMessage.join(', ') : errorMessage);
  }

  return data as T;
}
