import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { convertWithLibreOffice, extractDocument, findLibreOffice } from '../src';

let dir: string;
let hasLibreOffice = false;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edushare-office-'));
  hasLibreOffice = Boolean(await findLibreOffice());
});
afterAll(async () => fs.rm(dir, { recursive: true, force: true }));

describe('spreadsheets (ExcelJS)', () => {
  it('extracts text from every sheet', async () => {
    const wb = new ExcelJS.Workbook();
    wb.title = 'P7 Marks';
    wb.addWorksheet('Term 1').addRows([
      ['Name', 'Maths'],
      ['Okello', 87],
    ]);
    wb.addWorksheet('Term 2').addRows([
      ['Name', 'Science'],
      ['Nakato', 91],
    ]);
    const file = path.join(dir, 'marks.xlsx');
    await wb.xlsx.writeFile(file);
    const r = await extractDocument(file, 'xlsx');
    expect(r.pageCount).toBe(2);
    expect(r.text).toContain('Okello | 87');
    expect(r.text).toContain('Nakato');
    expect(r.metadata.title).toBe('P7 Marks');
  });
});

describe('LibreOffice conversion', () => {
  it('converts a document to PDF and extracts its text', async (ctx) => {
    if (!hasLibreOffice) ctx.skip();
    // Build a real .doc by converting a text file with LibreOffice itself.
    const txt = path.join(dir, 'lesson.txt');
    await fs.writeFile(txt, 'Lesson plan: photosynthesis in green plants.');
    const doc = await convertWithLibreOffice(txt, 'pdf');
    // Installations with only libreoffice-core lack the Writer import filters.
    if (!doc) ctx.skip();
    const r = await extractDocument(doc!, 'pdf');
    expect(r.text).toContain('photosynthesis');
    await fs.rm(doc!, { force: true });
  }, 120_000);
});
