import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsArray,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SaleKind } from '@baraka/contracts';

export class CreateSaleItemDto {
  @ApiPropertyOptional({ example: 'uuid-inventory-item-id', description: 'Seriyali mahsulot ombor birligi ID si' })
  @IsOptional()
  @IsString()
  inventoryItemId?: string;

  @ApiProperty({ example: 'uuid-product-id', description: 'Mahsulot shabloni ID si' })
  @IsString()
  @IsNotEmpty({ message: 'Mahsulot kiritilishi shart' })
  productId!: string;

  @ApiProperty({ example: 1, description: 'Miqdori' })
  @IsNumber()
  @Min(1)
  quantity!: number;

  @ApiProperty({ example: 12500000, description: 'Sotuv birlik narxi (UZS)' })
  @IsNumber()
  @Min(0)
  unitPrice!: number;
}

export class CreateSaleDto {
  @ApiPropertyOptional({ example: 'uuid-customer-id', description: 'Mijoz ID si (Nasiyada majburiy)' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({ enum: SaleKind, example: SaleKind.CASH, description: 'Savdo turi: CASH, INSTALLMENT, MIXED' })
  @IsEnum(SaleKind)
  kind!: SaleKind;

  @ApiPropertyOptional({ example: 500000, description: 'Chegirma summasi (UZS)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discount?: number;

  @ApiProperty({ type: [CreateSaleItemDto], description: 'Savdo elementlari' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items!: CreateSaleItemDto[];
}
