"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InventoryService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
let InventoryService = class InventoryService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    mapToDto(item) {
        return {
            id: item.id,
            productId: item.productId,
            product: item.product
                ? {
                    id: item.product.id,
                    category: item.product.category,
                    brand: item.product.brand,
                    model: item.product.model,
                    storage: item.product.storage,
                    color: item.product.color,
                    isSerialized: item.product.isSerialized,
                    defaultSalePrice: Number(item.product.defaultSalePrice),
                    minStockAlert: item.product.minStockAlert,
                    createdAt: item.product.createdAt.toISOString(),
                    updatedAt: item.product.updatedAt.toISOString(),
                }
                : undefined,
            imei: item.imei,
            serialNumber: item.serialNumber,
            costPrice: Number(item.costPrice),
            status: item.status,
            receivedAt: item.receivedAt.toISOString(),
            createdAt: item.createdAt.toISOString(),
        };
    }
    async receiveStock(dto) {
        const product = await this.prisma.product.findUnique({
            where: { id: dto.productId },
        });
        if (!product) {
            throw new common_1.NotFoundException('Mahsulot shabloni topilmadi');
        }
        const receivedDate = dto.receivedAt ? new Date(dto.receivedAt) : new Date();
        if (product.isSerialized) {
            const imei = dto.imei?.trim() || null;
            const serialNumber = dto.serialNumber?.trim() || null;
            if (!imei && !serialNumber) {
                throw new common_1.BadRequestException('Seriyali mahsulot uchun IMEI yoki Seriya raqami kiritilishi shart');
            }
            if (imei) {
                const existingImei = await this.prisma.inventoryItem.findFirst({
                    where: { imei },
                });
                if (existingImei) {
                    throw new common_1.ConflictException(`Ushbu IMEI (${imei}) ma'lumotlar bazasida mavjud`);
                }
            }
            if (serialNumber) {
                const existingSerial = await this.prisma.inventoryItem.findFirst({
                    where: { serialNumber },
                });
                if (existingSerial) {
                    throw new common_1.ConflictException(`Ushbu Seriya raqami (${serialNumber}) ma'lumotlar bazasida mavjud`);
                }
            }
            const result = await this.prisma.$transaction(async (tx) => {
                const item = await tx.inventoryItem.create({
                    data: {
                        productId: product.id,
                        imei,
                        serialNumber,
                        costPrice: new client_1.Prisma.Decimal(dto.costPrice),
                        status: client_1.InventoryItemStatus.AVAILABLE,
                        receivedAt: receivedDate,
                    },
                    include: { product: true },
                });
                await tx.stockMovement.create({
                    data: {
                        inventoryItemId: item.id,
                        productId: product.id,
                        type: 'RECEIVE',
                        quantity: 1,
                        referenceType: 'STOCK_RECEIVE',
                        referenceId: item.id,
                    },
                });
                return item;
            });
            return [this.mapToDto(result)];
        }
        else {
            const qty = dto.quantity && dto.quantity > 0 ? dto.quantity : 1;
            const createdItems = await this.prisma.$transaction(async (tx) => {
                const items = [];
                for (let i = 0; i < qty; i++) {
                    const item = await tx.inventoryItem.create({
                        data: {
                            productId: product.id,
                            costPrice: new client_1.Prisma.Decimal(dto.costPrice),
                            status: client_1.InventoryItemStatus.AVAILABLE,
                            receivedAt: receivedDate,
                        },
                        include: { product: true },
                    });
                    items.push(item);
                }
                await tx.stockMovement.create({
                    data: {
                        productId: product.id,
                        type: 'RECEIVE',
                        quantity: qty,
                        referenceType: 'STOCK_RECEIVE_BATCH',
                    },
                });
                return items;
            });
            return createdItems.map((item) => this.mapToDto(item));
        }
    }
    async findAll(status, search) {
        const where = {};
        if (status) {
            where.status = status;
        }
        if (search) {
            const q = search.trim();
            where.OR = [
                { imei: { contains: q, mode: 'insensitive' } },
                { serialNumber: { contains: q, mode: 'insensitive' } },
                { product: { model: { contains: q, mode: 'insensitive' } } },
                { product: { brand: { contains: q, mode: 'insensitive' } } },
                { product: { category: { contains: q, mode: 'insensitive' } } },
            ];
        }
        const items = await this.prisma.inventoryItem.findMany({
            where,
            include: { product: true },
            orderBy: { receivedAt: 'desc' },
        });
        return items.map((item) => this.mapToDto(item));
    }
    async search(query) {
        if (!query || query.trim().length === 0) {
            return [];
        }
        return this.findAll(undefined, query);
    }
    async getLowStockAlerts() {
        const products = await this.prisma.product.findMany();
        const alerts = [];
        for (const product of products) {
            const availableCount = await this.prisma.inventoryItem.count({
                where: {
                    productId: product.id,
                    status: client_1.InventoryItemStatus.AVAILABLE,
                },
            });
            if (availableCount <= product.minStockAlert) {
                alerts.push({
                    product: {
                        id: product.id,
                        category: product.category,
                        brand: product.brand,
                        model: product.model,
                        storage: product.storage,
                        color: product.color,
                        isSerialized: product.isSerialized,
                        defaultSalePrice: Number(product.defaultSalePrice),
                        minStockAlert: product.minStockAlert,
                        createdAt: product.createdAt.toISOString(),
                        updatedAt: product.updatedAt.toISOString(),
                    },
                    availableQuantity: availableCount,
                    minStockAlert: product.minStockAlert,
                });
            }
        }
        return alerts;
    }
};
exports.InventoryService = InventoryService;
exports.InventoryService = InventoryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], InventoryService);
//# sourceMappingURL=inventory.service.js.map