/**
 * Hujjatlar — nasiya shartnomasi PDF'i (§15.1, §15.8, §16.10).
 *
 * Kirish sxemasi yo'q: `POST /documents/contracts/:id/pdf` tanadan hech
 * narsa qabul qilmaydi (`id` yo'l parametri, `ParseUUIDPipe` bilan
 * tekshiriladi) — PDF mazmuni to'liq mavjud shartnoma snapshot'idan
 * yig'iladi, mijoz hech qanday maydon yubormaydi.
 */

/**
 * PDF generatsiyasi javobi.
 *
 * `contentHash` — PDF baytlaridan `sha256` (§15.2 versiyalash qoidasi):
 * oxirgi versiya bilan bir xil bo'lsa, yangi versiya yaratilmaydi va shu
 * DTO mavjud yozuv uchun qaytariladi.
 */
export interface DocumentGenerateDto {
  documentId: string;
  version: number;
  fileId: string;
  contentHash: string;
  createdAt: string;
}

/** Bitta shartnoma hujjatining bitta versiyasi — ro'yxatda. */
export interface DocumentVersionDto {
  id: string;
  version: number;
  fileId: string;
  contentHash: string | null;
  createdAt: string;
}
