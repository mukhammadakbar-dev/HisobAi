import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AiInsightsService } from './ai-insights.service';
import { QueryInsightDto } from './dto/query-insight.dto';
import { AuthGuard } from '../auth/auth.guard';
import {
  DailyInsightDto,
  InsightResponseDto,
  SlowMovingItemDto,
} from '@baraka/contracts';

@ApiTags('AI Insights & Analytics')
@Controller('ai-insights')
@UseGuards(AuthGuard)
export class AiInsightsController {
  constructor(private readonly aiInsightsService: AiInsightsService) {}

  @Get('daily')
  @ApiOperation({ summary: 'Bugungi kun uchun sun\'iy intellekt tahlili va xulosasi' })
  async getDailyInsight(): Promise<DailyInsightDto> {
    return this.aiInsightsService.getDailyInsight();
  }

  @Post('query')
  @ApiOperation({ summary: 'Savdo va moliya bo\'yicha sun\'iy intellektga savol berish' })
  async queryInsight(@Body() dto: QueryInsightDto): Promise<InsightResponseDto> {
    return this.aiInsightsService.queryInsight(dto);
  }

  @Get('slow-moving')
  @ApiOperation({ summary: 'Omborda eng uzoq vaqt sotilmay turgan mahsulotlar ro\'yxati' })
  async getSlowMovingProducts(): Promise<SlowMovingItemDto[]> {
    return this.aiInsightsService.getSlowMovingProducts();
  }
}
