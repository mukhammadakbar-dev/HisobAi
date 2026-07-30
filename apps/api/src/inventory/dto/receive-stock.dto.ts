import { IsString, IsNotEmpty, IsOptional, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReceiveStockDto {
  @ApiProperty({ example: 'uuid-product-id', description: 'Mahsulot shabloni ID si' })
  @IsString()
  @IsNotEmpty({ message: 'Mahsulot tanlanishi shart' })
  productId!: string;

  @ApiPropertyOptional({ example: '864201061234567', description: 'IMEI raqami (seriyali mahsulot uchun)' })
  @IsOptional()
  @IsString()
  imei?: string;

  @ApiPropertyOptional({ example: 'C02G1234MD6R', description: 'Seriya raqami' })
  @IsOptional()
  @IsString()
  serialNumber?: string;

  @ApiProperty({ example: 10500000, description: 'Kelish tannarxi (UZS)' })
  @IsNumber({}, { message: 'Tannarx raqam bo\'lishi kerak' })
  @Min(0, { message: 'Tannarx manfiy bo\'lishi mumkin emas' })
  costPrice!: number;

  @ApiPropertyOptional({ example: 1, description: 'Miqdorli (aksessuar) mahsulotlar uchun miqdor' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional({ example: '2026-07-30T15:00:00.000Z', description: 'Qabul qilingan vaqt' })
  @IsOptional()
  @IsString()
  receivedAt?: string;
}
