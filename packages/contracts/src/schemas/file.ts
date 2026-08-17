import { z } from 'zod';

import { FileKind } from '../enums';
import { uuidString } from './common';

/**
 * Fayl yuklash (§15, `API.md` §7).
 *
 * Faylning o'zi multipart qismida keladi (`@UploadedFile()`), shu sxema
 * faqat qo'shimcha maydonni — `kind` ni tekshiradi. Hajm, MIME oq
 * ro'yxati va magic-byte tekshiruvi zod bilan emas, servisda qilinadi:
 * ular buferning o'ziga bog'liq va sxema darajasida ifodalanmaydi.
 */
export const uploadFileSchema = z.object({ kind: z.enum(FileKind) }).strict();
export type UploadFileInput = z.infer<typeof uploadFileSchema>;

/**
 * Mavjud faylni biriktirish — 10-bosqich C qismi (§18.1, §19.2, §19.7,
 * §20.9, §15.6). Har doim **ixtiyoriy**: yubormasa hech narsa
 * o'zgarmaydi, `null` yuborsa biriktirish uziladi. `kind` mosligi va
 * Shop egaligi client sxemasida emas, servisda tekshiriladi
 * (`common/file-ref.ts`) — bu yerda faqat shakl (UUID) tasdiqlanadi.
 */
export const fileIdField = uuidString.nullable().optional();

/**
 * Javob — **`storageKey` ataylab yo'q** (`API.md` §7): u ichki joylashuv
 * tafsiloti, client'ga chiqishi shart emas.
 */
export interface FileDto {
  id: string;
  kind: FileKind;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

/**
 * §15.5 — vaqtinchalik havola. `PASSPORT` uchun 5 daqiqa, qolganlari
 * uchun 15 daqiqa (`API.md` §7).
 */
export interface FileDownloadDto {
  url: string;
  expiresAt: string;
}
