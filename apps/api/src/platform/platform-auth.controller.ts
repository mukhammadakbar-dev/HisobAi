import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle, seconds } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { platformLoginSchema } from '@hisobai/contracts';
import type { PlatformAdminDto, PlatformLoginInput } from '@hisobai/contracts';
import type { Response, Request } from 'express';

import { Public, PlatformOnly } from '../common/auth.decorators';
import { sessionCookieOptions } from '../common/session-token';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { Env } from '../config/env';
import { CurrentPlatformAdmin } from './current-platform-admin.decorator';
import { PlatformAuthService } from './platform-auth.service';
import type { PlatformAdminAuth } from './platform-request';

/** `API.md` §6 — auth sinfi bilan bir xil chegara: 5 urinish / 15 daqiqa. */
const AUTH_LIMIT = { limit: 5, ttl: seconds(15 * 60) };

/**
 * `/platform/auth/*` — SUPERADMIN kirishi (§21.3, §25.4).
 *
 * `AuthController` bilan **qasddan bir xil shaklda emas** — bu yerda
 * `/sessions`, `/change-password`, `/forgot-password` yo'q: SUPERADMIN
 * hisobi MVP'da faqat server tomondan (`prisma/seed.mts`) yaratiladi,
 * o'z-o'zini boshqarish funksiyasi scope'dan tashqarida (`§25.21` MVP
 * ro'yxatida yo'q).
 */
@ApiTags('platform-auth')
@Controller('platform/auth')
export class PlatformAuthController {
  constructor(
    private readonly auth: PlatformAuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  @Post('login')
  @Public()
  @Throttle({ mutation: AUTH_LIMIT })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'SUPERADMIN — email va parol bilan kirish' })
  async login(
    @Body(new ZodValidationPipe(platformLoginSchema)) body: PlatformLoginInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PlatformAdminDto> {
    const result = await this.auth.login(body, {
      ip: request.ip ?? null,
      userAgent: request.headers['user-agent'] ?? null,
    });

    response.cookie(
      this.config.get('PLATFORM_SESSION_COOKIE_NAME', { infer: true }),
      result.token,
      sessionCookieOptions(this.isProduction, result.expiresAt.getTime() - Date.now()),
    );

    return result.admin;
  }

  @Post('logout')
  @PlatformOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'SUPERADMIN — chiqish' })
  async logout(
    @CurrentPlatformAdmin() admin: PlatformAdminAuth,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(admin.sessionId);

    const cookieName = this.config.get('PLATFORM_SESSION_COOKIE_NAME', { infer: true });
    const { maxAge: _maxAge, ...options } = sessionCookieOptions(this.isProduction, 0);
    response.clearCookie(cookieName, options);
  }

  @Get('me')
  @PlatformOnly()
  @ApiOperation({ summary: 'Joriy SUPERADMIN' })
  me(@CurrentPlatformAdmin() admin: PlatformAdminAuth): PlatformAdminDto {
    return { id: admin.id, email: admin.email, displayName: admin.displayName };
  }

  private get isProduction(): boolean {
    return this.config.get('NODE_ENV', { infer: true }) === 'production';
  }
}
