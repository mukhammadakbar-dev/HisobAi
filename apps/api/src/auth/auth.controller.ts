import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthGuard } from './auth.guard';
import { CurrentAdmin } from './decorators/current-admin.decorator';
import { AdminProfile, AuthResponse } from '@baraka/contracts';
import { Response, Request } from 'express';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin logini va sessiya yaratish' })
  @ApiResponse({ status: 200, description: 'Sessiya yaratildi va cookie o\'rnatildi' })
  async login(
    @Body() loginDto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.authService.login(loginDto, res);
  }

  @Post('logout')
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Tizimdan chiqish' })
  async logout(
    @Req() req: Request & { sessionId?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.logout(req.sessionId || '', res);
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Joriy autentifikatsiyadan o\'tgan admin ma\'lumotlarini olish' })
  async getMe(@CurrentAdmin('id') adminId: string): Promise<AdminProfile> {
    return this.authService.getMe(adminId);
  }
}
