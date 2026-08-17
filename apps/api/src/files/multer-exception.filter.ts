import { ArgumentsHost, Catch, ExceptionFilter, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ErrorCode } from '@hisobai/contracts';
import { MulterError } from 'multer';

import { AllExceptionsFilter } from '../common/all-exceptions.filter';
import { AppException } from '../common/app.exception';
import type { Env } from '../config/env';

/**
 * `multer` xatosini `API.md` §3 shakliga keltiradi.
 *
 * `FileInterceptor`ning o'z `limits.fileSize` chegarasi — DoS'ga qarshi
 * zaxira qatlam (§7 asosiy hajm tekshiruvi `FilesService`da, aniq
 * `FILE_TOO_LARGE` xatosi bilan). Ikkalasi ham oshsa (masalan servis
 * o'zi baribir chegaraga yetmagan bo'lsa ham `multer` o'zining qattiqroq
 * xotira chegarasini uradi), `MulterError` `AppException` EMAS — filter
 * bo'lmasa `AllExceptionsFilter` uni "kutilmagan xato" (`500`) deb
 * qaytarardi, holbuki bu foydalanuvchi xatosi.
 */
@Injectable()
@Catch(MulterError)
export class MulterExceptionFilter implements ExceptionFilter {
  private readonly delegate = new AllExceptionsFilter();

  constructor(private readonly config: ConfigService<Env, true>) {}

  catch(exception: MulterError, host: ArgumentsHost): void {
    const mapped =
      exception.code === 'LIMIT_FILE_SIZE'
        ? AppException.rule(
            ErrorCode.FILE_TOO_LARGE,
            `Fayl hajmi ${String(this.config.get('MAX_UPLOAD_MB', { infer: true }))} MB dan oshmasin.`,
            'file',
          )
        : AppException.badRequest(ErrorCode.VALIDATION_FAILED, 'Fayl yuklashda xato.', 'file');

    this.delegate.catch(mapped, host);
  }
}
