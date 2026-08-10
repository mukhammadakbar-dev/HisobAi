import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@hisobai/contracts';
import type { ApiErrorIssue } from '@hisobai/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { AppException } from './app.exception';
import { ZodValidationPipe } from './zod-validation.pipe';

const saleSchema = z
  .object({
    customerId: z.uuid().nullable(),
    items: z
      .array(z.object({ productId: z.uuid(), quantity: z.int().positive() }))
      .min(1, "Kamida bitta mahsulot qo'shing"),
  })
  .strict();

const VALID_UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(saleSchema);

  it("to'g'ri ma'lumotni o'tkazadi", () => {
    const input = {
      customerId: VALID_UUID,
      items: [{ productId: VALID_UUID, quantity: 2 }],
    };
    expect(pipe.transform(input)).toEqual(input);
  });

  it("noma'lum maydonni rad etadi — mass assignment himoyasi", () => {
    const attempt = {
      customerId: null,
      items: [{ productId: VALID_UUID, quantity: 1 }],
      // Client hech qachon yubormasligi kerak bo'lgan maydonlar:
      total: '1',
      status: 'CONFIRMED',
    };

    expect(() => pipe.transform(attempt)).toThrow(AppException);
  });

  it('xato API.md §3.2 shaklida chiqadi', () => {
    try {
      pipe.transform({ customerId: 'uuid-emas', items: [] });
      expect.unreachable('xato tashlanishi kerak edi');
    } catch (error) {
      expect(error).toBeInstanceOf(AppException);
      const appError = error as AppException;

      expect(appError.code).toBe(ErrorCode.VALIDATION_FAILED);
      expect(appError.getStatus()).toBe(HttpStatus.BAD_REQUEST);
      expect(appError.field).toBeDefined();

      const issues = (appError.details as { issues: ApiErrorIssue[] }).issues;
      expect(issues.length).toBeGreaterThanOrEqual(2);
      expect(issues.map((issue) => issue.field)).toContain('customerId');
      expect(issues.map((issue) => issue.field)).toContain('items');
      for (const issue of issues) {
        expect(typeof issue.code).toBe('string');
        expect(typeof issue.message).toBe('string');
      }
    }
  });

  it("ichma-ich maydon yo'lini nuqta bilan beradi", () => {
    try {
      pipe.transform({
        customerId: null,
        items: [{ productId: VALID_UUID, quantity: 0 }],
      });
      expect.unreachable('xato tashlanishi kerak edi');
    } catch (error) {
      const issues = ((error as AppException).details as { issues: ApiErrorIssue[] }).issues;
      expect(issues[0]?.field).toBe('items.0.quantity');
    }
  });
});
