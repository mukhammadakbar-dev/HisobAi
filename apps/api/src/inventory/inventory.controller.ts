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
  batchQuerySchema,
  inventoryQuerySchema,
  movementQuerySchema,
  receiveSchema,
} from '@hisobai/contracts';
import type {
  BatchQuery,
  InventoryBatchDto,
  InventoryItemDetailDto,
  InventoryItemDto,
  InventoryQuery,
  MovementQuery,
  Page,
  ReceiveInput,
  ReceiveResultDto,
  StockMovementDto,
} from '@hisobai/contracts';

import { Idempotent, Roles } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthedRequest, RequestUser } from '../common/request-user';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { InventoryReceivingService } from './inventory-receiving.service';
import { InventoryService } from './inventory.service';

/**
 * Ombor (§5).
 *
 * **Marshrut tartibi muhim:** `batches` va `movements` `:id` dan oldin
 * turadi. Aks holda ular identifikator deb talqin qilinardi va
 * `ParseUUIDPipe` tushunarsiz `400` qaytarardi.
 */
@ApiTags('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly inventory: InventoryService,
    private readonly receiving: InventoryReceivingService,
  ) {}

  @Get()
  @Roles(UserRole.SHOP_ADMIN)
  @ApiOperation({ summary: 'Ombor birliklari — IMEI, seriya yoki nom bo‘yicha (§5.3)' })
  listItems(
    @Query(new ZodValidationPipe(inventoryQuerySchema)) query: InventoryQuery,
  ): Promise<Page<InventoryItemDto>> {
    return this.inventory.listItems(query);
  }

  @Get('batches')
  @Roles(UserRole.SHOP_ADMIN)
  @ApiOperation({ summary: 'Miqdorli mahsulot partiyalari (§5.2)' })
  listBatches(
    @Query(new ZodValidationPipe(batchQuerySchema)) query: BatchQuery,
  ): Promise<Page<InventoryBatchDto>> {
    return this.inventory.listBatches(query);
  }

  @Get('movements')
  @Roles(UserRole.SHOP_ADMIN)
  @ApiOperation({ summary: 'Ombor harakatlari — o‘chirilmaydigan tarix (§5.10)' })
  listMovements(
    @Query(new ZodValidationPipe(movementQuerySchema)) query: MovementQuery,
  ): Promise<Page<StockMovementDto>> {
    return this.inventory.listMovements(query);
  }

  /**
   * §5.11 — bitta tranzaksiya. `Idempotency-Key` majburiy (`API.md` §4.1):
   * javob yo'qolganda ega tugmani qayta bosadi va 50 ta IMEI ikkinchi
   * marta kiritilishi mumkin bo'lardi.
   */
  @Post('receive')
  @Roles(UserRole.SHOP_ADMIN)
  @Idempotent()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Qabul qilish — seriyali birliklar yoki partiya' })
  receive(
    @Body(new ZodValidationPipe(receiveSchema)) body: ReceiveInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<ReceiveResultDto> {
    return this.receiving.receive(body, user, request.ip ?? null);
  }

  @Get(':id')
  @Roles(UserRole.SHOP_ADMIN)
  @ApiOperation({ summary: 'Birlik va uning tarixi (§5.10)' })
  getItem(@Param('id', ParseUUIDPipe) id: string): Promise<InventoryItemDetailDto> {
    return this.inventory.requireItem(id);
  }
}
