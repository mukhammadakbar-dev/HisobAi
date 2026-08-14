import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole, reportPeriodSchema } from '@hisobai/contracts';
import type { DashboardDto, ReportPeriod, ReportSummaryDto } from '@hisobai/contracts';

import { Roles } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import type { RequestUser } from '../common/request-user';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { DashboardService } from './dashboard.service';
import { ReportsService } from './reports.service';

/**
 * Hisobotlar moduli (`DECISIONS.md` §14 — dashboard shu modulda).
 *
 * `GET /dashboard` — bugungi holat (§14), `GET /reports/*` — davr
 * hisobotlari (§13). Ikkalasi bitta modulda, chunki hisob-kitob bir
 * xil: dashboard aslida "bugun" davri uchun qisqartirilgan hisobot.
 *
 * Hisobotlar **saqlanmaydi** (§13.10), ya'ni bu yerda faqat `GET` bor
 * va boshqa metod bo'lmaydi.
 */
@ApiTags('reports')
@Controller()
export class ReportsController {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly reports: ReportsService,
  ) {}

  /** §14.1 — bitta so'rov hamma blokni qaytaradi. */
  @Get('dashboard')
  @Roles(UserRole.SHOP_ADMIN)
  @ApiOperation({ summary: 'Dashboard — bugungi holat (§14)' })
  get(@CurrentUser() user: RequestUser): Promise<DashboardDto> {
    return this.dashboard.get(user);
  }

  /** §13.3, §13.5 — KPI va oldingi davr bilan solishtiruv. */
  @Get('reports/summary')
  @Roles(UserRole.SHOP_ADMIN)
  @ApiOperation({ summary: 'Davr xulosasi — aylanma va foyda (§13)' })
  summary(
    @Query(new ZodValidationPipe(reportPeriodSchema)) period: ReportPeriod,
  ): Promise<ReportSummaryDto> {
    return this.reports.summary(period);
  }
}
