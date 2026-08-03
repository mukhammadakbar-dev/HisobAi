import { Module } from '@nestjs/common';
import { AiInsightsService } from './ai-insights.service';
import { AiInsightsController } from './ai-insights.controller';
import { AI_INSIGHTS_PROVIDER } from './interfaces/ai-provider.interface';
import { AnthropicAiProvider } from './providers/anthropic-ai.provider';

@Module({
  controllers: [AiInsightsController],
  providers: [
    AiInsightsService,
    {
      provide: AI_INSIGHTS_PROVIDER,
      useClass: AnthropicAiProvider,
    },
  ],
  exports: [AiInsightsService, AI_INSIGHTS_PROVIDER],
})
export class AiInsightsModule {}
