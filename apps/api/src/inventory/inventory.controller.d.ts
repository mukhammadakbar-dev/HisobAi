import { InventoryService } from './inventory.service';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { InventoryItemDto, LowStockAlertDto } from '@baraka/contracts';
import { InventoryItemStatus } from '@prisma/client';
export declare class InventoryController {
    private readonly inventoryService;
    constructor(inventoryService: InventoryService);
    receiveStock(dto: ReceiveStockDto): Promise<InventoryItemDto[]>;
    findAll(status?: InventoryItemStatus, search?: string): Promise<InventoryItemDto[]>;
    search(query: string): Promise<InventoryItemDto[]>;
    getLowStockAlerts(): Promise<LowStockAlertDto[]>;
}
