import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';

import type { Env } from '../config/env';
import type { DownloadMeta } from './storage.provider';
import { StorageProvider } from './storage.provider';

/**
 * Prod adapteri — MinIO (S3-mos, `DECISIONS.md` §0.2, §16.13).
 *
 * Rasmiy `minio` SDK ishlatiladi. Bitta bucket (`STORAGE_BUCKET`) —
 * `DECISIONS.md` bucket'ni yaratish operatorlik amali, ilova uni o'zi
 * yaratmaydi: yaratish uchun admin huquqi kerak bo'lardi, ilova esa
 * faqat o'qish/yozish kalitlariga ega bo'lishi kifoya.
 */
@Injectable()
export class MinioStorageProvider extends StorageProvider {
  private readonly client: Client;
  private readonly bucket: string;

  constructor(config: ConfigService<Env, true>) {
    super();
    const endpoint = new URL(config.get('STORAGE_ENDPOINT', { infer: true }));
    this.bucket = config.get('STORAGE_BUCKET', { infer: true });
    this.client = new Client({
      endPoint: endpoint.hostname,
      port: endpoint.port ? Number(endpoint.port) : endpoint.protocol === 'https:' ? 443 : 80,
      useSSL: endpoint.protocol === 'https:',
      accessKey: config.get('STORAGE_ACCESS_KEY', { infer: true }) ?? '',
      secretKey: config.get('STORAGE_SECRET_KEY', { infer: true }) ?? '',
    });
  }

  async put(key: string, buffer: Buffer, mimeType: string): Promise<void> {
    await this.client.putObject(this.bucket, key, buffer, buffer.length, {
      'Content-Type': mimeType,
    });
  }

  getSignedUrl(key: string, ttlSeconds: number, meta: DownloadMeta): Promise<string> {
    // `Content-Disposition: attachment` (`API.md` §7) — MinIO'da so'rov
    // parametri sifatida so'raladi, o'zi object metadata'ga yozilmaydi.
    return this.client.presignedGetObject(this.bucket, key, ttlSeconds, {
      'response-content-disposition': `attachment; filename="${sanitizeFilename(meta.downloadName)}"`,
    });
  }

  async delete(key: string): Promise<void> {
    await this.client.removeObject(this.bucket, key);
  }

  async healthCheck(): Promise<boolean> {
    try {
      return await this.client.bucketExists(this.bucket);
    } catch {
      return false;
    }
  }
}

/** Header injection'dan himoya — tirnoq va boshqaruv belgilari olib tashlanadi. */
function sanitizeFilename(name: string): string {
  return name.replaceAll(/["\r\n]/gu, '');
}
