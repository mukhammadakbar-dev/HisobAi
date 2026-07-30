import { IsString, IsNotEmpty, IsOptional, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCustomerDto {
  @ApiProperty({ example: 'Alisher Navoiy', description: 'Mijoz F.I.Sh.' })
  @IsString()
  @IsNotEmpty({ message: 'Mijoz ismi kiritilishi shart' })
  @MinLength(2, { message: 'Ism kamida 2 ta belgidan iborat bo\'lishi kerak' })
  fullName!: string;

  @ApiProperty({ example: '+998901234567', description: 'Telefon raqami' })
  @IsString()
  @IsNotEmpty({ message: 'Telefon raqami kiritilishi shart' })
  phone!: string;

  @ApiPropertyOptional({ example: 'Toshkent sh., Chilonzor t., 12-uy', description: 'Yashash manzili' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Doimiy mijoz, ishonchli', description: 'Mijoz haqida izoh' })
  @IsOptional()
  @IsString()
  note?: string;
}
