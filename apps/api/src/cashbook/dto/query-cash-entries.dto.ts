import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { CashDirection } from '@prisma/client';

export class QueryCashEntriesDto {
  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ example: '2026-07-31' })
  @IsString()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({ enum: CashDirection })
  @IsEnum(CashDirection)
  @IsOptional()
  direction?: CashDirection;

  @ApiPropertyOptional({ example: 'uuid-of-category' })
  @IsString()
  @IsOptional()
  categoryId?: string;
}
