import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { AuthGuard } from '../auth/auth.guard';
import { ReportSummaryDto } from '@baraka/contracts';

@ApiTags('Reports & Financial Summaries')
@Controller('reports')
@UseGuards(AuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Vaqt oralig\'i bo\'yicha agregatsiyalangan umumiy hisobot' })
  @ApiQuery({ name: 'from', required: false, example: '2026-07-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-07-31' })
  async getSummary(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<ReportSummaryDto> {
    return this.reportsService.getSummary(from, to);
  }
}
