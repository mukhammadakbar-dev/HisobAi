import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createShopAdminSchema,
  shopAdminQuerySchema,
  updateShopAdminStatusSchema,
} from '@hisobai/contracts';
import type {
  CreateShopAdminInput,
  Page,
  ShopAdminDto,
  ShopAdminQuery,
  UpdateShopAdminStatusInput,
} from '@hisobai/contracts';
import type { Request } from 'express';

import { PlatformOnly } from '../common/auth.decorators';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CurrentPlatformAdmin } from './current-platform-admin.decorator';
import type { PlatformAdminAuth } from './platform-request';
import { ShopAdminsService } from './shop-admins.service';

/**
 * `/platform/shop-admins` — SUPERADMIN'ning yagona biznes vazifasi
 * (§25.3): SHOP_ADMIN accountlarini yaratish va statusini boshqarish.
 *
 * **Nimaga bu yerda Shop yo'q.** §25.5 — SUPERADMIN Shop yaratmaydi.
 * Ro'yxat va kartada faqat `shopId` ko'rinadi (bor-yo'qligi), Shop
 * nomi yoki boshqa biznes ma'lumoti EMAS — §25.3 chegarasi.
 */
@ApiTags('platform-shop-admins')
@Controller('platform/shop-admins')
export class ShopAdminsController {
  constructor(private readonly shopAdmins: ShopAdminsService) {}

  @Get()
  @PlatformOnly()
  @ApiOperation({ summary: 'SHOP_ADMIN accountlar ro‘yxati' })
  list(
    @Query(new ZodValidationPipe(shopAdminQuerySchema)) query: ShopAdminQuery,
  ): Promise<Page<ShopAdminDto>> {
    return this.shopAdmins.list(query);
  }

  @Get(':id')
  @PlatformOnly()
  @ApiOperation({ summary: 'SHOP_ADMIN account kartasi' })
  getById(@Param('id', ParseUUIDPipe) id: string): Promise<ShopAdminDto> {
    return this.shopAdmins.getById(id);
  }

  @Post()
  @PlatformOnly()
  @ApiOperation({ summary: 'Yangi SHOP_ADMIN account yaratish (§25.5 — Shop’siz)' })
  create(
    @Body(new ZodValidationPipe(createShopAdminSchema)) body: CreateShopAdminInput,
    @CurrentPlatformAdmin() admin: PlatformAdminAuth,
    @Req() request: Request,
  ): Promise<ShopAdminDto> {
    return this.shopAdmins.create(body, admin, request.ip ?? null);
  }

  @Patch(':id/status')
  @PlatformOnly()
  @ApiOperation({ summary: 'Account statusini o‘zgartirish (§21.6, §25.19)' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateShopAdminStatusSchema)) body: UpdateShopAdminStatusInput,
    @CurrentPlatformAdmin() admin: PlatformAdminAuth,
    @Req() request: Request,
  ): Promise<ShopAdminDto> {
    return this.shopAdmins.updateStatus(id, body, admin, request.ip ?? null);
  }
}
