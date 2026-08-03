import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsNumber,
  IsOptional,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentMethod } from '@baraka/contracts';

export class CreatePaymentDto {
  @ApiProperty({ example: 'uuid-contract-id', description: 'Nasiya shartnomasi ID si' })
  @IsString()
  @IsNotEmpty({ message: 'Nasiya shartnomasi ID si kiritilishi shart' })
  contractId!: string;

  @ApiProperty({ example: 500000, description: 'To\'lov summasi (UZS)' })
  @IsNumber()
  @Min(1, { message: 'To\'lov summasi 0 dan katta bo\'lishi kerak' })
  amount!: number;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.CASH, description: 'To\'lov usuli: CASH yoki CARD_TRANSFER' })
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @ApiPropertyOptional({ example: '/uploads/receipt-123.jpg', description: 'Chek rasmi yoki fayli hovolasi (Transfer bo\'lganda)' })
  @IsOptional()
  @IsString()
  receiptUrl?: string;
}
