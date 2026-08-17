import { join } from 'node:path';

import { Currency, formatMoneyWithCurrency } from '@hisobai/contracts';
import PDFDocument from 'pdfkit';

import { FONT_BOLD, FONT_REGULAR } from './fonts';

/**
 * Nasiya shartnomasi PDF'i (`DECISIONS.md` §15.8, §16.10).
 *
 * **Qat'iy qoida: bu yerda hech qanday pul arifmetikasi yo'q.** Har bir
 * maydon chaqiruvchidan tayyor satr sifatida keladi — snapshot ustundan
 * o'qilgan (`installments.service.ts`ga o'xshab qayta hisoblamaydi).
 * `formatMoneyWithCurrency` faqat KO'RSATISH uchun formatlaydi (bo'sh joy
 * ajratgichi, valyuta belgisi), yig'indi yoki ko'paytma HISOBLAMAYDI.
 * Shu sabab `unitPrice × quantity` qatorda ko'rinmaydi — jami naqd narx
 * `cashPrice` ustunidan alohida ko'rsatiladi (§17.3).
 *
 * **`contractDate` bu yerga tayyor kalendar sana sifatida keladi**
 * (`installments`dagi `contract.createdAt` dan, generatsiya vaqti EMAS):
 * PDF mazmunida generatsiya vaqti kabi har safar o'zgaradigan maydon
 * bo'lsa, `contentHash` hech qachon mos kelmay qoladi va §15.2 dagi
 * versiyalash dedup qoidasi ishlamay qoladi.
 */
export interface ContractPdfItem {
  name: string;
  /** IMEI/seriya raqami — partiya mahsulotida `null`. */
  identifier: string | null;
  quantity: number;
  unitPrice: string;
}

export interface ContractPdfScheduleRow {
  sequence: number;
  /** `YYYY-MM-DD`. */
  dueDate: string;
  amountDue: string;
}

export interface ContractPdfData {
  shop: { name: string; address: string | null; phone: string | null };
  saleNumber: string | null;
  /** `YYYY-MM-DD` — `contract.createdAt`, do'kon vaqt zonasida (§1.3). */
  contractDate: string;
  currency: Currency;
  customer: {
    fullName: string;
    phone: string;
    address: string | null;
    /** `"AB 1234567"` ko'rinishida — `passportSeries` + `passportNumber`. */
    passport: string | null;
    pinfl: string | null;
  };
  items: ContractPdfItem[];
  cashPrice: string;
  markupAmount: string;
  markupPercent: string | null;
  downPayment: string;
  principal: string;
  schedules: ContractPdfScheduleRow[];
}

const PAGE_MARGIN = 50;
const LOGO_PATH = join(__dirname, '../assets/hisobai-logo.png');
const LOGO_WIDTH = 110;

/** `PDFDocument` — Node oqimi; baytlar `data`/`end` orqali yig'iladi. */
export async function buildContractPdf(data: ContractPdfData): Promise<Buffer> {
  const doc = new PDFDocument({
    margin: PAGE_MARGIN,
    bufferPages: true,
    autoFirstPage: true,
    // `pdfkit` `info.CreationDate` standart `new Date()` — bu qo'yilmasa
    // hujjat `/ID`si ham shundan chiqadi (`PDFSecurity.generateFileID`,
    // `pdfkit.js`) va HAR CHAQIRISHDA baytlar farq qiladi, garchi ko'zga
    // ko'rinadigan mazmun bir xil bo'lsa ham — §15.2 dagi hash dedup
    // qoidasi shu tufayli hech qachon ishlamas edi. Shartnoma sanasi
    // fiksatsiya sifatida olinadi: u ham deterministik, ham mazmunga oid.
    info: { CreationDate: new Date(`${data.contractDate}T00:00:00.000Z`) },
  });

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  // §15.8 — `Inter` fayli repoda yo'q (`fonts.ts`dagi izoh), shuning uchun
  // DejaVu Sans embed qilinadi. Ikkalasi ham `.registerFont` orqali —
  // standart Helvetica hech qachon chizilmaydi (u kirill/oʻzbek belgilarini
  // bilmaydi).
  doc.registerFont('Regular', FONT_REGULAR);
  doc.registerFont('Bold', FONT_BOLD);
  doc.font('Regular');

  drawHeader(doc, data);
  drawTitle(doc, data);
  drawCustomer(doc, data);
  drawItemsTable(doc, data);
  drawFinanceSummary(doc, data);
  drawScheduleTable(doc, data);
  drawSignatures(doc);

  doc.end();
  return done;
}

