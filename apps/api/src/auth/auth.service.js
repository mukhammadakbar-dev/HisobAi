"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var AuthService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const argon2 = require("argon2");
const crypto = require("crypto");
let AuthService = AuthService_1 = class AuthService {
    prisma;
    logger = new common_1.Logger(AuthService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async ensureInitialAdmin() {
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
                this.logger.log(`Ilk admin hisobi yaratildi: ${defaultEmail} / Parol: ${defaultPassword}`);
            }
        }
        catch (e) {
            this.logger.warn(`Initial admin check warning: ${e?.message || e}`);
        }
    }
    async login(loginDto, res) {
        await this.ensureInitialAdmin();
        const admin = await this.prisma.admin.findUnique({
            where: { email: loginDto.email.toLowerCase().trim() },
        });
        if (!admin) {
            throw new common_1.UnauthorizedException('Email yoki parol noto\'g\'ri');
        }
        const isPasswordValid = await argon2.verify(admin.passwordHash, loginDto.password);
        if (!isPasswordValid) {
            throw new common_1.UnauthorizedException('Email yoki parol noto\'g\'ri');
        }
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(sessionToken).digest('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        await this.prisma.session.create({
            data: {
                adminId: admin.id,
                tokenHash,
                expiresAt,
            },
        });
        res.cookie('baraka_session', sessionToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            expires: expiresAt,
            path: '/',
        });
        const adminProfile = {
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
    async logout(sessionId, res) {
        if (sessionId) {
            await this.prisma.session.delete({ where: { id: sessionId } }).catch(() => null);
        }
        res.clearCookie('baraka_session', { path: '/' });
        return { message: 'Tizimdan muvaffaqiyatli chiqildi' };
    }
    async getMe(adminId) {
        const admin = await this.prisma.admin.findUnique({
            where: { id: adminId },
        });
        if (!admin) {
            throw new common_1.UnauthorizedException('Admin topilmadi');
        }
        return {
            id: admin.id,
            email: admin.email,
            displayName: admin.displayName,
            theme: admin.theme,
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = AuthService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AuthService);
//# sourceMappingURL=auth.service.js.map