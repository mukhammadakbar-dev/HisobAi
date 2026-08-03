import { Injectable, Logger } from '@nestjs/common';
import { AiInsightsProvider } from '../interfaces/ai-provider.interface';

@Injectable()
export class AnthropicAiProvider implements AiInsightsProvider {
  private readonly logger = new Logger(AnthropicAiProvider.name);

  async getInsight(prompt: string, context: object): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      this.logger.warn('ANTHROPIC_API_KEY is not set in environment. Returning fallback response.');
      return this.generateFallbackResponse(prompt, context);
    }

    try {
      const formattedPrompt = `${prompt}\n\nKontekst ma'lumotlari (JSON metrics):\n${JSON.stringify(context, null, 2)}`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system:
            "Siz HisobAI biznes tahlilchisi va yordamchisisiz. Savol va taqdim etilgan agregatsiyalangan ko'rsatkichlarga qisqa, aniq va professional O'zbek tilida javob bering.",
          messages: [
            {
              role: 'user',
              content: formattedPrompt,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        this.logger.error(`Anthropic API error (${response.status}): ${errText}`);
        return this.generateFallbackResponse(prompt, context);
      }

      const data = await response.json();
      const content = data?.content?.[0]?.text;
      if (!content) {
        return this.generateFallbackResponse(prompt, context);
      }

      return content;
    } catch (error: any) {
      this.logger.error('Failed to communicate with Anthropic API:', error);
      return this.generateFallbackResponse(prompt, context);
    }
  }

  private generateFallbackResponse(prompt: string, context: any): string {
    // Generate clean fallback in Uzbek using context data
    if (context.todayRevenue !== undefined) {
      const rev = (context.todayRevenue || 0).toLocaleString('uz-UZ');
      const count = context.todaySalesCount || 0;
      const profit = (context.todayGrossProfit || 0).toLocaleString('uz-UZ');
      const net = (context.todayNetCashFlow || 0).toLocaleString('uz-UZ');

      return `Bugungi kunda jami ${count} ta savdo amalga oshirildi. Tushum: ${rev} UZS. Yalpi foyda: ${profit} UZS. Sof kassa oqimi: ${net} UZS. (Eslatma: AI tahlili uchun ANTHROPIC_API_KEY sozlanishi lozim).`;
    }

    if (context.totalTurnover !== undefined) {
      const turnover = (context.totalTurnover || 0).toLocaleString('uz-UZ');
      const profit = (context.grossProfit || 0).toLocaleString('uz-UZ');

      return `Belgilangan davr bo'yicha jami savdo tushumi ${turnover} UZS ni, yalpi foyda esa ${profit} UZS ni tashkil etdi. (Eslatma: To'liq sun'iy intellekt tahlili uchun ANTHROPIC_API_KEY sozlanishi lozim).`;
    }

    return `Tizim ma'lumotlari shakllantirildi. Sun'iy intellekt tahlilidan to'liq foydalanish uchun ANTHROPIC_API_KEY sozlanishi lozim.`;
  }
}
