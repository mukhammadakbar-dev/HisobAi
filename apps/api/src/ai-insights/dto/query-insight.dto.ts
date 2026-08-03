import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class QueryInsightDto {
  @ApiProperty({ example: 'Bu oy iPhone sotuvim qancha bo\'ldi?' })
  @IsString()
  @IsNotEmpty()
  question: string;

  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsString()
  @IsOptional()
  to?: string;
}
