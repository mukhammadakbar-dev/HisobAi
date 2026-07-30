import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ example: 'Telefonlar', description: 'Mahsulot kategoriyasi' })
  @IsString()
  @IsNotEmpty({ message: 'Kategoriya kiritilishi shart' })
  category!: string;

  @ApiProperty({ example: 'Apple', description: 'Mahsulot brendi' })
  @IsString()
  @IsNotEmpty({ message: 'Brend kiritilishi shart' })
  brand!: string;

  @ApiProperty({ example: 'iPhone 15 Pro', description: 'Mahsulot modeli' })
  @IsString()
  @IsNotEmpty({ message: 'Model kiritilishi shart' })
  model!: string;

  @ApiPropertyOptional({ example: '256GB', description: 'Xotira hachmi' })
  @IsOptional()
  @IsString()
  storage?: string;

  @ApiPropertyOptional({ example: 'Titanium Blue', description: 'Rangi' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiPropertyOptional({ example: true, description: 'IMEI/Serial raqamli seriyali mahsulot' })
  @IsOptional()
  @IsBoolean()
  isSerialized?: boolean;

  @ApiProperty({ example: 12500000, description: 'Tavsiya etilgan sotuv narxi (UZS)' })
  @IsNumber({}, { message: 'Sotuv narxi raqam bo\'lishi kerak' })
  @Min(0, { message: 'Sotuv narxi manfiy bo\'lishi mumkin emas' })
  defaultSalePrice!: number;

  @ApiPropertyOptional({ example: 2, description: 'Zaxiradagi minimal chegaraviy limit soni' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  minStockAlert?: number;
}
