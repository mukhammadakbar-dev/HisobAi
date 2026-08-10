import { z } from 'zod';

import type { Theme, UserRole } from '../enums';

/**
 * Kirish va sessiya sxemalari (§2).
 *
 * Parol siyosati bitta joyda: login formasi, parol o'zgartirish va parol
 * tiklash uchun bir xil chegara. Ikki joyda ikki xil bo'lsa, foydalanuvchi
 * qabul qilingan parolni keyin kirita olmay qoladi.
 */

/** §2.4 — Argon2id hash uzunligi cheklamaydi; chegara foydalanuvchi uchun. */
export const PASSWORD_MIN_LENGTH = 8;

const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Parol kamida ${String(PASSWORD_MIN_LENGTH)} belgidan iborat bo'lsin`);

const email = z.string().trim().toLowerCase().email({ message: "Email noto'g'ri kiritilgan" });

export const loginSchema = z
  .object({
    email,
    /**
     * Bu yerda `min(1)` — parol siyosati EMAS: mavjud foydalanuvchining
     * eski paroli qisqaroq bo'lishi mumkin va uni kiritishdan to'sish
     * kirishni umuman imkonsiz qilardi.
     */
    password: z.string().min(1, 'Parolni kiriting'),
  })
  .strict();
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Joriy parolni kiriting'),
    newPassword: password,
  })
  .strict();
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const forgotPasswordSchema = z.object({ email }).strict();
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Havola noto‘g‘ri'),
    newPassword: password,
  })
  .strict();
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** `GET /auth/me` javobi. Parol hash'i hech qachon chiqmaydi. */
export interface CurrentUserDto {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  theme: Theme;
}

/**
 * §2.7 — sozlamalarda faol sessiyalar ro'yxati: qurilma, IP, oxirgi kirish.
 * `isCurrent` — foydalanuvchi o'zi turgan sessiyani ajrata olishi uchun.
 */
export interface SessionDto {
  id: string;
  userAgent: string | null;
  ip: string | null;
  lastSeenAt: string;
  expiresAt: string;
  createdAt: string;
  isCurrent: boolean;
}

/** §2.10 — kirish jurnali: muvaffaqiyatli va muvaffaqiyatsiz urinishlar. */
export interface LoginAttemptDto {
  id: string;
  email: string;
  ip: string | null;
  userAgent: string | null;
  success: boolean;
  createdAt: string;
}
