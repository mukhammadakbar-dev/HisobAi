import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Env } from '../config/env';
import { LocalStorageProvider } from './local-storage.provider';

/**
 * Lokal adapterning jimgina buziladigan xulqi: token muddati tugagach
 * yoki imzo mos kelmaganda fayl **berilmasligi** kerak — aks holda
 * §15.5 dagi "vaqtinchalik havola" cheksiz havolaga aylanadi.
 */
describe('LocalStorageProvider', () => {
  let root: string;
  let provider: LocalStorageProvider;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'hisobai-storage-'));
    const config = {
      get: (key: keyof Env) => {
        if (key === 'STORAGE_LOCAL_PATH') return root;
        if (key === 'STORAGE_LOCAL_TOKEN_SECRET') return 'test-secret';
        throw new Error(`unexpected key: ${key}`);
      },
    } as unknown as ConfigService<Env, true>;
    provider = new LocalStorageProvider(config);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('put() dan keyin getSignedUrl() tokeni bilan faylni qaytaradi', async () => {
    await provider.put('shop-1/RECEIPT/abc.jpg', Buffer.from('salom'), 'image/jpeg');
    const url = await provider.getSignedUrl('shop-1/RECEIPT/abc.jpg', 60, {
      mimeType: 'image/jpeg',
      downloadName: 'chek.jpg',
    });
    const token = url.split('/').pop() ?? '';

    const resolved = await provider.resolveDownload(token);
    expect(resolved?.buffer.toString()).toBe('salom');
    expect(resolved?.mimeType).toBe('image/jpeg');
    expect(resolved?.downloadName).toBe('chek.jpg');
  });

  it('muddati tugagan tokenni rad etadi', async () => {
    await provider.put('shop-1/RECEIPT/abc.jpg', Buffer.from('salom'), 'image/jpeg');
    const url = await provider.getSignedUrl('shop-1/RECEIPT/abc.jpg', -1, {
      mimeType: 'image/jpeg',
      downloadName: 'chek.jpg',
    });
    const token = url.split('/').pop() ?? '';

    expect(await provider.resolveDownload(token)).toBeNull();
  });

  it("noto'g'ri imzoli tokenni rad etadi", async () => {
    await provider.put('shop-1/RECEIPT/abc.jpg', Buffer.from('salom'), 'image/jpeg');
    const url = await provider.getSignedUrl('shop-1/RECEIPT/abc.jpg', 60, {
      mimeType: 'image/jpeg',
      downloadName: 'chek.jpg',
    });
    const token = `${url.split('/').pop()}tampered`;

    expect(await provider.resolveDownload(token)).toBeNull();
  });

  it("delete() dan keyin fayl topilmaydi", async () => {
    await provider.put('shop-1/RECEIPT/abc.jpg', Buffer.from('salom'), 'image/jpeg');
    await provider.delete('shop-1/RECEIPT/abc.jpg');
    const url = await provider.getSignedUrl('shop-1/RECEIPT/abc.jpg', 60, {
      mimeType: 'image/jpeg',
      downloadName: 'chek.jpg',
    });
    const token = url.split('/').pop() ?? '';

    expect(await provider.resolveDownload(token)).toBeNull();
  });

  it('healthCheck() papka yozilishini tekshiradi', async () => {
    expect(await provider.healthCheck()).toBe(true);
  });

  /**
   * Imzo o'zi yetarli himoya emas: `STORAGE_LOCAL_TOKEN_SECRET` ning
   * standart qiymati repoda ochiq va `download` marshruti `@Public()`.
   * Kalitni o'zi imzolay oladigan hujumchi ham ildiz papkadan chiqa
   * olmasligi kerak — quyidagi testlar aynan shu holatni modellaydi
   * (token to'g'ri imzo bilan, `provider` ning o'zi orqali yasaladi).
   */
  describe('ildiz papkadan chiqish', () => {
    const meta = { mimeType: 'text/plain', downloadName: 'x.txt' };

    it("to'g'ri imzolangan bo'lsa ham `../` kalitini o'qimaydi", async () => {
      const outside = join(root, '..', 'hisobai-traversal-target.txt');
      await writeFile(outside, 'maxfiy');

      const url = await provider.getSignedUrl('../hisobai-traversal-target.txt', 60, meta);
      const token = url.split('/').pop() ?? '';

      try {
        expect(await provider.resolveDownload(token)).toBeNull();
      } finally {
        await rm(outside, { force: true });
      }
    });

    it('absolyut kalitni ham rad etadi', async () => {
      const url = await provider.getSignedUrl('/etc/passwd', 60, meta);
      const token = url.split('/').pop() ?? '';

      expect(await provider.resolveDownload(token)).toBeNull();
    });

    it("put() ildizdan tashqariga yozmaydi", async () => {
      await expect(
        provider.put('../hisobai-traversal-write.txt', Buffer.from('yo'), 'text/plain'),
      ).rejects.toThrow(/tashqariga/);
    });

    it("delete() ildizdan tashqarini o'chirmaydi", async () => {
      await expect(provider.delete('../hisobai-traversal-write.txt')).rejects.toThrow(/tashqariga/);
    });
  });
});
