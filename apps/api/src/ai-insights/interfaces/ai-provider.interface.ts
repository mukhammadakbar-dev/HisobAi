export const AI_INSIGHTS_PROVIDER = 'AI_INSIGHTS_PROVIDER';

export interface AiInsightsProvider {
  getInsight(prompt: string, context: object): Promise<string>;
}
