import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ConfirmSaleDto } from './dto/confirm-sale.dto';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import { AdminProfile, SaleDto, SaleStatus } from '@baraka/contracts';

@ApiTags('Sales')
@Controller('sales')
@UseGuards(AuthGuard)
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post()
  @ApiOperation({ summary: 'Yangi savdo draftini yaratish' })
  async createDraft(@Body() dto: CreateSaleDto): Promise<SaleDto> {
    return this.salesService.createDraft(dto);
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Savdoni tasdiqlash (Atomik tranzaksiya)' })
  async confirm(
    @Param('id') id: string,
    @Body() dto: ConfirmSaleDto,
    @CurrentAdmin() admin: AdminProfile,
  ): Promise<SaleDto> {
    return this.salesService.confirm(id, dto, admin.id);
  }

  @Post(':id/reverse')
  @ApiOperation({ summary: 'Tasdiqlangan savdoni bekor qilish / qaytarish' })
  async reverse(
    @Param('id') id: string,
    @CurrentAdmin() admin: AdminProfile,
  ): Promise<SaleDto> {
    return this.salesService.reverse(id, admin.id);
  }

  @Get()
  @ApiOperation({ summary: 'Savdolar ro\'yxatini olish' })
  @ApiQuery({ name: 'customerId', required: false })
  @ApiQuery({ name: 'status', required: false, enum: SaleStatus })
  async findAll(
    @Query('customerId') customerId?: string,
    @Query('status') status?: SaleStatus,
  ): Promise<SaleDto[]> {
    return this.salesService.findAll(customerId, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Bitta savdo tafsilotlarini olish' })
  async findOne(@Param('id') id: string): Promise<SaleDto> {
    return this.salesService.findOne(id);
  }
}
