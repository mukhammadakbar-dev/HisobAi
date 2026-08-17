import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../common/auth.decorators';
import { PrismaService } from '../database/prisma.service';
import { StorageProvider } from '../storage/storage.provider';

/**
 * Salomatlik endpointlari (`API.md` §10).
 *
 * `live` va `ready` ataylab ajratilgan: deploy vositasi va monitoring
 * ularga boshqacha munosabatda bo'ladi. `live` yiqilsa — jarayonni qayta
 * ishga tushirish kerak; `ready` yiqilsa — jarayon tirik, lekin trafik
 * yubormaslik kerak (masalan DB yoki fayl saqlash vaqtincha yo'q).
 * Bittasi bo'lsa, uzilish butun ilovani qayta ishga tushirilishiga
 * sabab bo'lardi.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageProvider,
  ) {}

  @Get('live')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Jarayon tirikmi (DB tekshirilmaydi)' })
  live(): { status: 'ok'; time: string } {
    return { status: 'ok', time: new Date().toISOString() };
  }

  @Get('ready')
  @Public()
  @ApiOperation({ summary: "Trafik qabul qilishga tayyormi (DB va fayl saqlash tekshiriladi)" })
  async ready(): Promise<{ status: 'ok'; database: 'up'; storage: 'up'; time: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      // 503 — vaqtinchalik holat, qayta urinish ma'noli
      throw new ServiceUnavailableException('Ma’lumotlar bazasi javob bermayapti');
    }

    if (!(await this.storage.healthCheck())) {
      throw new ServiceUnavailableException('Fayl saqlash javob bermayapti');
    }

    return { status: 'ok', database: 'up', storage: 'up', time: new Date().toISOString() };
  }
}
