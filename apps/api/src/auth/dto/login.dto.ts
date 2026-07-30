import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@hisobai.uz', description: 'Admin email manzili' })
  @IsEmail({}, { message: 'To\'g\'ri email manzilini kiriting' })
  @IsNotEmpty({ message: 'Email kiritilishi shart' })
  email!: string;

  @ApiProperty({ example: 'admin12345', description: 'Admin paroli' })
  @IsString()
  @IsNotEmpty({ message: 'Parol kiritilishi shart' })
  @MinLength(6, { message: 'Parol kamida 6 ta belgidan iborat bo\'lishi kerak' })
  password!: string;
}
