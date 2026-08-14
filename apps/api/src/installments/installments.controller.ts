import {
  Body,
  Controller,
  Get,
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
  closeContractSchema,
  installmentQuerySchema,
  rebuildScheduleSchema,
} from '@hisobai/contracts';
import type {
  CloseContractInput,
  InstallmentContractDto,
  InstallmentQuery,
  InstallmentSummaryDto,
  Page,
  PaymentDto,
  RebuildScheduleInput,
} from '@hisobai/contracts';

import { Idempotent, Roles } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthedRequest, RequestUser } from '../common/request-user';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { InstallmentsService } from './installments.service';

/**
 * Nasiya shartnomalari (§9).
 *
 * `POST /installments` **yo'q**: shartnoma savdo tasdiqlanganda o'sha
 * tranzaksiya ichida yaratiladi (§9.1). Alohida endpoint bo'lsa,
 * shartnomasiz nasiya savdo yaratish yo'li ochilib qolardi.
 *
 * `DELETE` ham yo'q — shartnoma o'chirilmaydi: savdo qaytarilganda u
 * `CANCELLED` bo'ladi (§17.18).
 */
@ApiTags('installments')
@Controller('installments')
export class InstallmentsController {
  constructor(private readonly installments: InstallmentsService) {}

  @Get()
  @Roles(UserRole.SHOP_ADMIN)
  @ApiOperation({ summary: 'Shartnomalar (qarzdorlar) ro‘yxati' })
  list(
    @Query(new ZodValidationPipe(installmentQuerySchema)) query: InstallmentQuery,
  ): Promise<Page<InstallmentSummaryDto>> {
    return this.installments.list(query);
  }

  @Get(':id')
  @Roles(UserRole.SHOP_ADMIN)
  @ApiOperation({ summary: 'Shartnoma kartasi va to‘lov jadvali' })
  getContract(@Param('id', ParseUUIDPipe) id: string): Promise<InstallmentContractDto> {
    return this.installments.requireById(id);
  }

  /** §9.10, §9.11 — faqat to'lanmagan qatorlar; umumiy qarz o'zgarmaydi. */
  @Patch(':id/schedule')
  @Roles(UserRole.SHOP_ADMIN)
  @Idempotent()
  @ApiOperation({ summary: 'Jadvalni qayta tuzish (§9.10)' })
  rebuildSchedule(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rebuildScheduleSchema)) body: RebuildScheduleInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<InstallmentContractDto> {
    return this.installments.rebuildSchedule(id, body, user, request.ip ?? null);
  }

  /**
   * §9.12 — erta yopish. Javob **to'lov kartasi**: amal qolgan qarzni
   * to'lash bilan bajariladi va foydalanuvchi aynan shu to'lovni
   * ko'rishi kerak (kassaga qancha tushgani).
   */
  @Post(':id/close')
  @Roles(UserRole.SHOP_ADMIN)
  @Idempotent()
  @ApiOperation({ summary: 'Erta yopish (§9.12)' })
  close(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(closeContractSchema)) body: CloseContractInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<PaymentDto> {
    return this.installments.close(id, body, user, request.ip ?? null);
  }
}
