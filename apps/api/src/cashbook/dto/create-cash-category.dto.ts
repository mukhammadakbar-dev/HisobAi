import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { CashDirection } from '@prisma/client';

export class CreateCashCategoryDto {
  @ApiProperty({ example: 'Rent / Ijara' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ enum: CashDirection, example: CashDirection.CASH_OUT })
  @IsEnum(CashDirection)
  @IsNotEmpty()
  direction: CashDirection;
}
