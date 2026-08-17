import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UploadedFile,
  UseFilters,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle, seconds } from '@nestjs/throttler';
import { ErrorCode, UserRole, uploadFileSchema } from '@hisobai/contracts';
import type { FileDownloadDto, FileDto, UploadFileInput } from '@hisobai/contracts';
import type { Response } from 'express';

import { AppException } from '../common/app.exception';
import { Public, Roles } from '../common/auth.decorators';
import { CurrentUser } from '../common/current-user.decorator';
import type { AuthedRequest, RequestUser } from '../common/request-user';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { FilesService } from './files.service';
import { MulterExceptionFilter } from './multer-exception.filter';

/**
 * `multer`ning o'z hotira chegarasi — haqiqiy biznes limitidan (§7, 10 MB)
 * ataylab kattaroq: aniq `FILE_TOO_LARGE` xatosini `FilesService` beradi,
 * bu yerdagi limit faqat haddan tashqari katta yukdan (xotira DoS)
 * himoya qiluvchi zaxira.
 */
const MULTER_MEMORY_CAP_BYTES = 25 * 1024 * 1024;

/**
 * Fayllar (§15, `API.md` §7).
 *
 * `PERMISSIONS.md:80` — `SHOP_ADMIN`/`MANAGER` to'liq, `SELLER` faqat
 * `RECEIPT`. `MANAGER`/`SELLER` `UserRole` enum'ida hali yo'q (§16.14),
 * shuning uchun `@Roles(...)` hozircha faqat `SHOP_ADMIN`ni ko'rsatadi —
 * enum kengaytirilganda shu ro'yxatga va `kind` bo'yicha cheklovga
 * (`FilesService`) qo'shiladi.
 */
@ApiTags('files')
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post()
  @Roles(UserRole.SHOP_ADMIN)
  @Throttle({ mutation: { limit: 30, ttl: seconds(60 * 60) } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MULTER_MEMORY_CAP_BYTES } }))
  @UseFilters(MulterExceptionFilter)
  @ApiOperation({ summary: 'Fayl yuklash — hajm, MIME va magic-byte tekshiriladi (§7)' })
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(uploadFileSchema)) body: UploadFileInput,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<FileDto> {
    if (!file) {
      throw AppException.badRequest(ErrorCode.VALIDATION_FAILED, 'Fayl biriktirilmagan.', 'file');
    }
    return this.files.upload(file, body.kind, user, request.ip ?? null);
  }

  @Get(':id')
  @Roles(UserRole.SHOP_ADMIN)
  @ApiOperation({ summary: "Vaqtinchalik havola — PASSPORT 5 daq, qolgani 15 daq (§7)" })
  getDownloadUrl(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Req() request: AuthedRequest,
  ): Promise<FileDownloadDto> {
    return this.files.getDownloadUrl(id, user, request.ip ?? null);
  }

  /**
   * Faqat `STORAGE_DRIVER=local` uchun (`LocalStorageProvider` izohiga
   * qarang). `@Public()` — token o'zi vakolat: ruxsat qarori havola
   * yaratilganda (`GET /files/:id`) allaqachon qabul qilingan.
   */
  @Get('download/:token')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Lokal drayverdagi vaqtinchalik havola (faqat dev)" })
  async download(@Param('token') token: string, @Res() response: Response): Promise<void> {
    const resolved = await this.files.resolveLocalDownload(token);
    if (!resolved) {
      // Yaroqsiz/eskirgan token — Cross-Shop miss bilan bir xil falsafa: 404.
      // `@Res()` faqat qaytish qiymatini boshqaradi — `throw` baribir
      // `AllExceptionsFilter`ga tushadi va `API.md` §3 shaklida chiqadi.
      throw AppException.notFound(ErrorCode.NOT_FOUND, 'Havola muddati tugagan yoki yaroqsiz.');
    }

    // §7 — hech qachon `text/html` bilan berilmaydi; oq ro'yxatdan
    // tashqari qiymat kirib qolsa (nazariy jihatdan bo'lmasligi kerak),
    // xavfsiz standartga tushadi.
    const safeMimeType = ALLOWED_DOWNLOAD_MIME_TYPES.has(resolved.mimeType)
      ? resolved.mimeType
      : 'application/octet-stream';

    response.setHeader('Content-Type', safeMimeType);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${resolved.downloadName.replaceAll(/["\r\n]/gu, '')}"`,
    );
    response.send(resolved.buffer);
  }
}

const ALLOWED_DOWNLOAD_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
]);
