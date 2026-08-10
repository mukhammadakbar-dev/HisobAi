import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import {
  UserRole,
  calendarDate,
  exchangeRateQuerySchema,
  upsertExchangeRateSchema,
} from '@hisobai/contracts';
import type {
  ExchangeRateDto,
  ExchangeRateQuery,
  SyncExchangeRateResultDto,
  TodayExchangeRateDto,
  UpsertExchangeRateInput,
} from '@hisobai/contracts';

import { Roles } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthedRequest, RequestUser } from '../common/request-user';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ExchangeRatesService } from './exchange-rates.service';

/**
 * Valyuta kursi (§3.1–§3.5).
 *
 * `PERMISSIONS.md` — kursni o'zgartirish faqat `OWNER` huquqi: u savdo
 * va to'lovlardagi barcha konvertatsiyaga ta'sir qiladi.
 */
@ApiTags('exchange-rates')
@Controller('exchange-rates')
export class ExchangeRatesController {
  constructor(private readonly rates: ExchangeRatesService) {}

  /**
   * Marshrut tartibi muhim: `today` `:date` dan **oldin** turishi kerak,
   * aks holda u sana deb talqin qilinadi.
   */
  @Get('today')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Bugungi kurs va eskirganlik holati (§16.6)' })
  getToday(): Promise<TodayExchangeRateDto> {
    return this.rates.getToday();
  }

  @Get()
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Kurs tarixi (§3.5)' })
  list(
    @Query(new ZodValidationPipe(exchangeRateQuerySchema)) query: ExchangeRateQuery,
  ): Promise<ExchangeRateDto[]> {
    return this.rates.list(query);
  }

  @Put(':date')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: "Kursni qo'lda qo'yish — source MANUAL bo'ladi (§16.8)" })
  upsert(
    @Param('date', new ZodValidationPipe(calendarDate)) date: string,
    @Body(new ZodValidationPipe(upsertExchangeRateSchema)) body: UpsertExchangeRateInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<ExchangeRateDto> {
    return this.rates.upsertManual(date, body, user, request.ip ?? null);
  }

  /**
   * §18.4 — CBU'dan hozir yangilash.
   *
   * 09:00 dagi cron bilan **bir xil kodni** ishlatadi, farqi faqat
   * boshlovchisida: bu yerda odam bor, shuning uchun §3.10 bo'yicha
   * audit yoziladi.
   *
   * `:date` yo'q — CBU faqat joriy kursni beradi, o'tgan kunga uni
   * yozish soxta tarix bo'lardi (§1.7 kurs snapshot falsafasi).
   *
   * Cheklov qo'yilgan: bu tashqi servisga chiquvchi so'rov, tugmani
   * ketma-ket bosish cbu.uz ga yuk bo'lmasin.
   */
  @Post('sync')
  @Roles(UserRole.OWNER)
  @Throttle({ mutation: { limit: 10, ttl: seconds(5 * 60) } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "CBU'dan kursni hozir olish (§18.4)" })
  sync(
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<SyncExchangeRateResultDto> {
    return this.rates.syncFromCbu({ actor: user, ip: request.ip ?? null });
  }

  /**
   * §16.8 — `PUT :date` ning teskarisi. Usiz `MANUAL` holatidan
   * chiqishning yo'li yo'q edi.
   */
  @Post(':date/reset-to-cbu')
  @Roles(UserRole.OWNER)
  // Yangi resurs yaratmaydi — mavjud qatorni o'zgartiradi, shuning uchun 200
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "CBU kursiga qaytarish — ustama bo'yicha qayta hisoblanadi (§16.8)" })
  resetToCbu(
    @Param('date', new ZodValidationPipe(calendarDate)) date: string,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<ExchangeRateDto> {
    return this.rates.resetToCbu(date, user, request.ip ?? null);
  }
}
