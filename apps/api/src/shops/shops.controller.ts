import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole, updateShopSchema } from '@hisobai/contracts';
import type { ShopDto, UpdateShopInput } from '@hisobai/contracts';

import { Roles } from '../common/auth.decorators';
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
