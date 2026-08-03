import {
  IsArray,
  ValidateNested,
  IsString,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateScheduleItemDto {
  @ApiProperty({ example: '2026-08-15', description: 'To\'lov muddati (sana)' })
  @IsString()
  dueDate!: string;

  @ApiProperty({ example: 1500000, description: 'To\'lanishi kerak bo\'lgan summa (UZS)' })
  @IsNumber()
  @Min(0)
  amountDue!: number;
}

export class UpdateScheduleDto {
  @ApiProperty({ type: [UpdateScheduleItemDto], description: 'Yangi to\'lov jadvali elementlari' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateScheduleItemDto)
  schedules!: UpdateScheduleItemDto[];
}
