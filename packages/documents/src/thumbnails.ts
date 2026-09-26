import sharp from 'sharp';
import { THUMBNAIL_WIDTHS, type AllowedFileKind } from '@edushare/shared';
import { loadPdfJs, standardFontDataUrl } from './pdfjs';
import fs from 'node:fs/promises';

export interface CoverInfo {
  title: string;
  /** e.g. "P6 • Science" */
  subtitle?: string | null;
  /** e.g. "Past Paper" */
  badge?: string | null;
  fileLabel?: string | null;
}

export interface ThumbnailVariantBuffer {
  width: number;
  height: number;
  format: 'webp' | 'avif';
  buffer: Buffer;
}

/** Aspect ratio of generated thumbnails (A4 portrait-ish). */
export const THUMB_RATIO = 1.3;

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] ?? c);
}

function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > maxChars) {
      if (line) lines.push(line);
      line = w;
      if (lines.length === maxLines) break;
    } else {
      line = (line + ' ' + w).trim();
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    lines[maxLines - 1] = `${lines[maxLines - 1]!.replace(/[\s,.;:]+$/, '')}…`;
  }
  return lines;
}

const PALETTE: Record<string, [string, string]> = {
  pdf: ['#0f766e', '#115e59'],
  docx: ['#1d4ed8', '#1e3a8a'],
  doc: ['#1d4ed8', '#1e3a8a'],
  pptx: ['#c2410c', '#9a3412'],
  ppt: ['#c2410c', '#9a3412'],
  xlsx: ['#15803d', '#14532d'],
  xls: ['#15803d', '#14532d'],
  default: ['#334155', '#1e293b'],
};

/** Generates a branded cover image (PNG) for documents that cannot be rendered. */
export async function renderCover(info: CoverInfo, kind: string, width = 1200): Promise<Buffer> {
  const height = Math.round(width * THUMB_RATIO);
  const [c1, c2] = PALETTE[kind] ?? PALETTE.default!;
  const titleLines = wrap(info.title, 18, 5);
  const titleSvg = titleLines
    .map((l, i) => `<text x="90" y="${520 + i * 104}" font-size="84" font-weight="700" fill="#ffffff">${escapeXml(l)}</text>`)
    .join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="${Math.round(1200 * THUMB_RATIO)}" viewBox="0 0 1200 ${Math.round(1200 * THUMB_RATIO)}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect x="60" y="60" width="1080" height="${Math.round(1200 * THUMB_RATIO) - 120}" rx="36" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="4"/>
  <g font-family="DejaVu Sans, Arial, Helvetica, sans-serif">
    ${info.subtitle ? `<text x="90" y="260" font-size="56" font-weight="600" fill="rgba(255,255,255,0.9)">${escapeXml(info.subtitle)}</text>` : ''}
    ${info.badge ? `<rect x="90" y="310" rx="30" width="${Math.min(1020, 40 + info.badge.length * 30)}" height="76" fill="rgba(255,255,255,0.18)"/><text x="115" y="364" font-size="44" fill="#ffffff">${escapeXml(info.badge)}</text>` : ''}
    ${titleSvg}
    <text x="90" y="${Math.round(1200 * THUMB_RATIO) - 130}" font-size="52" font-weight="700" fill="#ffffff">${escapeXml((info.fileLabel ?? kind).toUpperCase())}</text>
  </g>
</svg>`;
  return sharp(Buffer.from(svg)).resize(width, height).png().toBuffer();
}

async function renderPdfFirstPage(file: string, width = 1200): Promise<Buffer | null> {
  try {
    const { createCanvas } = await import('@napi-rs/canvas');
    const pdfjs = await loadPdfJs();
    const doc = await pdfjs.getDocument({
      data: new Uint8Array(await fs.readFile(file)),
      standardFontDataUrl: standardFontDataUrl(),
      verbosity: 0,
    }).promise;
    try {
      const page = await doc.getPage(1);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      const canvas = createCanvas(Math.round(viewport.width), Math.round(viewport.height));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({
        canvas: canvas as never,
        canvasContext: ctx as never,
        viewport,
      }).promise;
      return canvas.toBuffer('image/png');
    } finally {
      await doc.destroy();
    }
  } catch (err) {
    console.warn('[documents] PDF render failed, falling back to cover:', (err as Error).message);
    return null;
  }
}

/** Produces a high-resolution source image for thumbnails. */
export async function renderSourceImage(file: string, kind: AllowedFileKind, cover: CoverInfo): Promise<Buffer> {
  if (kind === 'pdf') {
    const rendered = await renderPdfFirstPage(file);
    if (rendered) return rendered;
  }
  if (kind === 'jpg' || kind === 'png' || kind === 'webp') {
    return sharp(file, { limitInputPixels: 80_000_000 }).rotate().png().toBuffer();
  }
  return renderCover(cover, kind);
}

/**
 * Creates responsive WebP variants (320/640/1200) plus an AVIF at 640px. Images are cropped
 * from the top to a consistent portrait ratio so cards never shift layout.
 */
export async function createThumbnailVariants(source: Buffer): Promise<ThumbnailVariantBuffer[]> {
  const out: ThumbnailVariantBuffer[] = [];
  for (const width of THUMBNAIL_WIDTHS) {
    const height = Math.round(width * THUMB_RATIO);
    const pipeline = sharp(source).resize(width, height, { fit: 'cover', position: 'top' });
    out.push({ width, height, format: 'webp', buffer: await pipeline.clone().webp({ quality: 78, effort: 4 }).toBuffer() });
    if (width === 640) {
      out.push({ width, height, format: 'avif', buffer: await pipeline.clone().avif({ quality: 55, effort: 3 }).toBuffer() });
    }
  }
  return out;
}
