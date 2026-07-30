import { PrismaService } from '../prisma/prisma.service';
import { DashboardSummary } from '@baraka/contracts';
export declare class DashboardService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    getSummary(): Promise<DashboardSummary>;
}
