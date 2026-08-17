import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';

import { stripImageMetadata } from './file-validation';

/**
 * §7 — EXIF/GPS tozalash **piksel/skan ma'lumotiga tegmasdan**
 * ishlashi shart. `sharp` faqat shu testda — haqiqiy dekodlanadigan
 * fixture yaratish uchun ishlatiladi, ishlab chiqarish kodida yo'q
 * (`file-validation.ts` izohiga qarang).
 *
 * Tekshiruv strategiyasi: metama'lumot faqat qo'shimcha segment/chunk
 * sifatida qo'shiladi (piksel ma'lumoti — `SOS` dan keyingi JPEG skani,
 * PNG `IDAT`, WebP `VP8`/`VP8L` — tegilmaydi), shuning uchun tozalash
 * natijasi ASL (metama'lumotsiz) buferga **bayt-ba-bayt teng** bo'lishi
 * kerak. Bu "piksel o'zgarmadi" degan da'voni dekodlashsiz, qattiqroq
 * shaklda isbotlaydi.
 */

const GPS_MARKER = 'GPSLatitude=41.311,69.279';

let jpegBaseline: Buffer;
let pngBaseline: Buffer;
let webpBaseline: Buffer;

beforeAll(async () => {
  const image = () => sharp({ create: { width: 4, height: 4, channels: 3, background: '#ff0000' } });
  jpegBaseline = await image().jpeg().toBuffer();
  pngBaseline = await image().png().toBuffer();
  webpBaseline = await image().webp().toBuffer();
});

/** SOI'dan keyin qalbaki `APP1` (EXIF) va `APP2` segmentlarini qo'shadi. */
function injectJpegMetadata(baseline: Buffer): Buffer {
  const exifPayload = Buffer.from(`Exif\0\0${GPS_MARKER}`, 'latin1');
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1]),
    uint16be(exifPayload.length + 2),
    exifPayload,
  ]);
  const app2Payload = Buffer.from('ICC_PROFILE junk', 'latin1');
  const app2 = Buffer.concat([
    Buffer.from([0xff, 0xe2]),
    uint16be(app2Payload.length + 2),
    app2Payload,
  ]);
  return Buffer.concat([baseline.subarray(0, 2), app1, app2, baseline.subarray(2)]);
}

function uint16be(value: number): Buffer {
  const buf = Buffer.alloc(2);
  buf.writeUInt16BE(value, 0);
  return buf;
}

/** IHDR'dan keyin qalbaki `tEXt` va `eXIf` chunklarini qo'shadi. */
function injectPngMetadata(baseline: Buffer): Buffer {
  const ihdrEnd = 8 + 8 + 13 + 4; // signature(8) + length+type(8) + IHDR data(13) + CRC(4)
  const textChunk = pngChunk('tEXt', Buffer.from(`GPS\0${GPS_MARKER}`, 'latin1'));
  const exifChunk = pngChunk('eXIf', Buffer.from('fake-exif-bytes', 'latin1'));
  return Buffer.concat([
    baseline.subarray(0, ihdrEnd),
    textChunk,
    exifChunk,
    baseline.subarray(ihdrEnd),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  // Chunk CRC qiymati testda tekshirilmaydi — `stripPngMetadata` uni
  // qayta hisoblamaydi, chunkni butunligicha olib tashlaydi. Shuning
  // uchun ixtiyoriy 4 bayt yetarli.
  const crc = Buffer.from([0, 0, 0, 0]);
  return Buffer.concat([length, typeAndData, crc]);
}

/** RIFF konteyneriga `EXIF` subchunk qo'shadi va tashqi hajmni yangilaydi. */
function injectWebpMetadata(baseline: Buffer): Buffer {
  const imageChunks = baseline.subarray(12);
  const exifData = Buffer.from(GPS_MARKER, 'latin1');
  const exifChunk = riffChunk('EXIF', exifData);
  const newChunks = Buffer.concat([imageChunks, exifChunk]);

  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(4 + newChunks.length, 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, newChunks]);
}

function riffChunk(fourCc: string, data: Buffer): Buffer {
  const size = Buffer.alloc(4);
  size.writeUInt32LE(data.length, 0);
  const padded = data.length % 2 === 1 ? Buffer.concat([data, Buffer.from([0])]) : data;
  return Buffer.concat([Buffer.from(fourCc, 'latin1'), size, padded]);
}

describe('stripImageMetadata — JPEG', () => {
  it("APP1/APP2 olib tashlaydi, piksel (skan) ma'lumoti bayt-ba-bayt saqlanadi", () => {
    const dirty = injectJpegMetadata(jpegBaseline);
    expect(dirty.includes(GPS_MARKER)).toBe(true);

    const cleaned = stripImageMetadata(dirty, 'image/jpeg');

    expect(cleaned.includes(GPS_MARKER)).toBe(false);
    expect(cleaned.equals(jpegBaseline)).toBe(true);
  });

  it("EXIF'siz faylni o'zgarishsiz qaytaradi (buzilmaydi)", () => {
    const cleaned = stripImageMetadata(jpegBaseline, 'image/jpeg');
    expect(cleaned.equals(jpegBaseline)).toBe(true);
  });
});

describe('stripImageMetadata — PNG', () => {
  it("tEXt/eXIf chunklarni olib tashlaydi, IDAT bayt-ba-bayt saqlanadi", () => {
    const dirty = injectPngMetadata(pngBaseline);
    expect(dirty.includes(GPS_MARKER)).toBe(true);

    const cleaned = stripImageMetadata(dirty, 'image/png');

    expect(cleaned.includes(GPS_MARKER)).toBe(false);
    expect(cleaned.equals(pngBaseline)).toBe(true);
  });

  it("metama'lumotsiz faylni o'zgarishsiz qaytaradi (buzilmaydi)", () => {
    const cleaned = stripImageMetadata(pngBaseline, 'image/png');
    expect(cleaned.equals(pngBaseline)).toBe(true);
  });
});

describe('stripImageMetadata — WebP', () => {
  it("EXIF subchunkni olib tashlaydi, tasvir ma'lumoti bayt-ba-bayt saqlanadi", () => {
    const dirty = injectWebpMetadata(webpBaseline);
    expect(dirty.includes(GPS_MARKER)).toBe(true);

    const cleaned = stripImageMetadata(dirty, 'image/webp');

    expect(cleaned.includes(GPS_MARKER)).toBe(false);
    expect(cleaned.equals(webpBaseline)).toBe(true);
  });

  it("metama'lumotsiz faylni o'zgarishsiz qaytaradi (buzilmaydi)", () => {
    const cleaned = stripImageMetadata(webpBaseline, 'image/webp');
    expect(cleaned.equals(webpBaseline)).toBe(true);
  });
});

describe('stripImageMetadata — PDF', () => {
  it("tegilmaydi", () => {
    const pdf = Buffer.from('%PDF-1.4\n...fake...');
    expect(stripImageMetadata(pdf, 'application/pdf').equals(pdf)).toBe(true);
  });
});
