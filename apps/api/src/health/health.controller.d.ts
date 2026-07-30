import { HealthCheckResponse } from '@baraka/contracts';
import { PrismaService } from '../prisma/prisma.service';
export declare class HealthController {
    private readonly prisma;
    constructor(prisma: PrismaService);
    check(): Promise<HealthCheckResponse>;
}
