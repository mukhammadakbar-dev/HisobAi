import { Injectable, Inject, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AI_INSIGHTS_PROVIDER, AiInsightsProvider } from './interfaces/ai-provider.interface';
import { QueryInsightDto } from './dto/query-insight.dto';
import {
  DailyInsightDto,
  InsightResponseDto,
  SlowMovingItemDto,
  ProductDto,
} from '@baraka/contracts';
import {
  SaleStatus,
  SaleKind,
  CashDirection,
  PaymentStatus,
  InventoryItemStatus,
  InstallmentStatus,
} from '@prisma/client';

@Injectable()
export class AiInsightsService {
  private readonly logger = new Logger(AiInsightsService.name);
  private dailyCache = new Map<string, DailyInsightDto>();

  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_INSIGHTS_PROVIDER) private readonly aiProvider: AiInsightsProvider,
  ) {}

  async getDailyInsight(): Promise<DailyInsightDto> {
    const todayStr = new Date().toISOString().substring(0, 10);
    if (this.dailyCache.has(todayStr)) {
      return this.dailyCache.get(todayStr)!;
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    // 1. Today's sales & revenue
    const todaySales = await this.prisma.sale.findMany({
      where: {
        status: SaleStatus.CONFIRMED,
        soldAt: { gte: todayStart, lte: todayEnd },
      },
      select: { total: true },
    });

    const todayRevenue = todaySales.reduce((sum, s) => sum + Number(s.total), 0);

    // 2. Today's gross profit
    const todaySaleItems = await this.prisma.saleItem.findMany({
      where: {
        sale: {
          status: SaleStatus.CONFIRMED,
          soldAt: { gte: todayStart, lte: todayEnd },
        },
      },
      select: { quantity: true, unitPrice: true, costSnapshot: true },
    });

    const todayGrossProfit = todaySaleItems.reduce(
      (sum, item) =>
        sum + (Number(item.unitPrice) - Number(item.costSnapshot)) * item.quantity,
      0,
    );

    // 3. Today's cash flow
    const todayCashEntries = await this.prisma.cashEntry.findMany({
      where: { occurredAt: { gte: todayStart, lte: todayEnd } },
      select: { direction: true, amount: true },
    });

    let cashIn = 0;
    let cashOut = 0;
    for (const e of todayCashEntries) {
      const amt = Number(e.amount);
      if (e.direction === CashDirection.CASH_IN) cashIn += amt;
      else if (e.direction === CashDirection.CASH_OUT) cashOut += amt;
    }
    const todayNetCashFlow = cashIn - cashOut;

    // 4. Total outstanding debt
    const activeContracts = await this.prisma.installmentContract.findMany({
      where: { status: { in: [InstallmentStatus.ACTIVE, InstallmentStatus.OVERDUE] } },
      select: { outstandingAmount: true },
    });
    const totalOutstandingDebt = activeContracts.reduce(
      (sum, c) => sum + Number(c.outstandingAmount),
      0,
    );

    const metrics = {
      todayRevenue,
      todaySalesCount: todaySales.length,
      todayGrossProfit,
      todayNetCashFlow,
      totalOutstandingDebt,
    };

    const prompt =
      "Bugungi kun bo'yicha qisqa, ruhlantiruvchi va amaliy biznes xulosasi beruvchi O'zbekcha 2-3 cümlalik xulosa tayyorlang. Statistika ko'rsatkichlariga tayanib xulosa bering.";

    const summary = await this.aiProvider.getInsight(prompt, metrics);

    const result: DailyInsightDto = {
      date: todayStr,
      summary,
      metrics,
    };

    this.dailyCache.set(todayStr, result);
    return result;
  }

  async queryInsight(dto: QueryInsightDto): Promise<InsightResponseDto> {
    const now = new Date();
    const fromDate = dto.from ? new Date(dto.from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const toDate = dto.to ? new Date(dto.to) : new Date();
    if (dto.to) toDate.setHours(23, 59, 59, 999);

    const salesWhere = {
      status: SaleStatus.CONFIRMED,
      soldAt: { gte: fromDate, lte: toDate },
    };

    // 1. Sales Turnover
    const sales = await this.prisma.sale.findMany({
      where: salesWhere,
      select: { kind: true, total: true },
    });

    let totalTurnover = 0;
    let cashTurnover = 0;
    let installmentTurnover = 0;
    let mixedTurnover = 0;

    for (const s of sales) {
      const amt = Number(s.total);
      totalTurnover += amt;
      if (s.kind === SaleKind.CASH) cashTurnover += amt;
      else if (s.kind === SaleKind.INSTALLMENT) installmentTurnover += amt;
      else if (s.kind === SaleKind.MIXED) mixedTurnover += amt;
    }

    // 2. Gross profit & items
    const saleItems = await this.prisma.saleItem.findMany({
      where: { sale: salesWhere },
      select: {
        quantity: true,
        unitPrice: true,
        costSnapshot: true,
        product: { select: { brand: true, model: true, category: true } },
      },
    });

    let grossProfit = 0;
    const brandMap = new Map<string, { count: number; revenue: number }>();
    const modelMap = new Map<string, { count: number; revenue: number }>();

    for (const item of saleItems) {
      const qty = item.quantity;
      const rev = Number(item.unitPrice) * qty;
      const cogs = Number(item.costSnapshot) * qty;
      grossProfit += rev - cogs;

      const brand = item.product?.brand || 'Boshqa';
      const bStat = brandMap.get(brand) || { count: 0, revenue: 0 };
      bStat.count += qty;
      bStat.revenue += rev;
      brandMap.set(brand, bStat);

      const model = item.product ? `${item.product.brand} ${item.product.model}` : 'Boshqa';
      const mStat = modelMap.get(model) || { count: 0, revenue: 0 };
      mStat.count += qty;
      mStat.revenue += rev;
      modelMap.set(model, mStat);
    }

    const topBrands = Array.from(brandMap.entries())
      .map(([name, d]) => ({ name, count: d.count, revenue: d.revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const topModels = Array.from(modelMap.entries())
      .map(([name, d]) => ({ name, count: d.count, revenue: d.revenue }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    const context = {
      period: {
        from: fromDate.toISOString().substring(0, 10),
        to: toDate.toISOString().substring(0, 10),
      },
      salesCount: sales.length,
      totalTurnover,
      cashTurnover,
      installmentTurnover,
      mixedTurnover,
      grossProfit,
      topBrands,
      topModels,
    };

    const prompt = `Foydalanuvchi savoli: "${dto.question}"\nUshbu savolga faqat taqdim etilgan kontekst ma'lumotlariga tayanib, aniq, muloyim va tushunarli javob bering. Javobda qaysi ko'rsatkichlarga tayanilganini bildiring.`;

    const answer = await this.aiProvider.getInsight(prompt, context);

    return {
      answer,
      period: {
        from: fromDate.toISOString().substring(0, 10),
        to: toDate.toISOString().substring(0, 10),
      },
      metricsUsed: [
        'Savdo tushumi (Turnover)',
        'Yalpi foyda (Gross Profit)',
        'Top brendlar va modellar',
        'Savdo turlari (Naqd/Nasiya)',
      ],
    };
  }

  async getSlowMovingProducts(): Promise<SlowMovingItemDto[]> {
    const items = await this.prisma.inventoryItem.findMany({
      where: { status: InventoryItemStatus.AVAILABLE },
      include: { product: true },
      orderBy: { receivedAt: 'asc' },
      take: 20,
    });

    const now = new Date().getTime();

    return items.map((item) => {
      const recTime = new Date(item.receivedAt).getTime();
      const daysInStock = Math.max(0, Math.floor((now - recTime) / (1000 * 60 * 60 * 24)));

      const productDto: ProductDto = {
        id: item.product.id,
        category: item.product.category,
        brand: item.product.brand,
        model: item.product.model,
        storage: item.product.storage,
        color: item.product.color,
        isSerialized: item.product.isSerialized,
        defaultSalePrice: Number(item.product.defaultSalePrice),
        minStockAlert: item.product.minStockAlert,
        createdAt: item.product.createdAt.toISOString(),
        updatedAt: item.product.updatedAt.toISOString(),
      };

      return {
        id: item.id,
        product: productDto,
        imei: item.imei,
        serialNumber: item.serialNumber,
        costPrice: Number(item.costPrice),
        receivedAt: item.receivedAt.toISOString(),
        daysInStock,
      };
    });
  }
}
