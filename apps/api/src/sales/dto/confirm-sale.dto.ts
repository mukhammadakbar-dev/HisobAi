import { IsOptional, IsNumber, Min, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ConfirmSaleDto {
  @ApiPropertyOptional({ example: 3000000, description: 'Boshlang\'ich to\'lov summasi (Nasiya bo\'lganda)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  downPayment?: number;

  @ApiPropertyOptional({ example: 6, description: 'Nasiya muddati (oylar soni)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  installmentMonths?: number;

  @ApiPropertyOptional({ example: '2026-08-01', description: 'To\'lov boshlanish sanasi' })
  @IsOptional()
  @IsString()
  startDate?: string;
}
