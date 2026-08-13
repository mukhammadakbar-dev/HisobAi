import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@hisobai/contracts';
import type { DashboardDto } from '@hisobai/contracts';

import { Roles } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import type { RequestUser } from '../common/request-user';
import { DashboardService } from './dashboard.service';

/**
 * Hisobotlar moduli (`DECISIONS.md` §14 — dashboard shu modulda).
 *
 * Hozircha faqat `GET /dashboard`: davr hisobotlari (`/reports/*`)
 * 8-bosqichda keladi. Ular bo'sh javob bilan oldindan ochilmaydi —
 * ishlamaydigan endpoint ishlaydiganidan farq qilmay qolardi.
 */
@ApiTags('reports')
@Controller()
export class ReportsController {
  constructor(private readonly dashboard: DashboardService) {}

  /** §14.1 — bitta so'rov hamma blokni qaytaradi. */
  @Get('dashboard')
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Dashboard — bugungi holat (§14)' })
  get(@CurrentUser() user: RequestUser): Promise<DashboardDto> {
    return this.dashboard.get(user);
  }
}
