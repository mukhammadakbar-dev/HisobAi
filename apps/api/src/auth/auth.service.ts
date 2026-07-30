import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { AdminProfile, AuthResponse } from '@baraka/contracts';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { Response } from 'express';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Automatic initial admin seeder if no admins exist in DB
   */
  private async ensureInitialAdmin(): Promise<void> {
    try {
      const count = await this.prisma.admin.count();
      if (count === 0) {
        const defaultEmail = 'admin@hisobai.uz';
        const defaultPassword = 'admin12345';
        const passwordHash = await argon2.hash(defaultPassword, {
          type: argon2.argon2id,
        });

        await this.prisma.admin.create({
          data: {
            email: defaultEmail,
            passwordHash,
            displayName: 'Do\'kon Egasi (Admin)',
            theme: 'system',
          },
        });

        this.logger.log(
          `Ilk admin hisobi yaratildi: ${defaultEmail} / Parol: ${defaultPassword}`,
        );
      }
    } catch (e: any) {
      this.logger.warn(`Initial admin check warning: ${e?.message || e}`);
    }
  }

  async login(loginDto: LoginDto, res: Response): Promise<AuthResponse> {
    await this.ensureInitialAdmin();

    const admin = await this.prisma.admin.findUnique({
      where: { email: loginDto.email.toLowerCase().trim() },
    });

    if (!admin) {
      throw new UnauthorizedException('Email yoki parol noto\'g\'ri');
    }

    const isPasswordValid = await argon2.verify(
      admin.passwordHash,
      loginDto.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Email yoki parol noto\'g\'ri');
    }

    // Generate session token & store hash in DB
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');

    // Session valid for 30 days
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    await this.prisma.session.create({
      data: {
        adminId: admin.id,
        tokenHash,
        expiresAt,
      },
    });

    // Set HttpOnly Cookie
    res.cookie('baraka_session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    });

    const adminProfile: AdminProfile = {
      id: admin.id,
      email: admin.email,
      displayName: admin.displayName,
      theme: admin.theme,
    };

    return {
      admin: adminProfile,
      sessionToken,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async logout(sessionId: string, res: Response): Promise<{ message: string }> {
    if (sessionId) {
      await this.prisma.session.delete({ where: { id: sessionId } }).catch(() => null);
    }

    res.clearCookie('baraka_session', { path: '/' });
    return { message: 'Tizimdan muvaffaqiyatli chiqildi' };
  }

  async getMe(adminId: string): Promise<AdminProfile> {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      throw new UnauthorizedException('Admin topilmadi');
    }

    return {
      id: admin.id,
      email: admin.email,
      displayName: admin.displayName,
      theme: admin.theme,
    };
  }
}
