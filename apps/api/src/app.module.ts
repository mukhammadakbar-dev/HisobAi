import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { CatalogModule } from './catalog/catalog.module';
import { InventoryModule } from './inventory/inventory.module';
import { CustomersModule } from './customers/customers.module';
import { SalesModule } from './sales/sales.module';
import { PaymentsModule } from './payments/payments.module';
import { CashbookModule } from './cashbook/cashbook.module';
import { ReportsModule } from './reports/reports.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    PrismaModule,
    HealthModule,
    AuthModule,
    DashboardModule,
    CatalogModule,
    InventoryModule,
    CustomersModule,
    SalesModule,
    PaymentsModule,
    CashbookModule,
    ReportsModule,
    NotificationsModule,
  ],
})
export class AppModule {}
