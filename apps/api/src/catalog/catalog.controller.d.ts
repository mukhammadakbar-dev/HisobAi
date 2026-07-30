import { CatalogService } from './catalog.service';
import { CreateProductDto } from './dto/create-product.dto';
import { ProductDto } from '@baraka/contracts';
export declare class CatalogController {
    private readonly catalogService;
    constructor(catalogService: CatalogService);
    create(createProductDto: CreateProductDto): Promise<ProductDto>;
    findAll(category?: string, brand?: string): Promise<ProductDto[]>;
    findOne(id: string): Promise<ProductDto>;
}