function drawHeader(doc: PDFKit.PDFDocument, data: ContractPdfData): void {
  // §16.10 — logotip: do'konniki bo'lsa o'sha (StorageProvider hozircha
  // baytlarni o'qish imkonini bermaydi — ochiq savol, hisobotda yozilgan),
  // bo'lmasa HisobAI logosi.
  doc.image(LOGO_PATH, PAGE_MARGIN, PAGE_MARGIN, { width: LOGO_WIDTH });

  const infoX = PAGE_MARGIN + LOGO_WIDTH + 20;
  const infoWidth = doc.page.width - PAGE_MARGIN - infoX;
  doc.font('Bold').fontSize(15).text(data.shop.name, infoX, PAGE_MARGIN, { width: infoWidth });
  doc.font('Regular').fontSize(9);
  if (data.shop.address) doc.text(data.shop.address, infoX, doc.y, { width: infoWidth });
  if (data.shop.phone) doc.text(data.shop.phone, infoX, doc.y, { width: infoWidth });

  doc.y = Math.max(doc.y, PAGE_MARGIN + LOGO_WIDTH * (240 / 951)) + 15;
  doc.x = PAGE_MARGIN;
}

function drawTitle(doc: PDFKit.PDFDocument, data: ContractPdfData): void {
  doc
    .font('Bold')
    .fontSize(13)
    .text("NASIYA OLDI-SOTDI SHARTNOMASI", PAGE_MARGIN, doc.y, {
      width: doc.page.width - PAGE_MARGIN * 2,
      align: 'center',
    });
  doc.moveDown(0.3);
  doc
    .font('Regular')
    .fontSize(10)
    .text(
      `Shartnoma raqami: ${data.saleNumber ?? '—'}      Sana: ${formatDate(data.contractDate)}`,
      PAGE_MARGIN,
      doc.y,
      { width: doc.page.width - PAGE_MARGIN * 2, align: 'center' },
    );
  doc.moveDown(1);
}

function drawCustomer(doc: PDFKit.PDFDocument, data: ContractPdfData): void {
  doc.font('Bold').fontSize(11).text('Xaridor', PAGE_MARGIN, doc.y);
  doc.font('Regular').fontSize(10);
  doc.text(`F.I.Sh.: ${data.customer.fullName}`);
  doc.text(`Telefon: ${data.customer.phone}`);
  if (data.customer.address) doc.text(`Manzil: ${data.customer.address}`);
  if (data.customer.passport) doc.text(`Passport: ${data.customer.passport}`);
  if (data.customer.pinfl) doc.text(`PINFL: ${data.customer.pinfl}`);
  doc.moveDown(1);
}

function drawItemsTable(doc: PDFKit.PDFDocument, data: ContractPdfData): void {
  doc.font('Bold').fontSize(11).text('Mahsulotlar', PAGE_MARGIN, doc.y);
  doc.moveDown(0.3);

  // `.table({ data })` shakli `PDFDocument`ning O'ZINI qaytaradi (sinxron,
  // sodda massiv uchun) — `PDFTableObject.end()` faqat `.table()` (`data`siz,
  // `.row()` bilan qo'lda to'ldirilganda) chaqirilganda kerak. Bu yerga
  // `.end()` qo'shilsa, butun PDF oqimi VAQTIDAN OLDIN yopilib qolardi.
  doc.table({
    columnStyles: ['5%', '43%', '27%', '10%', '15%'],
    defaultStyle: { padding: 5, fontSize: 9 },
    data: [
      ['#', 'Mahsulot', 'IMEI / seriya', 'Miqdor', 'Birlik narxi'].map(headerCell),
      ...data.items.map((item, index) => [
        String(index + 1),
        item.name,
        item.identifier ?? '—',
        String(item.quantity),
        formatMoneyWithCurrency(item.unitPrice, data.currency),
      ]),
    ],
  });
  doc.moveDown(1);
}

