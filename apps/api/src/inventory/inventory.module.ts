import { Module } from '@nestjs/common';

import { InventoryReceivingService } from './inventory-receiving.service';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

/**
 * Ombor (§5).
 *
 * O'qish va yozish ikki servisga ajratilgan: `InventoryService` — sof
 * `findMany`, `InventoryReceivingService` — tranzaksion qabul qilish.
 * Ajratish ataylab: savdo, tuzatish va inventarizatsiya qo'shilganda
 * yozish tomoni o'sadi, o'qish esa deyarli o'zgarmaydi.
 */
@Module({
  controllers: [InventoryController],
  providers: [InventoryService, InventoryReceivingService],
  exports: [InventoryService],
})
export class InventoryModule {}
