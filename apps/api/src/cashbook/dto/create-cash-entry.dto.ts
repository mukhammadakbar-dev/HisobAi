import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { CashDirection } from '@prisma/client';

export class CreateCashEntryDto {
  @ApiProperty({ enum: CashDirection, example: CashDirection.CASH_OUT })
  @IsEnum(CashDirection)
  @IsNotEmpty()
  direction: CashDirection;

  @ApiProperty({ example: 150000 })
  @IsNumber()
  @Min(0.01)
  @IsNotEmpty()
  amount: number;

  @ApiPropertyOptional({ example: 'uuid-of-category' })
  @IsString()
  @IsOptional()
  categoryId?: string;

  @ApiPropertyOptional({ example: '2026-07-31T12:00:00Z' })
  @IsString()
  @IsOptional()
  occurredAt?: string;

  @ApiPropertyOptional({ example: 'Office electricity bill payment' })
  @IsString()
  @IsOptional()
  note?: string;

  @ApiPropertyOptional({ example: 'https://example.com/receipts/doc.pdf' })
  @IsString()
  @IsOptional()
  attachmentUrl?: string;
}
