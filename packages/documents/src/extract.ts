import fs from 'node:fs/promises';
import JSZip from 'jszip';
import mammoth from 'mammoth';
import ExcelJS from 'exceljs';
import { convertWithLibreOffice } from './office';
import type { AllowedFileKind } from '@edushare/shared';
import { loadPdfJs, standardFontDataUrl } from './pdfjs';

export interface ExtractionResult {
  text: string;
  pageCount: number | null;
  metadata: {
    title?: string;
    author?: string;
    subject?: string;
    keywords?: string;
    creator?: string;
    producer?: string;
    createdAt?: string;
    width?: number;
    height?: number;
    [key: string]: unknown;
  };
}

/** Maximum characters of extracted text kept for search (tsvector limit is ~1MB). */
export const MAX_EXTRACTED_CHARS = 250_000;
/** PDFs are only text-extracted up to this many pages to bound worker time. */
const MAX_PDF_PAGES_FOR_TEXT = 300;

function normaliseText(text: string): string {
  return text
    .replaceAll('\u0000', '')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_EXTRACTED_CHARS);
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');
}

async function officeCoreProps(zip: JSZip): Promise<ExtractionResult['metadata']> {
  const core = await zip.file('docProps/core.xml')?.async('string');
  if (!core) return {};
  const pick = (tag: string) => {
    const m = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(core);
    return m?.[1] ? decodeXmlEntities(m[1]).trim() || undefined : undefined;
  };
  return {
    title: pick('dc:title'),
    author: pick('dc:creator'),
    subject: pick('dc:subject'),
    keywords: pick('cp:keywords'),
    createdAt: pick('dcterms:created'),
  };
}

export async function extractPdf(file: string): Promise<ExtractionResult> {
  const pdfjs = await loadPdfJs();
  const data = new Uint8Array(await fs.readFile(file));
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: false,
    standardFontDataUrl: standardFontDataUrl(),
    verbosity: 0,
  }).promise;
  try {
    const info = ((await doc.getMetadata().catch(() => null))?.info ?? {}) as Record<
      string,
      unknown
    >;
    const parts: string[] = [];
    let chars = 0;
    const pages = Math.min(doc.numPages, MAX_PDF_PAGES_FOR_TEXT);
    for (let i = 1; i <= pages && chars < MAX_EXTRACTED_CHARS; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let pageText = '';
      for (const item of content.items) {
        if ('str' in item) pageText += item.str + (item.hasEOL ? '\n' : ' ');
      }
      parts.push(pageText);
      chars += pageText.length;
      page.cleanup();
    }
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    return {
      text: normaliseText(parts.join('\n')),
      pageCount: doc.numPages,
      metadata: {
        title: str(info.Title),
        author: str(info.Author),
        subject: str(info.Subject),
        keywords: str(info.Keywords),
        creator: str(info.Creator),
        producer: str(info.Producer),
      },
    };
  } finally {
    await doc.destroy();
  }
}

async function extractDocx(file: string): Promise<ExtractionResult> {
  const buffer = await fs.readFile(file);
  const [{ value }, zip] = await Promise.all([
    mammoth.extractRawText({ buffer }),
    JSZip.loadAsync(buffer),
  ]);
  const app = await zip.file('docProps/app.xml')?.async('string');
  const pages = app ? Number(/<Pages>(\d+)<\/Pages>/.exec(app)?.[1]) : NaN;
  return {
    text: normaliseText(value),
    pageCount: Number.isFinite(pages) && pages > 0 ? pages : null,
    metadata: await officeCoreProps(zip),
  };
}

async function extractPptx(file: string): Promise<ExtractionResult> {
  const zip = await JSZip.loadAsync(await fs.readFile(file));
  const slides = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)?.[1]) - Number(/(\d+)\.xml$/.exec(b)?.[1]));
  const texts: string[] = [];
  for (const name of slides) {
    const xml = (await zip.file(name)?.async('string')) ?? '';
    const runs = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) =>
      decodeXmlEntities(m[1] ?? ''),
    );
    texts.push(runs.join(' '));
  }
  return {
    text: normaliseText(texts.join('\n')),
    pageCount: slides.length || null,
    metadata: await officeCoreProps(zip),
  };
}

async function extractOdt(file: string): Promise<ExtractionResult> {
  const zip = await JSZip.loadAsync(await fs.readFile(file));
  const xml = (await zip.file('content.xml')?.async('string')) ?? '';
  const text = decodeXmlEntities(xml.replace(/<text:(p|h)[^>]*>/g, '\n').replace(/<[^>]+>/g, ' '));
  return { text: normaliseText(text), pageCount: null, metadata: {} };
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((r) => r.text).join('');
    if ('text' in value && typeof value.text === 'string') return value.text;
    if ('result' in value) return cellText(value.result as ExcelJS.CellValue);
    return '';
  }
  return String(value);
}

async function extractXlsx(file: string): Promise<ExtractionResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const parts: string[] = [];
  let chars = 0;
  wb.eachSheet((sheet) => {
    if (chars > MAX_EXTRACTED_CHARS) return;
    const rows: string[] = [sheet.name];
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const values = (row.values as ExcelJS.CellValue[]).slice(1).map(cellText).filter(Boolean);
      if (values.length) rows.push(values.join(' | '));
    });
    const text = rows.join('\n');
    chars += text.length;
    parts.push(text);
  });
  return {
    text: normaliseText(parts.join('\n')),
    pageCount: wb.worksheets.length || null,
    metadata: {
      title: wb.title || undefined,
      author: wb.creator || undefined,
      subject: wb.subject || undefined,
    },
  };
}

/** Legacy binary formats (.doc/.ppt/.xls) are converted with LibreOffice when installed. */
async function extractViaLibreOffice(
  file: string,
  target: 'pdf' | 'xlsx',
): Promise<ExtractionResult> {
  const converted = await convertWithLibreOffice(file, target);
  if (!converted) return { text: '', pageCount: null, metadata: { conversion: 'unavailable' } };
  try {
    return target === 'pdf' ? await extractPdf(converted) : await extractXlsx(converted);
  } finally {
    await fs.rm(converted, { force: true });
  }
}

async function extractImage(file: string): Promise<ExtractionResult> {
  const sharp = (await import('sharp')).default;
  const meta = await sharp(file).metadata();
  return { text: '', pageCount: 1, metadata: { width: meta.width, height: meta.height } };
}

/** Extracts searchable text and metadata. Never performs OCR. */
export async function extractDocument(
  file: string,
  kind: AllowedFileKind,
): Promise<ExtractionResult> {
  switch (kind) {
    case 'pdf':
      return extractPdf(file);
    case 'docx':
      return extractDocx(file);
    case 'pptx':
      return extractPptx(file);
    case 'xlsx':
      return extractXlsx(file);
    case 'xls':
      return extractViaLibreOffice(file, 'xlsx');
    case 'odt':
      return extractOdt(file);
    case 'jpg':
    case 'png':
    case 'webp':
      return extractImage(file);
    case 'txt':
      return {
        text: normaliseText(await fs.readFile(file, 'utf8')),
        pageCount: null,
        metadata: {},
      };
    case 'doc':
    case 'ppt':
      return extractViaLibreOffice(file, 'pdf');
  }
}
