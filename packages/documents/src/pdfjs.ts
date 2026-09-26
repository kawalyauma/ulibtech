import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
let loaded: Promise<PdfJs> | undefined;

export function loadPdfJs(): Promise<PdfJs> {
  loaded ??= import('pdfjs-dist/legacy/build/pdf.mjs');
  return loaded;
}

export function standardFontDataUrl(): string {
  const pkg = require.resolve('pdfjs-dist/package.json');
  return `${path.join(path.dirname(pkg), 'standard_fonts')}${path.sep}`;
}
