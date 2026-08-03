import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReportSummaryDto, TopEntityStat } from '@baraka/contracts';
import {
  SaleKind,
  SaleStatus,
  CashDirection,
  PaymentStatus,
  InventoryItemStatus,
  InstallmentStatus,
} from '@prisma/client';

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary(from?: string, to?: string): Promise<ReportSummaryDto> {
    const now = new Date();
    const fromDate = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), 1);
    const toDate = to ? new Date(to) : new Date();
    if (to) {
      toDate.setHours(23, 59, 59, 999);
    }

    const salesWhere = {
      status: SaleStatus.CONFIRMED,
      soldAt: { gte: fromDate, lte: toDate },
    };

    // 1. Sales Breakdown
    const sales = await this.prisma.sale.findMany({
      where: salesWhere,
      select: {
        id: true,
        kind: true,
        total: true,
      },
    });

    let totalTurnover = 0;
    let cashSalesAmount = 0;
    let cashSalesCount = 0;
    let installmentSalesAmount = 0;
    let installmentSalesCount = 0;
    let mixedSalesAmount = 0;
    let mixedSalesCount = 0;

    for (const sale of sales) {
      const amt = Number(sale.total);
      totalTurnover += amt;

      if (sale.kind === SaleKind.CASH) {
        cashSalesAmount += amt;
        cashSalesCount++;
      } else if (sale.kind === SaleKind.INSTALLMENT) {
        installmentSalesAmount += amt;
        installmentSalesCount++;
      } else if (sale.kind === SaleKind.MIXED) {
        mixedSalesAmount += amt;
        mixedSalesCount++;
      }
    }

    // 2. Cash Flow
    const cashEntries = await this.prisma.cashEntry.findMany({
      where: {
        occurredAt: { gte: fromDate, lte: toDate },
      },
      select: {
        direction: true,
        amount: true,
      },
    });

    let cashIn = 0;
    let cashOut = 0;

    for (const entry of cashEntries) {
      const amt = Number(entry.amount);
      if (entry.direction === CashDirection.CASH_IN) {
        cashIn += amt;
      } else if (entry.direction === CashDirection.CASH_OUT) {
        cashOut += amt;
      }
    }

    const netCashFlow = cashIn - cashOut;

    // 3. Profitability (Gross Profit)
    const saleItems = await this.prisma.saleItem.findMany({
      where: {
        sale: salesWhere,
      },
      select: {
        quantity: true,
        unitPrice: true,
        costSnapshot: true,
        product: {
          select: {
            brand: true,
            model: true,
            category: true,
          },
        },
      },
    });

    let totalRevenue = 0;
    let totalCogs = 0;

    const brandMap = new Map<string, { count: number; revenue: number }>();
    const modelMap = new Map<string, { count: number; revenue: number }>();
    const categoryMap = new Map<string, { count: number; revenue: number }>();

    for (const item of saleItems) {
      const qty = item.quantity;
      const rev = Number(item.unitPrice) * qty;
      const cogs = Number(item.costSnapshot) * qty;

      totalRevenue += rev;
      totalCogs += cogs;

      // Brand stat
      const brand = item.product?.brand || 'Noma\'lum';
      const bStat = brandMap.get(brand) || { count: 0, revenue: 0 };
      bStat.count += qty;
      bStat.revenue += rev;
      brandMap.set(brand, bStat);

      // Model stat
      const model = item.product ? `${item.product.brand} ${item.product.model}` : 'Noma\'lum';
      const mStat = modelMap.get(model) || { count: 0, revenue: 0 };
      mStat.count += qty;
      mStat.revenue += rev;
      modelMap.set(model, mStat);

      // Category stat
      const cat = item.product?.category || 'Noma\'lum';
      const cStat = categoryMap.get(cat) || { count: 0, revenue: 0 };
      cStat.count += qty;
      cStat.revenue += rev;
      categoryMap.set(cat, cStat);
    }

    const grossProfit = totalRevenue - totalCogs;
    const grossMarginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    // 4. Installment Debt
    const activeContracts = await this.prisma.installmentContract.findMany({
      where: {
        status: { in: [InstallmentStatus.ACTIVE, InstallmentStatus.OVERDUE] },
      },
      select: {
        outstandingAmount: true,
      },
    });

    const totalOutstanding = activeContracts.reduce(
      (sum, c) => sum + Number(c.outstandingAmount),
      0,
    );

    const collectedPayments = await this.prisma.payment.aggregate({
      where: {
        status: PaymentStatus.CONFIRMED,
        paidAt: { gte: fromDate, lte: toDate },
      },
      _sum: { amount: true },
    });
    const collectedAmount = Number(collectedPayments._sum.amount || 0);

    const overdueSchedules = await this.prisma.paymentSchedule.findMany({
      where: {
        OR: [
          { status: 'OVERDUE' },
          { dueDate: { lt: now }, status: { not: 'PAID' } },
        ],
      },
      select: {
        amountDue: true,
        amountPaid: true,
      },
    });

    const overdueAmount = overdueSchedules.reduce(
      (sum, s) => sum + (Number(s.amountDue) - Number(s.amountPaid)),
      0,
    );

    // 5. Inventory Overview
    const availableItems = await this.prisma.inventoryItem.findMany({
      where: { status: InventoryItemStatus.AVAILABLE },
      select: { costPrice: true },
    });

    const inventoryCount = availableItems.length;
    const inventoryValue = availableItems.reduce(
      (sum, item) => sum + Number(item.costPrice),
      0,
    );

    // Low stock count calculation
    const products = await this.prisma.product.findMany({
      include: {
        inventoryItems: {
          where: { status: InventoryItemStatus.AVAILABLE },
        },
      },
    });

    let lowStockCount = 0;
    for (const p of products) {
      if (p.inventoryItems.length <= p.minStockAlert) {
        lowStockCount++;
      }
    }

    // Helper for top items sorting
    const formatTopStats = (map: Map<string, { count: number; revenue: number }>): TopEntityStat[] => {
      return Array.from(map.entries())
        .map(([name, data]) => ({ name, count: data.count, revenue: data.revenue }))
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 5);
    };

    return {
      dateRange: {
        from: fromDate.toISOString(),
        to: toDate.toISOString(),
      },
      sales: {
        totalTurnover,
        totalCount: sales.length,
        cashSales: { amount: cashSalesAmount, count: cashSalesCount },
        installmentSales: { amount: installmentSalesAmount, count: installmentSalesCount },
        mixedSales: { amount: mixedSalesAmount, count: mixedSalesCount },
      },
      cashFlow: {
        cashIn,
        cashOut,
        netCashFlow,
      },
      profitability: {
        grossProfit,
        costOfGoodsSold: totalCogs,
        grossMarginPercent: Number(grossMarginPercent.toFixed(2)),
      },
      installmentDebt: {
        totalOutstanding,
        collectedAmount,
        overdueAmount,
        activeContractsCount: activeContracts.length,
      },
      inventory: {
        totalCount: inventoryCount,
        totalValue: inventoryValue,
        lowStockCount,
      },
      topBrands: formatTopStats(brandMap),
      topModels: formatTopStats(modelMap),
      topCategories: formatTopStats(categoryMap),
    };
  }
}
