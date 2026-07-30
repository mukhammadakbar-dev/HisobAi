import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductDto } from '@baraka/contracts';
export declare class CatalogService {
    private readonly prisma;
    constructor(prisma: PrismaService);
    private mapToDto;
    create(createProductDto: CreateProductDto): Promise<ProductDto>;
    findAll(category?: string, brand?: string): Promise<ProductDto[]>;
    findOne(id: string): Promise<ProductDto>;
}
