import { ExecutionContext } from '@nestjs/common';
import { ErrorCode } from '@hisobai/contracts';
import { describe, expect, it } from 'vitest';

import { AppException } from './app.exception';
import { CSRF_COOKIE_NAME, CsrfGuard } from './csrf.guard';

function makeContext(options: {
  method: string;
  cookieToken?: string;
  headerToken?: string;
}): ExecutionContext {
  const request = {
    method: options.method,
    cookies: options.cookieToken ? { [CSRF_COOKIE_NAME]: options.cookieToken } : {},
    headers: options.headerToken ? { 'x-csrf-token': options.headerToken } : {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('CsrfGuard', () => {
  const guard = new CsrfGuard();

  it('GET va HEAD tekshirilmaydi', () => {
    expect(guard.canActivate(makeContext({ method: 'GET' }))).toBe(true);
    expect(guard.canActivate(makeContext({ method: 'HEAD' }))).toBe(true);
  });

  it("cookie va sarlavha mos kelsa o'tadi", () => {
    const context = makeContext({
      method: 'POST',
      cookieToken: 'token-abc',
      headerToken: 'token-abc',
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it("sarlavhasiz POST rad etiladi — boshqa sayt cookie'ni o'qiy olmaydi", () => {
    const context = makeContext({ method: 'POST', cookieToken: 'token-abc' });
    try {
      guard.canActivate(context);
      expect.unreachable('rad etilishi kerak edi');
    } catch (error) {
      expect((error as AppException).code).toBe(ErrorCode.AUTH_CSRF_INVALID);
    }
  });

  it('mos kelmaydigan token rad etiladi', () => {
    const context = makeContext({
      method: 'DELETE',
      cookieToken: 'token-abc',
      headerToken: 'token-xyz',
    });
    expect(() => guard.canActivate(context)).toThrow(AppException);
  });

  it("bo'sh token o'tmaydi", () => {
    const context = makeContext({ method: 'PATCH', cookieToken: '', headerToken: '' });
    expect(() => guard.canActivate(context)).toThrow(AppException);
  });
});