function drawFinanceSummary(doc: PDFKit.PDFDocument, data: ContractPdfData): void {
  doc.font('Bold').fontSize(11).text('Hisob-kitob', PAGE_MARGIN, doc.y);
  doc.moveDown(0.3);
  doc.font('Regular').fontSize(10);

  const money = (value: string): string => formatMoneyWithCurrency(value, data.currency);
  doc.text(`Naqd narx: ${money(data.cashPrice)}`);
  const markupLabel = data.markupPercent
    ? `Ustama: ${money(data.markupAmount)} (${data.markupPercent}%)`
    : `Ustama: ${money(data.markupAmount)}`;
  doc.text(markupLabel);
  doc.text(`Boshlang'ich to'lov: ${money(data.downPayment)}`);
  doc.font('Bold').text(`Jami qarz: ${money(data.principal)}`);
  doc.moveDown(1);
}

function drawScheduleTable(doc: PDFKit.PDFDocument, data: ContractPdfData): void {
  doc.font('Bold').fontSize(11).text("To'lov jadvali", PAGE_MARGIN, doc.y);
  doc.moveDown(0.3);

  doc.table({
    columnStyles: ['10%', '45%', '45%'],
    defaultStyle: { padding: 5, fontSize: 9 },
    data: [
      ['#', 'Muddat', 'Summasi'].map(headerCell),
      ...data.schedules.map((row) => [
        String(row.sequence),
        formatDate(row.dueDate),
        formatMoneyWithCurrency(row.amountDue, data.currency),
      ]),
    ],
  });
  doc.moveDown(1);
}

function drawSignatures(doc: PDFKit.PDFDocument): void {
  // Sahifa oxiriga yaqin bo'lsa — imzo bloki yangi sahifaga o'tadi
  // (§15.8 — imzo joylari matn bilan aralashib ketmasin).
  const remaining = doc.page.height - doc.page.margins.bottom - doc.y;
  if (remaining < 120) doc.addPage();

  doc.moveDown(2);
  doc.font('Regular').fontSize(10);
  const colWidth = (doc.page.width - PAGE_MARGIN * 2 - 40) / 2;
  const y = doc.y;
  doc.text("Sotuvchi: _____________________  /  F.I.Sh.", PAGE_MARGIN, y, { width: colWidth });
  doc.text('Xaridor: _____________________  /  F.I.Sh.', PAGE_MARGIN + colWidth + 40, y, {
    width: colWidth,
  });
}

/** `"2026-08-17"` → `"17.08.2026"` — insonga o'qish uchun (§2.2 kalendar sana). */
function formatDate(value: string): string {
  const [year, month, day] = value.split('-');
  return `${day}.${month}.${year}`;
}

/**
 * Jadval sarlavha katagi. `RowStyle`da `font` yo'q (faqat `CellOptions`da
 * bor) — shuning uchun har bir sarlavha katagi shu shaklda alohida
 * beriladi. `family: 'Bold'` (ro'yxatdan o'tgan alias) chizishda e'tiborga
 * OLINMAYDI — pdfkit uni faqat TTC/DFont subfamily sifatida ishlatadi;
 * tekshirilgan (`pdf/contract-pdf.builder.spec.ts`), shuning uchun `src`
 * to'g'ridan-to'g'ri shrift fayliga ishora qiladi.
 */
function headerCell(text: string): PDFKit.Mixins.CellOptions {
  return { text, font: { src: FONT_BOLD }, backgroundColor: '#eeeeee' };
}
