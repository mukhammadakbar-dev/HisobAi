import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CashbookService } from './cashbook.service';
import { CreateCashEntryDto } from './dto/create-cash-entry.dto';
import { CreateCashCategoryDto } from './dto/create-cash-category.dto';
import { QueryCashEntriesDto } from './dto/query-cash-entries.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import { AdminProfile, CashCategoryDto, CashEntryDto } from '@baraka/contracts';
import { CashDirection } from '@prisma/client';

@ApiTags('Cashbook & Kassa')
@Controller()
@UseGuards(AuthGuard)
export class CashbookController {
  constructor(private readonly cashbookService: CashbookService) {}

  @Get('cash-categories')
  @ApiOperation({ summary: 'Kassa kategoriyalari ro\'yxatini olish' })
  @ApiQuery({ name: 'direction', required: false, enum: CashDirection })
  async getCategories(
    @Query('direction') direction?: CashDirection,
  ): Promise<CashCategoryDto[]> {
    return this.cashbookService.getCategories(direction);
  }

  @Post('cash-categories')
  @ApiOperation({ summary: 'Yangi kassa kategoriyasini yaratish' })
  async createCategory(
    @Body() dto: CreateCashCategoryDto,
    @CurrentAdmin() admin: AdminProfile,
  ): Promise<CashCategoryDto> {
    return this.cashbookService.createCategory(dto, admin.id);
  }

  @Get('cash-entries')
  @ApiOperation({ summary: 'Kassa amallari (kirim/chiqim) ro\'yxatini olish' })
  async getEntries(@Query() query: QueryCashEntriesDto): Promise<CashEntryDto[]> {
    return this.cashbookService.getEntries(query);
  }

  @Post('cash-entries')
  @ApiOperation({ summary: 'Qo\'lda yangi kassa yozuvini (kirim/chiqim) yaratish' })
  async createEntry(
    @Body() dto: CreateCashEntryDto,
    @CurrentAdmin() admin: AdminProfile,
  ): Promise<CashEntryDto> {
    return this.cashbookService.createEntry(dto, admin.id);
  }
}
