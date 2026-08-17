import { createHash } from 'node:crypto';

import { Currency } from '@hisobai/contracts';
import { describe, expect, it } from 'vitest';

import { buildContractPdf, type ContractPdfData } from './contract-pdf.builder';

/**
 * Haqiqiy PDF generatsiyasi (§15.8, §16.10).
 *
 * Mock emas — bu yerda `pdfkit` chindan ishlab, real baytlar tekshiriladi:
 * hujjat bo'sh emasligi, formati (`%PDF`) va §15.2 dagi versiyalash dedup
 * qoidasi tayanadigan narsa — **bir xil kirish uchun hash barqarorligi**.
 */

const DATA: ContractPdfData = {
  shop: { name: 'Tech Do\'kon', address: 'Toshkent, Chilonzor', phone: '+998901234567' },
  saleNumber: '2026-00147',
  contractDate: '2026-08-17',
  currency: Currency.UZS,
  customer: {
    fullName: 'Aliyev Vali Aliyevich',
    phone: '+998901112233',
    address: 'Toshkent shahri',
    passport: 'AB 1234567',
    pinfl: '12345678901234',
  },
  items: [
    { name: 'iPhone 15 Pro 256GB', identifier: '356789104561000', quantity: 1, unitPrice: '12000000' },
    { name: "Chexol (o'zbekcha: gʻilof)", identifier: null, quantity: 2, unitPrice: '150000' },
  ],
  cashPrice: '12300000',
  markupAmount: '2460000',
  markupPercent: '20',
  downPayment: '4000000',
  principal: '10760000',
  schedules: [
    { sequence: 1, dueDate: '2026-09-17', amountDue: '1793334' },
    { sequence: 2, dueDate: '2026-10-17', amountDue: '1793333' },
    { sequence: 3, dueDate: '2026-11-17', amountDue: '1793333' },
    { sequence: 4, dueDate: '2026-12-17', amountDue: '1793333' },
    { sequence: 5, dueDate: '2027-01-17', amountDue: '1793333' },
    { sequence: 6, dueDate: '2027-02-17', amountDue: '1793334' },
  ],
};

describe('buildContractPdf', () => {
  it('haqiqiy, bo\'sh bo\'lmagan PDF baytlarini qaytaradi', async () => {
    const buffer = await buildContractPdf(DATA);

    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('bir xil kirish uchun hash barqaror (§15.2 versiyalash dedup)', async () => {
    const first = await buildContractPdf(DATA);
    const second = await buildContractPdf(structuredClone(DATA));

    const hash = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');
    expect(hash(first)).toBe(hash(second));
  });
});
