export declare class CreateProductDto {
    category: string;
    brand: string;
    model: string;
    storage?: string;
    color?: string;
    isSerialized?: boolean;
    defaultSalePrice: number;
    minStockAlert?: number;
}
