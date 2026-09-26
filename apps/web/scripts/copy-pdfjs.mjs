// Copies the PDF.js worker into /public so it is served as a static, long-cached asset.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkgDir = path.dirname(require.resolve('pdfjs-dist/package.json'));
const outDir = path.resolve('public/pdfjs');
fs.mkdirSync(outDir, { recursive: true });
fs.copyFileSync(path.join(pkgDir, 'legacy/build/pdf.worker.min.mjs'), path.join(outDir, 'pdf.worker.min.mjs'));
console.log('Copied pdf.worker.min.mjs');
