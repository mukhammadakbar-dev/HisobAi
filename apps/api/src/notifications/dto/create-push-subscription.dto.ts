import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreatePushSubscriptionDto {
  @ApiProperty({ example: 'https://fcm.googleapis.com/fcm/send/...' })
  @IsString()
  @IsNotEmpty()
  endpoint: string;

  @ApiProperty({ example: 'BEl62iUYgU...' })
  @IsString()
  @IsNotEmpty()
  p256dh: string;

  @ApiProperty({ example: 'pxJ0...' })
  @IsString()
  @IsNotEmpty()
  auth: string;
}
