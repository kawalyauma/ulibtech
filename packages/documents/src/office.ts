import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** Office formats LibreOffice can turn into a PDF preview. */
export const CONVERTIBLE_TO_PDF = new Set(['doc', 'docx', 'ppt', 'pptx', 'odt', 'xls', 'xlsx']);

let available: Promise<string | null> | undefined;

/** Resolves the LibreOffice binary (SOFFICE_PATH or `soffice` on PATH), or null if missing. */
export function findLibreOffice(): Promise<string | null> {
  if (process.env.LIBREOFFICE_DISABLED === 'true') return Promise.resolve(null);
  available ??= new Promise((resolve) => {
    const bin = process.env.SOFFICE_PATH || 'soffice';
    execFile(bin, ['--version'], { timeout: 20_000 }, (err) => resolve(err ? null : bin));
  });
  return available;
}

/**
 * Converts a document with LibreOffice in headless mode. Each run uses its own profile
 * directory so conversions can run concurrently. Returns the output path (caller deletes).
 */
export async function convertWithLibreOffice(
  file: string,
  target: 'pdf' | 'xlsx',
  timeoutMs = 120_000,
): Promise<string | null> {
  const bin = await findLibreOffice();
  if (!bin) return null;
  const work = await fs.mkdtemp(path.join(os.tmpdir(), 'edushare-lo-'));
  const profile = path.join(work, 'profile');
  // Copy to a neutral name so odd characters in uploads never reach the command line.
  const input = path.join(work, `input${path.extname(file) || ''}`);
  await fs.copyFile(file, input);
  try {
    await new Promise<void>((resolve, reject) => {
      execFile(
        bin,
        [
          `-env:UserInstallation=file://${profile}`,
          '--headless',
          '--norestore',
          '--nologo',
          '--convert-to',
          target,
          '--outdir',
          work,
          input,
        ],
        { timeout: timeoutMs, maxBuffer: 1024 * 1024 },
        (err) => (err ? reject(err) : resolve()),
      );
    });
    const out = path.join(work, `input.${target}`);
    await fs.access(out);
    const final = path.join(os.tmpdir(), `edushare-${randomUUID()}.${target}`);
    await fs.rename(out, final);
    return final;
  } catch (err) {
    console.warn('[documents] LibreOffice conversion failed:', (err as Error).message);
    return null;
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}
