/**
 * Fayl validatsiyasi va EXIF tozalash (`API.md` §7).
 *
 * Magic-byte tekshiruvi kutubxonasiz yozilgan: oq ro'yxatda atigi 4 ta
 * MIME bor, imzolari qisqa va barqaror — tashqi paket (masalan
 * `file-type`) faqat ESM-only muammosini qo'shardi (ilova CommonJS'da
 * qurilgan, `nest-cli.json` — `swc`).
 *
 * EXIF tozalash ham **kutubxonasiz**: konteyner darajasida metama'lumot
 * segmenti/chunk'i olib tashlanadi, piksel/skan ma'lumotiga UMUMAN
 * tegilmaydi. `sharp` (decode+encode) ilgari ishlatilgan edi, lekin bu
 * §15.7 "avtomatik siqish yo'q — fayl asl sifatida saqlanadi" bandini
 * buzardi: har qanday sifat sozlamasida qayta kodlash yo'qotishli, va
 * seriyali mahsulot rasmidagi IMEI stikeri o'qilmas bo'lib qolishi
 * mumkin edi. Shu sabab `sharp` ilova bog'liqliklaridan olib tashlandi —
 * faqat testlarda (haqiqiy dekodlanadigan fixture yaratish uchun)
 * qoldi.
 */

interface Signature {
  mimeType: string;
  extension: string;
  matches: (buffer: Buffer) => boolean;
}

