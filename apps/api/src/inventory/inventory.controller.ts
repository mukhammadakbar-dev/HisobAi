import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { AuthGuard } from '../auth/auth.guard';
import { InventoryItemDto, LowStockAlertDto } from '@baraka/contracts';
import { InventoryItemStatus } from '@prisma/client';

@ApiTags('Inventory')
@Controller('inventory')
@UseGuards(AuthGuard)
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('receive')
  @ApiOperation({ summary: 'Omborga yangi mahsulot birligini qabul qilish' })
  @ApiResponse({ status: 201, description: 'Mahsulot omborga qabul qilindi' })
  async receiveStock(@Body() dto: ReceiveStockDto): Promise<InventoryItemDto[]> {
    return this.inventoryService.receiveStock(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Ombordagi mahsulot birliklari va qoldiqlarini olish' })
  @ApiQuery({ name: 'status', enum: InventoryItemStatus, required: false })
  @ApiQuery({ name: 'search', required: false })
  async findAll(
    @Query('status') status?: InventoryItemStatus,
    @Query('search') search?: string,
  ): Promise<InventoryItemDto[]> {
    return this.inventoryService.findAll(status, search);
  }

  @Get('search')
  @ApiOperation({ summary: 'IMEI, Seriya yoki nom bo\'yicha tezkor qidirish' })
  @ApiQuery({ name: 'q', required: true })
  async search(@Query('q') query: string): Promise<InventoryItemDto[]> {
    return this.inventoryService.search(query);
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'Kam qolgan mahsulotlar ro\'yxati va ogohlantirishlar' })
  async getLowStockAlerts(): Promise<LowStockAlertDto[]> {
    return this.inventoryService.getLowStockAlerts();
  }
}
