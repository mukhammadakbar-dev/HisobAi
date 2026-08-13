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
  cashEntryQuerySchema,
  cashExchangeSchema,
  createCashAccountSchema,
  createCashCategorySchema,
  createCashEntrySchema,
  openingBalanceSchema,
  updateCashAccountSchema,
  updateCashEntrySchema,
} from '@hisobai/contracts';
import type {
  CashAccountDto,
  CashBalanceDto,
  CashCategoryDto,
  CashEntryDto,
  CashEntryQuery,
  CashExchangeDto,
  CashExchangeInput,
  CreateCashAccountInput,
  CreateCashCategoryInput,
  CreateCashEntryInput,
  OpeningBalanceInput,
  Page,
  UpdateCashAccountInput,
  UpdateCashEntryInput,
} from '@hisobai/contracts';

import { Idempotent, Roles } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import { readPrecondition } from '../common/optimistic-lock';
import type { AuthedRequest, RequestUser } from '../common/request-user';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CashAccountsService } from './cash-accounts.service';
import { CashEntriesService } from './cash-entries.service';

/**
 * Kassa (§11).
 *
 * Uchta marshrut guruhi ARCHITECTURE §8 dagi ro'yxatga mos:
 * `/cash-accounts`, `/cash-categories`, `/cash-entries` va
 * `/cashbook/*`.
 *
 * Moliyaviy `POST` lar `@Idempotent()` (§17.6): do'kondagi internet
 * uzilganda ega tugmani qayta bosadi va bitta xarajat ikki marta
 * yozilib qolardi.
 *
 * `PERMISSIONS.md` §2 — kassa `SELLER` ga butunlay yopiq, shuning uchun
 * barcha marshrutlar `OWNER` uchun.
 */
@ApiTags('cash')
@Controller()
export class CashController {
  constructor(
    private readonly accounts: CashAccountsService,
    private readonly entries: CashEntriesService,
  ) {}

  // ──────────────────────────── Hisoblar ────────────────────────────

  @Get('cash-accounts')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Kassa hisoblari (§11.1)' })
  listAccounts(@Query('includeInactive') includeInactive?: string): Promise<CashAccountDto[]> {
    return this.accounts.listAccounts(includeInactive === 'true');
  }

  @Post('cash-accounts')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yangi kassa hisobi (§11.2)' })
  createAccount(
    @Body(new ZodValidationPipe(createCashAccountSchema)) body: CreateCashAccountInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<CashAccountDto> {
    return this.accounts.createAccount(body, user, request.ip ?? null);
  }

  @Patch('cash-accounts/:id')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Hisob nomi, tartibi yoki yopilishi' })
  updateAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCashAccountSchema)) body: UpdateCashAccountInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<CashAccountDto> {
    const precondition = readPrecondition(request, body.expectedUpdatedAt);
    return this.accounts.updateAccount(id, body, precondition, user, request.ip ?? null);
  }

  // ──────────────────────────── Kategoriyalar ────────────────────────────

  @Get('cash-categories')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Kirim-chiqim kategoriyalari (§11.10)' })
  listCategories(): Promise<CashCategoryDto[]> {
    return this.accounts.listCategories();
  }

  @Post('cash-categories')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Yangi kategoriya' })
  createCategory(
    @Body(new ZodValidationPipe(createCashCategorySchema)) body: CreateCashCategoryInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<CashCategoryDto> {
    return this.accounts.createCategory(body, user, request.ip ?? null);
  }

  // ──────────────────────────── Yozuvlar ────────────────────────────

  @Get('cash-entries')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Kassa yozuvlari (§11.9)' })
  listEntries(
    @Query(new ZodValidationPipe(cashEntryQuerySchema)) query: CashEntryQuery,
  ): Promise<Page<CashEntryDto>> {
    return this.entries.list(query);
  }

  @Post('cash-entries')
  @Roles(UserRole.OWNER)
  @Idempotent()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Qo'lda kirim yoki chiqim (§11.9)" })
  createEntry(
    @Body(new ZodValidationPipe(createCashEntrySchema)) body: CreateCashEntryInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<CashEntryDto> {
    return this.entries.create(body, user, request.ip ?? null);
  }

  @Patch('cash-entries/:id')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: "Qo'lda yozuvni tuzatish — faqat o'sha kuni (§11.8)" })
  updateEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCashEntrySchema)) body: UpdateCashEntryInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<CashEntryDto> {
    const precondition = readPrecondition(request, body.expectedUpdatedAt);
    return this.entries.update(id, body, precondition, user, request.ip ?? null);
  }

  @Delete('cash-entries/:id')
  @Roles(UserRole.OWNER)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Qo'lda yozuvni o'chirish — faqat o'sha kuni (§11.8)" })
  async removeEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<void> {
    await this.entries.remove(id, user, request.ip ?? null);
  }

  // ──────────────────────────── Kassa kitobi ────────────────────────────

  @Get('cashbook/balances')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Hisoblar bo‘yicha qoldiq (§11.3)' })
  balances(@Query('includeInactive') includeInactive?: string): Promise<CashBalanceDto[]> {
    return this.accounts.listBalances(includeInactive === 'true');
  }

  /**
   * §11.4 — boshlang'ich qoldiq.
   *
   * Oddiy kirimdan alohida marshrut: u daromad emas va har hisob uchun
   * bir marta bo'ladi. `POST /cash-entries` ga bayroq sifatida
   * qo'shilsa, "bu yozuv daromadmi?" degan savol client tomonida hal
   * qilinardi — hisobot to'g'riligi esa serverning javobgarligi.
   */
  @Post('cashbook/opening-balance')
  @Roles(UserRole.OWNER)
  @Idempotent()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Boshlang'ich qoldiq — har hisob uchun bir marta (§11.4)" })
  openingBalance(
    @Body(new ZodValidationPipe(openingBalanceSchema)) body: OpeningBalanceInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<CashEntryDto> {
    return this.entries.setOpeningBalance(body, user, request.ip ?? null);
  }

  @Post('cashbook/exchange')
  @Roles(UserRole.OWNER)
  @Idempotent()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Valyuta ayirboshlash (§11.6)' })
  exchange(
    @Body(new ZodValidationPipe(cashExchangeSchema)) body: CashExchangeInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<CashExchangeDto> {
    return this.entries.exchange(body, user, request.ip ?? null);
  }
}
