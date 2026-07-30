import { PrismaService } from '../prisma/prisma.service';
import { ReceiveStockDto } from './dto/receive-stock.dto';
import { InventoryItemDto, LowStockAlertDto } from '@baraka/contracts';
import { InventoryItemStatus } from '@prisma/client';
export declare class InventoryService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private mapToDto;
    receiveStock(dto: ReceiveStockDto): Promise<InventoryItemDto[]>;
    findAll(status?: InventoryItemStatus, search?: string): Promise<InventoryItemDto[]>;
    search(query: string): Promise<InventoryItemDto[]>;
    getLowStockAlerts(): Promise<LowStockAlertDto[]>;
}
