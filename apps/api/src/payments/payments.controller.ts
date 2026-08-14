import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  UserRole,
  createPaymentSchema,
  paymentQuerySchema,
  rejectPaymentSchema,
  reversePaymentSchema,
} from '@hisobai/contracts';
import type {
  CreatePaymentInput,
  Page,
  PaymentDto,
  PaymentQuery,
  RejectPaymentInput,
  ReversePaymentInput,
} from '@hisobai/contracts';

import { Idempotent, Roles } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthedRequest, RequestUser } from '../common/request-user';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { PaymentsService } from './payments.service';

/**
 * Nasiya to'lovlari (§10, §12).
 *
 * Uchala o'zgartiruvchi amal ham `@Idempotent()` (`API.md` §4.1):
 * telefon internetida javob yo'qolishi oddiy hol va ega tugmani qayta
 * bosadi. Kalitsiz ikkinchi so'rov ikkinchi to'lovni yaratardi —
 * kassaga ikki barobar pul tushib, qarz esa ikki marta kamayardi.
 *
 * `PATCH /payments/:id` **yo'q**: tasdiqlangan to'lov o'zgartirilmaydi,
 * faqat qaytariladi (§11.7, §10.6). Bu savdo bilan bir xil qoida —
 * moliyaviy yozuv tahrirlanmaydi, ustiga teskarisi qo'shiladi.
 */
@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Get()
  @Roles(UserRole.SHOP_ADMIN)
  @ApiOperation({ summary: 'To‘lovlar ro‘yxati' })
  list(
    @Query(new ZodValidationPipe(paymentQuerySchema)) query: PaymentQuery,
  ): Promise<Page<PaymentDto>> {
    return this.payments.list(query);
  }

  @Get(':id')
  @Roles(UserRole.SHOP_ADMIN)
  @ApiOperation({ summary: 'To‘lov kartasi' })
  getPayment(@Param('id', ParseUUIDPipe) id: string): Promise<PaymentDto> {
    return this.payments.requireById(id);
  }

  /** §10 — qabul qilish, taqsimlash va kassa kirimi bitta tranzaksiyada. */
  @Post()
  @Roles(UserRole.SHOP_ADMIN)
  @Idempotent()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'To‘lov qabul qilish (§10)' })
  create(
    @Body(new ZodValidationPipe(createPaymentSchema)) body: CreatePaymentInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<PaymentDto> {
    return this.payments.create(body, user, request.ip ?? null);
  }

  /** §12 — o'tkazma pul kelgani aniqlangach tasdiqlanadi. */
  @Post(':id/confirm')
  @Roles(UserRole.SHOP_ADMIN)
  @Idempotent()
  @ApiOperation({ summary: 'O‘tkazmani tasdiqlash (§12)' })
  confirm(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<PaymentDto> {
    return this.payments.confirm(id, user, request.ip ?? null);
  }

  /** §12 — pul kelmadi; moliyaviy hisobga umuman kirmaydi. */
  @Post(':id/reject')
  @Roles(UserRole.SHOP_ADMIN)
  @Idempotent()
  @ApiOperation({ summary: 'To‘lovni rad etish (§12)' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rejectPaymentSchema)) body: RejectPaymentInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<PaymentDto> {
    return this.payments.reject(id, body, user, request.ip ?? null);
  }

  /** §10.6 — teskari kassa yozuvi va qarzning tiklanishi. */
  @Post(':id/reverse')
  @Roles(UserRole.SHOP_ADMIN)
  @Idempotent()
  @ApiOperation({ summary: 'Tasdiqlangan to‘lovni qaytarish (§10.6)' })
  reverse(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reversePaymentSchema)) body: ReversePaymentInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<PaymentDto> {
    return this.payments.reverse(id, body, user, request.ip ?? null);
  }
}
