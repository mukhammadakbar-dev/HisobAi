import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { AuthGuard } from '../auth/auth.guard';
import { DashboardSummary } from '@baraka/contracts';

@ApiTags('Dashboard')
@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  @ApiOperation({ summary: 'Dashboard KPI va biznes tahlili ma\'lumotlarini olish' })
  @ApiResponse({ status: 200, description: 'Dashboard umumiy ko\'rsatkichlari' })
  async getSummary(): Promise<DashboardSummary> {
    return this.dashboardService.getSummary();
  }
}
