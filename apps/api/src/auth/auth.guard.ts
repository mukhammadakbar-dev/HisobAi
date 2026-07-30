import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Extract token from Cookie or Bearer header
    let token = request.cookies?.baraka_session;
    
    if (!token && request.headers.authorization) {
      const parts = request.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
        token = parts[1];
      }
    }

    if (!token) {
      throw new UnauthorizedException('Tizimga kirish talab etiladi');
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { admin: true },
    });

    if (!session || session.expiresAt < new Date()) {
      if (session) {
        // Clean expired session
        await this.prisma.session.delete({ where: { id: session.id } }).catch(() => null);
      }
      throw new UnauthorizedException('Sessiya muddati tugagan. Qaytadan kiring');
    }

    // Attach admin info to request
    request.admin = {
      id: session.admin.id,
      email: session.admin.email,
      displayName: session.admin.displayName,
      theme: session.admin.theme,
    };
    request.sessionId = session.id;

    return true;
  }
}
