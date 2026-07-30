import { DashboardService } from './dashboard.service';
import { DashboardSummary } from '@baraka/contracts';
export declare class DashboardController {
    private readonly dashboardService;
    constructor(dashboardService: DashboardService);
    getSummary(): Promise<DashboardSummary>;
}
