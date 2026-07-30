import { BadRequestException } from '@nestjs/common';

/**
 * Normalizes Uzbek phone numbers to E.164 standard (+998XXXXXXXXX)
 */
export function normalizePhoneE164(phone: string): string {
  if (!phone) {
    throw new BadRequestException('Telefon raqami kiritilishi shart');
  }

  // Remove all non-digit characters except leading +
  let digits = phone.trim().replace(/[^\d+]/g, '');

  if (digits.startsWith('+')) {
    digits = digits.substring(1);
  }

  // Handle 9-digit local Uzbekistan number (e.g., 901234567)
  if (digits.length === 9) {
    digits = `998${digits}`;
  }

  // Validate E.164 Uzbekistan number (must start with 998 and have 12 digits total)
  if (digits.length === 12 && digits.startsWith('998')) {
    return `+${digits}`;
  }

  // Fallback for international E.164 format (10 to 15 digits)
  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  throw new BadRequestException(
    'Telefon raqami noto\'g\'ri formatda kiritildi (masalan: +998901234567)',
  );
}
