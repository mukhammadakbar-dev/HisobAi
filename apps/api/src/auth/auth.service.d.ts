import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { AdminProfile, AuthResponse } from '@baraka/contracts';
import { Response } from 'express';
export declare class AuthService {
    private readonly prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    private ensureInitialAdmin;
    login(loginDto: LoginDto, res: Response): Promise<AuthResponse>;
    logout(sessionId: string, res: Response): Promise<{
        message: string;
    }>;
    getMe(adminId: string): Promise<AdminProfile>;
}
