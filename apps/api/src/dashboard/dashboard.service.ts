import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardSummary, SalesDynamicsPoint, RecentActivityItem } from '@baraka/contracts';

@Injectable()
export class DashboardService {
  private readonly logger = new Logger(DashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getSummary(): Promise<DashboardSummary> {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    let todaySalesCount = 0;
    let todayRevenue = 0;
    let todayCashSales = 0;
    let todayInstallmentSales = 0;
    let todayCashIn = 0;
    let todayCashOut = 0;
    let todayGrossProfit = 0;

    let totalOutstandingReceivables = 0;
    let todayDueReceivables = 0;
    let overdueReceivables = 0;

    let inventoryTotalValue = 0;
    let lowStockCount = 0;

    const salesDynamics: SalesDynamicsPoint[] = [];
    const recentActivities: RecentActivityItem[] = [];

    try {
      // 1. Today Sales Metrics
      const todaySales = await this.prisma.sale.findMany({
        where: {
          soldAt: {
            gte: startOfToday,
            lte: endOfToday,
          },
          status: 'CONFIRMED',
        },
        include: {
          saleItems: true,
        },
      });

      todaySalesCount = todaySales.length;
      for (const sale of todaySales) {
        const total = Number(sale.total);
        todayRevenue += total;
        if (sale.kind === 'CASH') {
          todayCashSales += total;
        } else if (sale.kind === 'INSTALLMENT') {
          todayInstallmentSales += total;
        }

        // Calculate gross profit from sale items
        for (const item of sale.saleItems) {
          const unitPrice = Number(item.unitPrice);
          const cost = Number(item.costSnapshot);
          todayGrossProfit += (unitPrice - cost) * item.quantity;
        }
      }

      // 2. Cashbook Metrics
      const cashInAggregate = await this.prisma.cashEntry.aggregate({
        where: {
          direction: 'CASH_IN',
          occurredAt: { gte: startOfToday, lte: endOfToday },
        },
        _sum: { amount: true },
      });
      todayCashIn = Number(cashInAggregate._sum.amount || 0);

      const cashOutAggregate = await this.prisma.cashEntry.aggregate({
        where: {
          direction: 'CASH_OUT',
          occurredAt: { gte: startOfToday, lte: endOfToday },
        },
        _sum: { amount: true },
      });
      todayCashOut = Number(cashOutAggregate._sum.amount || 0);

      // 3. Receivables & Installments Metrics
      const contractsAggregate = await this.prisma.installmentContract.aggregate({
        where: { status: 'ACTIVE' },
        _sum: { outstandingAmount: true },
      });
      totalOutstandingReceivables = Number(contractsAggregate._sum.outstandingAmount || 0);

      // Today Due & Overdue Schedules
      const todaySchedules = await this.prisma.paymentSchedule.findMany({
        where: {
          dueDate: { gte: startOfToday, lte: endOfToday },
          status: { in: ['PENDING', 'PARTIAL'] },
        },
      });
      todayDueReceivables = todaySchedules.reduce(
        (sum: number, s: any) => sum + (Number(s.amountDue) - Number(s.amountPaid)),
        0,
      );

      const overdueSchedules = await this.prisma.paymentSchedule.findMany({
        where: {
          dueDate: { lt: startOfToday },
          status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
        },
      });
      overdueReceivables = overdueSchedules.reduce(
        (sum: number, s: any) => sum + (Number(s.amountDue) - Number(s.amountPaid)),
        0,
      );

      // 4. Inventory Metrics
      const inventoryItems = await this.prisma.inventoryItem.aggregate({
        where: { status: 'AVAILABLE' },
        _sum: { costPrice: true },
      });
      inventoryTotalValue = Number(inventoryItems._sum.costPrice || 0);

      // 5. Sales Dynamics for Last 7 Days
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

        const daySales = await this.prisma.sale.findMany({
          where: {
            soldAt: { gte: dayStart, lte: dayEnd },
            status: 'CONFIRMED',
          },
        });

        const dayRevenue = daySales.reduce((sum: number, s: any) => sum + Number(s.total), 0);
        const dateLabel = `${d.getDate()}/${d.getMonth() + 1}`;

        salesDynamics.push({
          date: dateLabel,
          revenue: dayRevenue,
          salesCount: daySales.length,
        });
      }

      // 6. Recent Activities from Audit Log
      const recentAudit = await this.prisma.auditLog.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
      });

      for (const log of recentAudit) {
        recentActivities.push({
          id: log.id,
          title: log.action,
          description: `${log.entityType} ID: ${log.entityId}`,
          timestamp: log.createdAt.toISOString(),
          type: log.entityType.toLowerCase().includes('sale') ? 'sale' : 'inventory',
        });
      }
    } catch (error: any) {
      this.logger.warn(`Dashboard aggregation warning: ${error?.message || error}`);
    }

    return {
      todaySalesCount,
      todayRevenue,
      todayCashSales,
      todayInstallmentSales,
      todayCashIn,
      todayCashOut,
      todayGrossProfit,
      totalOutstandingReceivables,
      todayDueReceivables,
      overdueReceivables,
      inventoryTotalValue,
      lowStockCount,
      salesDynamics,
      recentActivities,
    };
  }
}
