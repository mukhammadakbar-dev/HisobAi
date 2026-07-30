import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AdminProfile, AuthResponse } from '@baraka/contracts';
import { Response, Request } from 'express';
export declare class AuthController {
    private readonly authService;
    constructor(authService: AuthService);
    login(loginDto: LoginDto, res: Response): Promise<AuthResponse>;
    logout(req: Request & {
        sessionId?: string;
    }, res: Response): Promise<{
        message: string;
    }>;
    getMe(adminId: string): Promise<AdminProfile>;
}
