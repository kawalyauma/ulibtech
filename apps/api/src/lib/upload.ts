import { createHash } from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import Busboy from 'busboy';
import { AppError } from '@edushare/shared';
import { buildKey, type StorageProvider } from '@edushare/storage';
import type { TemporaryUpload } from '@edushare/resources';
import type { AppContext } from './http';

export interface ParsedMultipart {
  fields: Record<string, string | string[]>;
  files: (TemporaryUpload & { field: string })[];
}

/**
 * Streams multipart uploads straight to temporary storage (never buffering whole files in
 * memory), computing SHA-256 and enforcing size limits as bytes arrive.
 */
export async function parseMultipart(
  c: AppContext,
  storage: StorageProvider,
  opts: { maxFileBytes: number; maxFiles: number; allowedFields?: string[] },
): Promise<ParsedMultipart> {
  const type = c.req.header('content-type') ?? '';
  if (!type.startsWith('multipart/form-data'))
    throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Expected multipart/form-data');
  const body = c.req.raw.body;
  if (!body) throw new AppError('BAD_REQUEST', 'Empty request body');

  const fields: Record<string, string | string[]> = {};
  const files: ParsedMultipart['files'] = [];
  const pending: Promise<void>[] = [];
  const tempKeys: string[] = [];

  const bb = Busboy({
    headers: { 'content-type': type },
    limits: {
      fileSize: opts.maxFileBytes,
      files: opts.maxFiles,
      fields: 60,
      fieldSize: 64 * 1024,
      parts: opts.maxFiles + 60,
    },
    defParamCharset: 'utf8',
  });

  const done = new Promise<void>((resolve, reject) => {
    let failed = false;
    const fail = (err: unknown) => {
      if (failed) return;
      failed = true;
      reject(err);
    };
    bb.on('field', (name, value) => {
      if (opts.allowedFields && !opts.allowedFields.includes(name.replace(/\[\]$/, ''))) return;
      const key = name.replace(/\[\]$/, '');
      const prev = fields[key];
      if (prev === undefined) fields[key] = name.endsWith('[]') ? [value] : value;
      else fields[key] = Array.isArray(prev) ? [...prev, value] : [prev, value];
    });
    bb.on('file', (field, stream, info) => {
      const originalName = (info.filename || 'upload').replace(/[/\\]/g, '_').slice(0, 255);
      const tempKey = buildKey('temporary', 'upload');
      tempKeys.push(tempKey);
      const hash = createHash('sha256');
      let size = 0;
      let truncated = false;
      stream.on('limit', () => {
        truncated = true;
      });
      const meter = new Transform({
        transform(chunk: Buffer, _enc, cb) {
          size += chunk.length;
          hash.update(chunk);
          cb(null, chunk);
        },
      });
      pending.push(
        storage
          .upload(tempKey, stream.pipe(meter))
          .then(() => {
            if (truncated) {
              throw new AppError(
                'PAYLOAD_TOO_LARGE',
                `"${originalName}" is larger than the ${Math.round(opts.maxFileBytes / 1024 / 1024)} MB limit.`,
              );
            }
            files.push({
              field,
              tempKey,
              originalName,
              sizeBytes: size,
              sha256: hash.digest('hex'),
            });
          })
          .catch(fail),
      );
    });
    bb.on('filesLimit', () =>
      fail(new AppError('BAD_REQUEST', `You can upload at most ${opts.maxFiles} files at once.`)),
    );
    bb.on('error', fail);
    bb.on('close', () => {
      Promise.all(pending).then(() => {
        if (!failed) resolve();
      }, fail);
    });
  });

  Readable.fromWeb(body as import('node:stream/web').ReadableStream)
    .on('error', (err) => bb.destroy(err))
    .pipe(bb);
  try {
    await done;
  } catch (err) {
    await Promise.all(tempKeys.map((k) => storage.delete(k).catch(() => undefined)));
    throw err;
  }
  return { fields, files };
}

/** Converts multipart fields into a plain object (arrays preserved, JSON fields decoded). */
export function fieldsToObject(fields: Record<string, string | string[]>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k === 'metadata' && typeof v === 'string') {
      try {
        Object.assign(out, JSON.parse(v));
      } catch {
        throw new AppError('BAD_REQUEST', 'metadata must be valid JSON');
      }
      continue;
    }
    out[k] = v;
  }
  return out;
}
