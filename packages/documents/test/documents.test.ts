import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createThumbnailVariants,
  detectFileType,
  extractDocument,
  renderCover,
  renderSourceImage,
  UnsupportedFileError,
} from '../src';

let dir: string;
let pdfPath: string;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edushare-docs-'));
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 2; i++) {
    doc.addPage([595, 842]).drawText(`Photosynthesis in green plants page ${i + 1}`, { x: 50, y: 780, size: 16, font });
  }
  doc.setTitle('P6 Science Notes');
  pdfPath = path.join(dir, 'notes.pdf');
  await fs.writeFile(pdfPath, await doc.save());
});
afterAll(async () => fs.rm(dir, { recursive: true, force: true }));

describe('detectFileType', () => {
  it('detects a PDF by signature', async () => {
    const head = await fs.readFile(pdfPath);
    const t = await detectFileType(head, 'P6 Science.pdf');
    expect(t.kind).toBe('pdf');
    expect(t.mime).toBe('application/pdf');
  });

  it('rejects a PDF renamed to .docx', async () => {
    const head = await fs.readFile(pdfPath);
    await expect(detectFileType(head, 'fake.docx')).rejects.toBeInstanceOf(UnsupportedFileError);
  });

  it('rejects executables disguised as PDF', async () => {
    const elf = Buffer.concat([Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]), Buffer.alloc(200)]);
    await expect(detectFileType(elf, 'exam.pdf')).rejects.toBeInstanceOf(UnsupportedFileError);
  });

  it('rejects unknown binary content with txt extension', async () => {
    await expect(detectFileType(Buffer.from([0, 1, 2, 3, 0, 0]), 'x.txt')).rejects.toBeInstanceOf(UnsupportedFileError);
  });

  it('accepts utf-8 text files', async () => {
    const t = await detectFileType(Buffer.from('Hello teachers'), 'readme.txt');
    expect(t.kind).toBe('txt');
  });
});

describe('extractDocument', () => {
  it('extracts PDF text, page count and title', async () => {
    const r = await extractDocument(pdfPath, 'pdf');
    expect(r.pageCount).toBe(2);
    expect(r.metadata.title).toBe('P6 Science Notes');
    expect(r.text).toContain('Photosynthesis in green plants');
  });

  it('extracts PPTX slide text', async () => {
    const zip = new JSZip();
    zip.file('ppt/slides/slide1.xml', '<p:sld><a:t>Acids &amp; Bases</a:t></p:sld>');
    zip.file('ppt/slides/slide2.xml', '<p:sld><a:t>Indicators</a:t></p:sld>');
    const p = path.join(dir, 'x.pptx');
    await fs.writeFile(p, await zip.generateAsync({ type: 'nodebuffer' }));
    const r = await extractDocument(p, 'pptx');
    expect(r.pageCount).toBe(2);
    expect(r.text).toContain('Acids & Bases');
  });
});

describe('thumbnails', () => {
  it('renders a PDF first page and creates responsive variants', async () => {
    const src = await renderSourceImage(pdfPath, 'pdf', { title: 'x' });
    const variants = await createThumbnailVariants(src);
    expect(variants.map((v) => `${v.width}.${v.format}`)).toEqual(['320.webp', '640.webp', '640.avif', '1200.webp']);
    const meta = await sharp(variants[0]!.buffer).metadata();
    expect(meta.width).toBe(320);
    expect(meta.height).toBe(416);
  });

  it('renders a branded cover for other documents', async () => {
    const png = await renderCover({ title: 'P7 Mathematics Scheme of Work Term 1', subtitle: 'P7 • Mathematics', badge: 'Scheme of Work', fileLabel: 'Word' }, 'docx', 640);
    const meta = await sharp(png).metadata();
    expect(meta.format).toBe('png');
    expect(meta.width).toBe(640);
  });
});
