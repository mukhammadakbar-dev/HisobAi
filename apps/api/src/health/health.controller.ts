import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../database/prisma.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Web serveri tirik bo'lsa ham API o'lgan bo'lishi mumkin — shuning uchun
   * bu endpoint database'ga haqiqiy so'rov yuboradi, shunchaki 200 qaytarmaydi.
   */
  @Get()
  @ApiOperation({ summary: 'API va database holati' })
  async check(): Promise<{ status: string; database: string; time: string }> {
    let database = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      time: new Date().toISOString(),
    };
  }
}
