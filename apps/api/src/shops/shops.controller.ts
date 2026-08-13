import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole, createShopSchema, updateShopSchema } from '@hisobai/contracts';
import type { CreateShopInput, ShopDto, UpdateShopInput } from '@hisobai/contracts';

import { Roles, ShopExempt } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import { readPrecondition } from '../common/optimistic-lock';
import type { AuthedRequest, RequestUser } from '../common/request-user';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ShopsService } from './shops.service';

/**
 * Do'kon ma'lumoti va sozlamalari (§3.6–§3.10, §21.4).
 *
 * Eski `/settings` → `/shops/me` (§14.7): `me` ataylab — SHOP_ADMIN
 * boshqa Shop'ning `id`sini so'rovda yubora olmaydi (§25.13), backend
 * uni sessiyadan (`request.user.shopId`) oladi.
 *
 * `PERMISSIONS.md` P2 — mass assignment himoyasi sxemadagi `.strict()`
 * bilan: `id`, `logoFileId` va `updatedById` yuborilsa so'rov rad
 * etiladi, jimgina e'tiborsiz qoldirilmaydi.
 */
@ApiTags('shops')
@Controller('shops')
export class ShopsController {
  constructor(private readonly shops: ShopsService) {}

  /**
   * §25.6, §25.7 — SHOP_ADMIN o'ziga Shop yaratadi.
   *
   * `@ShopExempt()` MAJBURIY: bu chaqiruv paytida `actor.shopId === null`
   * (Shop hali yo'q — buni yaratish uchun chaqirilyapti). `@ShopExempt()`
   * bo'lmasa `RolesGuard` bu yerga hech qachon yetib kelmagan bo'lardi —
   * `SHOP_SETUP_REQUIRED` bilan aynan shu endpointning o'zini to'sib
   * qo'yardi (`roles.guard.spec.ts`dagi "Shop'siz account" mantiqi).
   *
   * SUPERADMIN bu endpointni chaqira olmaydi (§25.5) — bu `@Roles(SHOP_ADMIN)`
   * bilan avtomatik ta'minlangan: SUPERADMIN business `users` jadvalida
   * umuman yo'q (§21.3), ya'ni `request.user` uning uchun hech qachon
   * to'ldirilmaydi.
   */
  @Post()
  @Roles(UserRole.SHOP_ADMIN)
  @ShopExempt()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Do'kon yaratish — 1 SHOP_ADMIN = 1 SHOP (§25.7)" })
  create(
    @Body(new ZodValidationPipe(createShopSchema)) body: CreateShopInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<ShopDto> {
    return this.shops.createShop(user, body, request.ip ?? null);
  }

  @Get('me')
  @Roles(UserRole.SHOP_ADMIN)
  @ApiOperation({ summary: "Do'kon ma'lumoti va sozlamalari" })
  get(): Promise<ShopDto> {
    return this.shops.get();
  }

  /**
   * Optimistik qulf majburiy (`API.md` §8) — token so'rovdan shu yerda
   * ajratiladi: u HTTP tafsiloti (body yoki sarlavha), servis esa faqat
   * "qaysi holat kutilgan" degan domen faktini oladi.
   */
  @Patch('me')
  @Roles(UserRole.SHOP_ADMIN)
  @ApiOperation({ summary: "Do'konni o'zgartirish (audit bilan)" })
  update(
    @CurrentUser() user: RequestUser,
    @Body(new ZodValidationPipe(updateShopSchema)) body: UpdateShopInput,
    @Req() request: AuthedRequest,
  ): Promise<ShopDto> {
    const precondition = readPrecondition(request, body.expectedUpdatedAt);
    return this.shops.update(user, body, precondition, request.ip ?? null);
  }
}