const SIGNATURES: readonly Signature[] = [
  {
    mimeType: 'image/jpeg',
    extension: 'jpg',
    matches: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mimeType: 'image/png',
    extension: 'png',
    matches: (b) =>
      b.length >= 8 &&
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  {
    mimeType: 'application/pdf',
    extension: 'pdf',
    matches: (b) => b.length >= 5 && b.subarray(0, 5).toString('latin1') === '%PDF-',
  },
  {
    mimeType: 'image/webp',
    extension: 'webp',
    matches: (b) =>
      b.length >= 12 &&
      b.subarray(0, 4).toString('latin1') === 'RIFF' &&
      b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
];

/** `API.md` §7 — MIME oq ro'yxati. */
export const ALLOWED_MIME_TYPES: readonly string[] = SIGNATURES.map((s) => s.mimeType);

/** Fayl boshidagi imzodan MIME'ni aniqlaydi — topilmasa `null`. */
export function detectMimeType(buffer: Buffer): string | null {
  return SIGNATURES.find((signature) => signature.matches(buffer))?.mimeType ?? null;
}

/** `storageKey` uchun kengaytma (§7 — "Nom" saqlashda ishlatilmaydi, faqat kengaytma). */
export function extensionFor(mimeType: string): string {
  return SIGNATURES.find((s) => s.mimeType === mimeType)?.extension ?? 'bin';
}

// ──────────────────────── JPEG ────────────────────────

/**
 * `APP1` (EXIF/XMP) va `APP2` (ICC/FlashPix) segmentlarini olib
 * tashlaydi. Qolgan barcha segmentlar, jumladan `SOS`dan keyingi butun
 * skan ma'lumoti — **bayt-ba-bayt o'zgarishsiz** ko'chiriladi: `APPn`
 * segmentlari `SOS`dan OLDIN kelishi JPEG spetsifikatsiyasi bo'yicha
 * majburiy, shuning uchun `SOS` topilgach qolgan hammasini tekshirmasdan
 * ko'chirish yetarli va xavfsiz.
 */
function stripJpegMetadata(buffer: Buffer): Buffer {
  if (buffer.length < 4 || buffer.readUInt16BE(0) !== 0xffd8) {
    throw new Error("JPEG imzosi topilmadi");
  }

  const parts: Buffer[] = [buffer.subarray(0, 2)]; // SOI
  let offset = 2;

  while (offset < buffer.length) {
    if (offset + 1 >= buffer.length || buffer[offset] !== 0xff) {
      throw new Error("JPEG segmenti kutilgan joyda marker yo'q");
    }
    const markerByte: number = buffer[offset + 1] ?? 0;

    if (markerByte === 0xd9) {
      // EOI — skandan oldin uchrasa (rasm ma'lumotisiz), shu bilan tugaydi
      parts.push(buffer.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }

    if (markerByte === 0xda) {
      // SOS — shu yerdan buferning oxirigacha (skan ma'lumoti + EOI)
      // o'zgarishsiz ko'chiriladi
      parts.push(buffer.subarray(offset));
      break;
    }

    // Standalone markerlar (RSTn, TEM) — uzunlik maydonisiz, 2 bayt
    if (markerByte === 0x01 || (markerByte >= 0xd0 && markerByte <= 0xd7)) {
      parts.push(buffer.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }

    if (offset + 4 > buffer.length) throw new Error('JPEG segmenti kesilgan');
    const length = buffer.readUInt16BE(offset + 2);
    const segmentEnd = offset + 2 + length;
    if (segmentEnd > buffer.length) throw new Error('JPEG segmenti kesilgan');

    const isAppnToStrip = markerByte === 0xe1 || markerByte === 0xe2;
    if (!isAppnToStrip) {
      parts.push(buffer.subarray(offset, segmentEnd));
    }
    offset = segmentEnd;
  }

  return Buffer.concat(parts);
}

// ──────────────────────── PNG ────────────────────────

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_CHUNK_TYPES_TO_STRIP = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt']);

/**
 * Metama'lumot chunklarini butunligicha olib tashlaydi. Qolgan
 * chunklar (jumladan `IDAT`) o'z CRC'si bilan birga o'zgarishsiz
 * ko'chiriladi — ularning ma'lumoti tegilmagani uchun saqlangan CRC
 * baribir to'g'ri qoladi, qayta hisoblash shart emas.
 */
function stripPngMetadata(buffer: Buffer): Buffer {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('PNG imzosi topilmadi');
  }

  const parts: Buffer[] = [buffer.subarray(0, 8)];
  let offset = 8;

  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) throw new Error('PNG chunk kesilgan');
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    const chunkEnd = offset + 8 + length + 4; // length(4) + type(4) + data + crc(4)
    if (chunkEnd > buffer.length) throw new Error('PNG chunk kesilgan');

    if (!PNG_CHUNK_TYPES_TO_STRIP.has(type)) {
      parts.push(buffer.subarray(offset, chunkEnd));
    }
    offset = chunkEnd;
    if (type === 'IEND') break;
  }

  return Buffer.concat(parts);
}

// ──────────────────────── WebP ────────────────────────

const WEBP_CHUNKS_TO_STRIP = new Set(['EXIF', 'XMP ']);

/**
 * RIFF konteyneridan `EXIF` va `XMP ` chunklarini olib tashlaydi.
 * Boshqa subchunklar (`VP8 `/`VP8L`/`VP8X`/`ALPH`/`ANIM`...) o'zgarishsiz
 * qoladi. Tashqi `RIFF` sarlavhasidagi umumiy hajm maydoni olib
 * tashlangan chunklarga mos ravishda qayta hisoblanadi — bu yagona
 * "header" o'zgarishi, chunk ma'lumotiga tegilmaydi.
 */
function stripWebpMetadata(buffer: Buffer): Buffer {
  if (
    buffer.length < 12 ||
    buffer.toString('latin1', 0, 4) !== 'RIFF' ||
    buffer.toString('latin1', 8, 12) !== 'WEBP'
  ) {
    throw new Error('WebP imzosi topilmadi');
  }

  const parts: Buffer[] = [];
  let offset = 12;

  while (offset < buffer.length) {
    if (offset + 8 > buffer.length) throw new Error('WebP chunk kesilgan');
    const fourCc = buffer.toString('latin1', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const padded = size + (size % 2);
    const chunkEnd = offset + 8 + padded;
    if (chunkEnd > buffer.length) throw new Error('WebP chunk kesilgan');

    if (!WEBP_CHUNKS_TO_STRIP.has(fourCc)) {
      parts.push(buffer.subarray(offset, chunkEnd));
    }
    offset = chunkEnd;
  }

  const dataLength = parts.reduce((sum, part) => sum + part.length, 0);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(4 + dataLength, 4); // "WEBP" + qolgan chunklar
  header.write('WEBP', 8, 'latin1');

  return Buffer.concat([header, ...parts]);
}

const STRIPPABLE_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * EXIF/GPS'ni olib tashlaydi (`API.md` §7 — passport rasmidagi GPS
 * koordinatalari). PDF'ga tegilmaydi: EXIF tushunchasi yo'q, bu band
 * faqat rasmlarga oid.
 */
export function stripImageMetadata(buffer: Buffer, mimeType: string): Buffer {
  if (!STRIPPABLE_IMAGE_TYPES.has(mimeType)) return buffer;

  switch (mimeType) {
    case 'image/jpeg':
      return stripJpegMetadata(buffer);
    case 'image/png':
      return stripPngMetadata(buffer);
    case 'image/webp':
      return stripWebpMetadata(buffer);
    default:
      return buffer;
  }
}

/** `Content-Disposition` uchun — tirnoq va boshqaruv belgilari olib tashlanadi. */
export function sanitizeFilename(name: string): string {
  const cleaned = name.replaceAll(/["\r\n]/gu, '').trim();
  return cleaned.length > 0 ? cleaned : 'fayl';
}
