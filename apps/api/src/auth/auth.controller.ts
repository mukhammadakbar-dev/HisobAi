import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle, seconds } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  UserRole,
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from '@hisobai/contracts';
import type {
  ChangePasswordInput,
  CurrentUserDto,
  ForgotPasswordInput,
  LoginAttemptDto,
  LoginInput,
  ResetPasswordInput,
  SessionDto,
} from '@hisobai/contracts';
import type { Response } from 'express';

import { Public, Roles, ShopExempt } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthedRequest, RequestUser } from '../common/request-user';
import { sessionCookieOptions } from '../common/session-token';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import type { Env } from '../config/env';
import { AuthService, type RequestContext } from './auth.service';

/** `API.md` §6 — auth sinfi: 5 urinish / 15 daqiqa. */
const AUTH_LIMIT = { limit: 5, ttl: seconds(15 * 60) };
/** `API.md` §6 — parol tiklash: 3 / soat (IP bo'yicha). */
const RESET_LIMIT = { limit: 3, ttl: seconds(60 * 60) };

/** Jurnalda ko'rsatiladigan oxirgi urinishlar soni (§2.10). */
const LOGIN_ATTEMPTS_PAGE = 50;

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  // ───────────────────────────── Kirish ─────────────────────────────

  /**
   * `@Public()` — bu tizimga kirishning yagona eshigi.
   *
   * Throttler cheklovi `login_attempts` jadvalidagi blokdan (§2.9)
   * **qo'shimcha**: jadval blokni qayta ishga tushirishdan keyin ham
   * eslab qoladi, throttler esa bir jarayon ichidagi toshqinni to'sadi.
   */
  @Post('login')
  @Public()
  @Throttle({ mutation: AUTH_LIMIT })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Email va parol bilan kirish' })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() request: AuthedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CurrentUserDto> {
    const result = await this.auth.login(body, contextOf(request));

    response.cookie(
      this.config.get('SESSION_COOKIE_NAME', { infer: true }),
      result.token,
      sessionCookieOptions(this.isProduction, result.expiresAt.getTime() - Date.now()),
    );

    return result.user;
  }

  @Post('logout')
  @Roles(UserRole.SHOP_ADMIN)
  @ShopExempt()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Joriy sessiyani yopish' })
  async logout(
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(user.sessionId);

    const cookieName = this.config.get('SESSION_COOKIE_NAME', { infer: true });
    // `maxAge` siz — brauzer cookie'ni darhol o'chirsin
    const { maxAge: _maxAge, ...options } = sessionCookieOptions(this.isProduction, 0);
    response.clearCookie(cookieName, options);
  }

  @Get('me')
  @Roles(UserRole.SHOP_ADMIN)
  @ShopExempt()
  @ApiOperation({ summary: 'Joriy foydalanuvchi' })
  me(@CurrentUser() user: RequestUser): CurrentUserDto {
    // `SessionGuard` allaqachon bazadan o'qigan — ikkinchi so'rov keraksiz
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      theme: user.theme,
      shopId: user.shopId,
    };
  }

  // ─────────────────────────── Sessiyalar ───────────────────────────

  @Get('sessions')
  @Roles(UserRole.SHOP_ADMIN)
  @ShopExempt()
  @ApiOperation({ summary: 'Faol sessiyalar (§2.7)' })
  listSessions(@CurrentUser() user: RequestUser): Promise<SessionDto[]> {
    return this.auth.listSessions(user.id, user.sessionId);
  }

  @Delete('sessions/:id')
  @Roles(UserRole.SHOP_ADMIN)
  @ShopExempt()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Bitta sessiyani bekor qilish' })
  revokeSession(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: AuthedRequest,
  ): Promise<void> {
    return this.auth.revokeSession(user, id, contextOf(request).ip);
  }

  @Delete('sessions')
  @Roles(UserRole.SHOP_ADMIN)
  @ShopExempt()
  @ApiOperation({ summary: 'Joriy qurilmadan tashqari hammasini chiqarish' })
  revokeOtherSessions(
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<{ revoked: number }> {
    return this.auth.revokeOtherSessions(user, contextOf(request).ip);
  }

  @Get('login-attempts')
  @Roles(UserRole.SHOP_ADMIN)
  @ShopExempt()
  @ApiOperation({ summary: 'Kirish jurnali (§2.10)' })
  listLoginAttempts(
    @CurrentUser() user: RequestUser,
    @Query('limit') limit?: string,
  ): Promise<LoginAttemptDto[]> {
    const parsed = Number.parseInt(limit ?? '', 10);
    const take =
      Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 200) : LOGIN_ATTEMPTS_PAGE;
    return this.auth.listLoginAttempts(user, take);
  }

  // ──────────────────────────── Parollar ────────────────────────────

  @Post('change-password')
  @Roles(UserRole.SHOP_ADMIN)
  @ShopExempt()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Parolni o'zgartirish" })
  changePassword(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
    @Req() request: AuthedRequest,
  ): Promise<void> {
    return this.auth.changePassword(user, body, contextOf(request).ip);
  }

  /**
   * Javob har doim 204 — email mavjudligini oshkor qilmaslik uchun
   * (`auth.service.ts` dagi izohga qarang).
   */
  @Post('forgot-password')
  @Public()
  @Throttle({ mutation: RESET_LIMIT })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Parol tiklash havolasini yuborish (§2.5)' })
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
  ): Promise<void> {
    return this.auth.forgotPassword(body.email);
  }

  @Post('reset-password')
  @Public()
  @Throttle({ mutation: RESET_LIMIT })
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Havola bo‘yicha yangi parol o‘rnatish' })
  resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput,
    @Req() request: AuthedRequest,
  ): Promise<void> {
    return this.auth.resetPassword(body.token, body.newPassword, contextOf(request).ip);
  }

  private get isProduction(): boolean {
    return this.config.get('NODE_ENV', { infer: true }) === 'production';
  }
}

/**
 * IP va qurilma — jurnal va sessiya ro'yxati uchun (§2.7, §2.10).
 * `request.ip` `trust proxy` sozlangani uchun haqiqiy client IP'sini beradi.
 */
function contextOf(request: AuthedRequest): RequestContext {
  return {
    ip: request.ip ?? null,
    userAgent: request.headers['user-agent'] ?? null,
  };
}
