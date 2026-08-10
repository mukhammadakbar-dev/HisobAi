import { HttpStatus, PipeTransform } from '@nestjs/common';
import { ErrorCode } from '@hisobai/contracts';
import type { ApiErrorIssue } from '@hisobai/contracts';
import type { ZodType } from 'zod';

import { AppException } from './app.exception';

/**
 * Zod sxemasi bo'yicha validatsiya (`FRONTEND.md` §6.1).
 *
 * Nega class-validator emas: sxema `@hisobai/contracts` da turadi va uni
 * **web ham, api ham** ishlatadi. Ikki tomon bir xil qoidani qo'llaganda
 * "forma to'g'ri edi, lekin server rad etdi" holati bo'lmaydi.
 *
 * Zod `.strict()` bilan ishlaganda noma'lum maydon xato beradi — bu mass
 * assignment'ga qarshi himoya (`ARCHITECTURE.md` §12). Sxemalarni doim
 * `.strict()` bilan yozing.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) return result.data;

    const issues: ApiErrorIssue[] = result.error.issues.map((issue) => ({
      field: issue.path.map((segment) => String(segment)).join('.') || '_',
      code: issue.code.toUpperCase(),
      message: issue.message,
    }));

    throw new AppException(
      ErrorCode.VALIDATION_FAILED,
      "Forma to'ldirilishida xato bor",
      HttpStatus.BAD_REQUEST,
      issues[0]?.field,
      { issues },
    );
  }
}
