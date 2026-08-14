import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  UserRole,
  cancelSaleSchema,
  confirmSaleSchema,
  createSaleDraftSchema,
  returnSaleSchema,
  saleQuerySchema,
  updateSaleDraftSchema,
} from '@hisobai/contracts';
import type {
  CancelSaleInput,
  ConfirmSaleInput,
  CreateSaleDraftInput,
  Page,
  ReturnSaleInput,
  SaleDto,
  SaleQuery,
  SaleSummaryDto,
  UpdateSaleDraftInput,
} from '@hisobai/contracts';

import { Idempotent, Roles } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import { readPrecondition } from '../common/optimistic-lock';
import type { AuthedRequest, RequestUser } from '../common/request-user';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { SaleConfirmationService } from './sale-confirmation.service';
import { SaleReversalService } from './sale-reversal.service';
import { SalesService } from './sales.service';

/**
 * Savdo (§7).
 *
 * `POST /sales/:id/confirm` — yagona `@Idempotent()` marshrut bo'lishi
 * shart emas, lekin eng muhimi: javob yo'qolganda ega tugmani qayta
 * bosadi va ikkinchi savdo ombordan yana bitta telefonni yechib
 * ketardi (§17.6).
 *
 * `POST /sales/:id/return` va `/cancel` — 7-bosqich (§8, §10). Umumiy
 * `POST /sales/:id/reverse` ataylab yo'q (`ARCHITECTURE.md` §14.5):
 * qaytarish va bekor qilish biznes ma'nosi jihatidan boshqa amallar.
 */
@ApiTags('sales')
@Controller('sales')
export class SalesController {
  constructor(
    private readonly sales: SalesService,
    private readonly confirmation: SaleConfirmationService,
    private readonly reversal: SaleReversalService,
  ) {}

  @Get()
  @Roles(UserRole.SHOP_ADMIN)
  @ApiOperation({ summary: 'Savdolar ro‘yxati' })
  list(
    @Query(new ZodValidationPipe(saleQuerySchema)) query: SaleQuery,
  ): Promise<Page<SaleSummaryDto>> {
    return this.sales.list(query);
  }

  @Post()
  @Roles(UserRole.SHOP_ADMIN)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Qoralama yaratish (§7.7)' })
  createDraft(
    @Body(new ZodValidationPipe(createSaleDraftSchema)) body: CreateSaleDraftInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<SaleDto> {
    return this.sales.createDraft(body, user, request.ip ?? null);
  }

  @Get(':id')
  @Roles(UserRole.SHOP_ADMIN)
  @ApiOperation({ summary: 'Savdo kartasi' })
  getSale(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<SaleDto> {
    return this.sales.requireById(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.SHOP_ADMIN)
  @ApiOperation({ summary: 'Qoralamani yangilash — savat almashtiriladi' })
  updateDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSaleDraftSchema)) body: UpdateSaleDraftInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<SaleDto> {
    const precondition = readPrecondition(request, body.expectedUpdatedAt);
    return this.sales.updateDraft(id, body, precondition, user, request.ip ?? null);
  }

  @Delete(':id')
  @Roles(UserRole.SHOP_ADMIN)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Qoralamani o‘chirish (§7.7)' })
  async removeDraft(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<void> {
    await this.sales.removeDraft(id, user, request.ip ?? null);
  }

  /** §7 — bitta tranzaksiya: ombor, raqam, to'lov, kassa, audit. */
  @Post(':id/confirm')
  @Roles(UserRole.SHOP_ADMIN)
  @Idempotent()
  @ApiOperation({ summary: 'Savdoni tasdiqlash (ARCHITECTURE §6)' })
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(confirmSaleSchema)) body: ConfirmSaleInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<SaleDto> {
    return this.confirmation.confirm(id, body, user, request.ip ?? null);
  }

  /**
   * §8 — mahsulot qaytib keldi. Javob **asl savdo** kartasi: qaytarish
   * uni o'zgartiradi (status, qaytarilgan miqdor) va foydalanuvchi
   * o'sha ekranda qoladi.
   */
  @Post(':id/return')
  @Roles(UserRole.SHOP_ADMIN)
  @Idempotent()
  @ApiOperation({ summary: 'Qaytarish — qisman ham (§8.4)' })
  returnSale(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(returnSaleSchema)) body: ReturnSaleInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<SaleDto> {
    return this.reversal.returnSale(id, body, user, request.ip ?? null);
  }

  /** §16.5 — faqat oxirgi 7 kun ichidagi savdolarga. */
  @Post(':id/cancel')
  @Roles(UserRole.SHOP_ADMIN)
  @Idempotent()
  @ApiOperation({ summary: 'Bekor qilish (§16.5)' })
  cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelSaleSchema)) body: CancelSaleInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<SaleDto> {
    return this.reversal.cancel(id, body, user, request.ip ?? null);
  }
}
