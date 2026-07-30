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
exports.CatalogService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
let CatalogService = class CatalogService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    mapToDto(product) {
        return {
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
        };
    }
    async create(createProductDto) {
        const product = await this.prisma.product.create({
            data: {
                category: createProductDto.category.trim(),
                brand: createProductDto.brand.trim(),
                model: createProductDto.model.trim(),
                storage: createProductDto.storage?.trim() || null,
                color: createProductDto.color?.trim() || null,
                isSerialized: createProductDto.isSerialized ?? true,
                defaultSalePrice: new client_1.Prisma.Decimal(createProductDto.defaultSalePrice),
                minStockAlert: createProductDto.minStockAlert ?? 2,
            },
        });
        return this.mapToDto(product);
    }
    async findAll(category, brand) {
        const where = {};
        if (category)
            where.category = { equals: category, mode: 'insensitive' };
        if (brand)
            where.brand = { equals: brand, mode: 'insensitive' };
        const products = await this.prisma.product.findMany({
            where,
            orderBy: [{ category: 'asc' }, { brand: 'asc' }, { model: 'asc' }],
        });
        return products.map((p) => this.mapToDto(p));
    }
    async findOne(id) {
        const product = await this.prisma.product.findUnique({
            where: { id },
        });
        if (!product) {
            throw new common_1.NotFoundException('Mahsulot shabloni topilmadi');
        }
        return this.mapToDto(product);
    }
};
exports.CatalogService = CatalogService;
exports.CatalogService = CatalogService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CatalogService);
//# sourceMappingURL=catalog.service.js.map