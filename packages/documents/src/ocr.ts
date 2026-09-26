import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { loadPdfJs, standardFontDataUrl } from './pdfjs';

export interface OcrResult {
  text: string;
  pages: number;
}

/** True when a document has (almost) no text layer, i.e. it is probably a scan. */
export function looksScanned(text: string, pageCount: number | null): boolean {
  const chars = text.replace(/\s+/g, '').length;
  return chars < Math.max(40, 25 * (pageCount ?? 1));
}

let tesseract: Promise<string | null> | undefined;
export function findTesseract(): Promise<string | null> {
  tesseract ??= new Promise((resolve) => {
    const bin = process.env.TESSERACT_PATH || 'tesseract';
    execFile(bin, ['--version'], { timeout: 10_000 }, (err) => resolve(err ? null : bin));
  });
  return tesseract;
}

function runTesseract(bin: string, image: string, lang: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      bin,
      [image, 'stdout', '-l', lang, '--psm', '3'],
      { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(stdout)),
    );
  });
}

/** Renders PDF pages to PNG files (2× scale for legible OCR). */
export async function renderPdfPagesToPng(
  file: string,
  maxPages: number,
  outDir: string,
): Promise<string[]> {
  const { createCanvas } = await import('@napi-rs/canvas');
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(await fs.readFile(file)),
    standardFontDataUrl: standardFontDataUrl(),
    verbosity: 0,
  }).promise;
  const out: string[] = [];
  try {
    for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas: canvas as never, canvasContext: ctx as never, viewport }).promise;
      const png = path.join(outDir, `page-${i}.png`);
      await fs.writeFile(png, canvas.toBuffer('image/png'));
      out.push(png);
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return out;
}

/**
 * Optional OCR with the Tesseract CLI. Disabled unless OCR_ENABLED=true (it is CPU heavy);
 * returns null when disabled or Tesseract is not installed.
 */
export async function defaultOcr(file: string, kind: 'pdf' | 'image'): Promise<OcrResult | null> {
  if (process.env.OCR_ENABLED !== 'true') return null;
  const bin = await findTesseract();
  if (!bin) return null;
  const lang = process.env.OCR_LANGUAGES || 'eng';
  if (kind === 'image') return { text: (await runTesseract(bin, file, lang)).trim(), pages: 1 };
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'edushare-ocr-'));
  try {
    const pages = await renderPdfPagesToPng(file, Number(process.env.OCR_MAX_PAGES ?? 30), work);
    const texts: string[] = [];
    for (const img of pages) texts.push(await runTesseract(bin, img, lang));
    return { text: texts.join('\n').trim(), pages: pages.length };
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}
