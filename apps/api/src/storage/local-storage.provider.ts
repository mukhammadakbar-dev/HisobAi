import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env';
import type { DownloadMeta } from './storage.provider';
import { StorageProvider } from './storage.provider';

/** Tokendan tiklangan yuk — muddat, kalit va berish uchun meta. */
interface TokenPayload {
  key: string;
  exp: number;
  mimeType: string;
  downloadName: string;
}

/** `resolveDownload()` natijasi. */
export interface ResolvedDownload {
  buffer: Buffer;
  mimeType: string;
  downloadName: string;
}

/**
 * Dev adapteri — fayllar `STORAGE_LOCAL_PATH` papkasiga yoziladi.
 *
 * MinIO'dagi presigned URL o'rnini ichki `GET /files/download/:token`
 * marshruti bosadi (`files.controller.ts`). Token — HMAC bilan
 * imzolangan `{ key, exp, mimeType, downloadName }`: muddat MinIO
 * presigned URL bilan bir xil semantikada (vaqt tugagach yaroqsiz,
 * lekin bir martalik EMAS — MinIO presigned URL ham shunday: muddati
 * tugagunicha necha marta ishlatilsa bo'ladi). Meta tokenning o'zida
 * saqlanadi, baza so'rovi yo'q: `download` marshruti `@Public()`, ya'ni
 * shop konteksti ochilmagan (§14.4) — bu yerda `FileAsset`ni Prisma
 * orqali qayta o'qish RLS kontekstisiz `SHOP_CONTEXT_MISSING`ga olib
 * kelardi.
 */
@Injectable()
export class LocalStorageProvider extends StorageProvider {
  constructor(private readonly config: ConfigService<Env, true>) {
    super();
  }

  private get rootDir(): string {
    return resolve(this.config.get('STORAGE_LOCAL_PATH', { infer: true }));
  }

  private get secret(): string {
    return this.config.get('STORAGE_LOCAL_TOKEN_SECRET', { infer: true });
  }

  /**
   * Kalitni ildiz papka ichida qolishga majburlaydi; chiqib ketsa `null`.
   *
   * Token HMAC bilan imzolangan, lekin `STORAGE_LOCAL_TOKEN_SECRET` ning
   * standart qiymati bor va `GET /files/download/:token` marshruti
   * `@Public()` — imzo qalbakilashtirilsa `key: "../../../../etc/passwd"`
   * bilan sessiyasiz ixtiyoriy fayl o'qilardi. Imzoga ishonish yetarli
   * emas: yo'l tekshiruvi mustaqil ikkinchi qatlam bo'lib turishi kerak.
   */
  private safePath(key: string): string | null {
    const root = this.rootDir;
    const target = resolve(root, key);
    if (target !== root && !target.startsWith(root + sep)) return null;
    return target;
  }

  async put(key: string, buffer: Buffer, _mimeType: string): Promise<void> {
    // MIME turi bu yerda saqlanmaydi — u `getSignedUrl()` chaqirilganda
    // `meta` orqali tokenning o'ziga ko'chadi (izohga qarang).
    const target = this.safePath(key);
    if (!target) throw new Error('Storage kaliti ildiz papkadan tashqariga chiqadi');
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, buffer);
  }

  getSignedUrl(key: string, ttlSeconds: number, meta: DownloadMeta): Promise<string> {
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const token = this.sign({ key, exp: expiresAt, ...meta });
    return Promise.resolve(`/api/v1/files/download/${token}`);
  }

  async delete(key: string): Promise<void> {
    const target = this.safePath(key);
    if (!target) throw new Error('Storage kaliti ildiz papkadan tashqariga chiqadi');
    await rm(target, { force: true });
  }

  async healthCheck(): Promise<boolean> {
    try {
      await mkdir(this.rootDir, { recursive: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Tokenni tekshiradi va faylni o'qiydi. Muddati o'tgan yoki imzo mos
   * kelmasa `null` — `FilesController` buni `404` deb qaytaradi, chunki
   * yaroqsiz token real fayl bilan bog'liq bo'lmagan so'rovdan farq
   * qilmaydi (Cross-Shop miss bilan bir xil falsafa, `API.md`).
   */
  async resolveDownload(token: string): Promise<ResolvedDownload | null> {
    const payload = this.verify(token);
    if (!payload) return null;

    const target = this.safePath(payload.key);
    if (!target) return null;

    try {
      const buffer = await readFile(target);
      return { buffer, mimeType: payload.mimeType, downloadName: payload.downloadName };
    } catch {
      return null;
    }
  }

  private sign(payload: TokenPayload): string {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', this.secret).update(encoded).digest('base64url');
    return `${encoded}.${signature}`;
  }

  private verify(token: string): TokenPayload | null {
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) return null;

    const expected = createHmac('sha256', this.secret).update(encoded).digest('base64url');
    const provided = Buffer.from(signature);
    const wanted = Buffer.from(expected);
    if (provided.length !== wanted.length || !timingSafeEqual(provided, wanted)) return null;

    try {
      const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
      if (
        typeof payload.key !== 'string' ||
        typeof payload.exp !== 'number' ||
        typeof payload.mimeType !== 'string' ||
        typeof payload.downloadName !== 'string'
      ) {
        return null;
      }
      if (Date.now() > payload.exp) return null;
      return payload;
    } catch {
      return null;
    }
  }
}
