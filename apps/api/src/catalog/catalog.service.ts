import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductDto } from '@baraka/contracts';
import { Prisma } from '@prisma/client';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  private mapToDto(product: any): ProductDto {
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

  async create(createProductDto: CreateProductDto): Promise<ProductDto> {
    const product = await this.prisma.product.create({
      data: {
        category: createProductDto.category.trim(),
        brand: createProductDto.brand.trim(),
        model: createProductDto.model.trim(),
        storage: createProductDto.storage?.trim() || null,
        color: createProductDto.color?.trim() || null,
        isSerialized: createProductDto.isSerialized ?? true,
        defaultSalePrice: new Prisma.Decimal(createProductDto.defaultSalePrice),
        minStockAlert: createProductDto.minStockAlert ?? 2,
      },
    });

    return this.mapToDto(product);
  }

  async findAll(category?: string, brand?: string): Promise<ProductDto[]> {
    const where: any = {};
    if (category) where.category = { equals: category, mode: 'insensitive' };
    if (brand) where.brand = { equals: brand, mode: 'insensitive' };

    const products = await this.prisma.product.findMany({
      where,
      orderBy: [{ category: 'asc' }, { brand: 'asc' }, { model: 'asc' }],
    });

    return products.map((p) => this.mapToDto(p));
  }

  async findOne(id: string): Promise<ProductDto> {
    const product = await this.prisma.product.findUnique({
      where: { id },
    });

    if (!product) {
      throw new NotFoundException('Mahsulot shabloni topilmadi');
    }

    return this.mapToDto(product);
  }
}
