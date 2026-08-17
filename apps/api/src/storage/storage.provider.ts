/**
 * Fayl saqlash porti (`DECISIONS.md` §0.2, §16.13).
 *
 * Ikkita adapter bor: `LocalStorageProvider` (dev, disk) va
 * `MinioStorageProvider` (prod, S3-mos). Tanlov `STORAGE_DRIVER` env
 * bilan `storage.module.ts`da qilinadi — chaqiruvchi kod (`FilesService`,
 * `HealthController`) faqat shu abstraksiyani ko'radi.
 *
 * `key` — `storageKey`, UUID asosida (`API.md` §7), bucket ichidagi
 * yo'l. Interfeys uni tenant izolyatsiyasi deb hisoblamaydi: izolyatsiya
 * `files.shop_id` + RLS orqali, bu yerda faqat operatsion tartib.
 */
/**
 * `getSignedUrl`ga beriladigan ixtiyoriy meta — `Content-Disposition:
 * attachment` uchun fayl nomi (`API.md` §7). MinIO buni presigned URL
 * so'rov parametriga qo'yadi; lokal adapter esa tokenning o'ziga
 * ko'madi (baza so'rovisiz, §14.4 — `download` marshruti `@Public()`
 * bo'lgani uchun shop konteksti yo'q).
 */
export interface DownloadMeta {
  mimeType: string;
  downloadName: string;
}

export abstract class StorageProvider {
  /** Faylni saqlaydi. Mavjud kalitni ustidan yozmaydi — kalit har doim yangi UUID. */
  abstract put(key: string, buffer: Buffer, mimeType: string): Promise<void>;

  /**
   * Vaqtinchalik havola (§15.5). `ttlSeconds` chaqiruvchidan keladi:
   * `FilesService` `PASSPORT` uchun 5 daqiqa, qolganlari uchun 15
   * daqiqa beradi (`API.md` §7) — provayder bu farqni bilmaydi.
   */
  abstract getSignedUrl(key: string, ttlSeconds: number, meta: DownloadMeta): Promise<string>;

  abstract delete(key: string): Promise<void>;

  /** `GET /health/ready` shuni chaqiradi (`API.md` §10). */
  abstract healthCheck(): Promise<boolean>;
}
