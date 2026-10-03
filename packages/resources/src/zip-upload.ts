import { randomUUID } from 'node:crypto';
import { PassThrough, Transform, type Readable } from 'node:stream';
import type { Redis } from '@edushare/cache';
import { AppError } from '@edushare/shared';
import { buildKey } from '@edushare/storage';
import type { Actor, ServiceContext } from './context';

/**
 * Resumable, chunked zip uploads. One long request for a multi-GB zip dies on the first
 * network hiccup; instead the browser sends 16 MB chunks (retrying each one), and the
 * server stitches them back together before handing the zip to the normal import job.
 */

export const ZIP_CHUNK_BYTES = 16 * 1024 * 1024;
const TTL_SECONDS = 24 * 3600;
const KEY = (id: string) => `es:zip-upload:${id}`;
const CHUNKS = (id: string) => `es:zip-upload:${id}:chunks`;
const chunkKey = (id: string, index: number) => `temporary/zip-chunks/${id}/${index}`;

export interface ZipUpload {
  id: string;
  fileName: string;
  size: number;
  chunkSize: number;
  totalChunks: number;
  createdBy: string;
  createdAt: string;
}

export async function createZipUpload(
  redis: Redis,
  input: { fileName: string; size: number; maxBytes: number },
  actor: Pick<Actor, 'id'>,
): Promise<ZipUpload> {
  const fileName = input.fileName.replace(/[/\\]/g, '_').slice(0, 255);
  if (!/\.zip$/i.test(fileName))
    throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Only .zip files can be imported here.');
  if (!Number.isSafeInteger(input.size) || input.size <= 0)
    throw AppError.badRequest('The zip file is empty.');
  if (input.size > input.maxBytes)
    throw new AppError(
      'PAYLOAD_TOO_LARGE',
      `Zip files are limited to ${Math.round(input.maxBytes / 1024 / 1024)} MB.`,
    );
  const upload: ZipUpload = {
    id: randomUUID(),
    fileName,
    size: input.size,
    chunkSize: ZIP_CHUNK_BYTES,
    totalChunks: Math.ceil(input.size / ZIP_CHUNK_BYTES),
    createdBy: actor.id,
    createdAt: new Date().toISOString(),
  };
  await redis.set(KEY(upload.id), JSON.stringify(upload), 'EX', TTL_SECONDS);
  return upload;
}

async function loadUpload(redis: Redis, id: string, actor: Pick<Actor, 'id'>): Promise<ZipUpload> {
  const raw = await redis.get(KEY(id));
  const upload = raw ? (JSON.parse(raw) as ZipUpload) : null;
  // Another admin's upload is reported as missing rather than forbidden.
  if (!upload || upload.createdBy !== actor.id) throw AppError.notFound('Upload');
  return upload;
}

/** Byte length chunk `index` must have: full chunks, except a shorter last one. */
export function expectedChunkBytes(
  upload: Pick<ZipUpload, 'size' | 'chunkSize' | 'totalChunks'>,
  index: number,
): number {
  return index < upload.totalChunks - 1
    ? upload.chunkSize
    : upload.size - upload.chunkSize * (upload.totalChunks - 1);
}

/** Indices already stored, so an interrupted upload can resume. */
export async function zipUploadStatus(redis: Redis, id: string, actor: Pick<Actor, 'id'>) {
  const upload = await loadUpload(redis, id, actor);
  const received = (await redis.smembers(CHUNKS(id))).map(Number).sort((a, b) => a - b);
  return { upload, received };
}

/** Stores one chunk. Re-sending the same index (a retry) simply replaces it. */
export async function putZipChunk(
  ctx: Pick<ServiceContext, 'storage'>,
  redis: Redis,
  id: string,
  index: number,
  body: Readable,
  actor: Pick<Actor, 'id'>,
): Promise<{ received: number; totalChunks: number }> {
  const upload = await loadUpload(redis, id, actor);
  if (!Number.isInteger(index) || index < 0 || index >= upload.totalChunks)
    throw AppError.badRequest('Invalid chunk number.');
  const expected = expectedChunkBytes(upload, index);
  let bytes = 0;
  const meter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      bytes += chunk.length;
      if (bytes > expected) cb(new AppError('PAYLOAD_TOO_LARGE', 'Chunk is larger than expected.'));
      else cb(null, chunk);
    },
  });
  const key = chunkKey(id, index);
  try {
    await ctx.storage.upload(key, body.pipe(meter));
  } catch (err) {
    await ctx.storage.delete(key).catch(() => undefined);
    throw err;
  }
  if (bytes !== expected) {
    await ctx.storage.delete(key).catch(() => undefined);
    throw AppError.badRequest(
      `Chunk ${index} was incomplete (${bytes} of ${expected} bytes); retry it.`,
    );
  }
  await redis.sadd(CHUNKS(id), String(index));
  await redis.expire(CHUNKS(id), TTL_SECONDS);
  return { received: await redis.scard(CHUNKS(id)), totalChunks: upload.totalChunks };
}

/** Joins all chunks into one temporary zip and frees the chunks. */
export async function completeZipUpload(
  ctx: Pick<ServiceContext, 'storage'>,
  redis: Redis,
  id: string,
  actor: Pick<Actor, 'id'>,
): Promise<{ tempKey: string; fileName: string; size: number }> {
  const { upload, received } = await zipUploadStatus(redis, id, actor);
  if (received.length !== upload.totalChunks) {
    const missing = upload.totalChunks - received.length;
    throw AppError.conflict(`${missing} chunk(s) have not been uploaded yet.`);
  }
  const tempKey = buildKey('temporary', 'zip');
  const joined = new PassThrough();
  const writing = ctx.storage.upload(tempKey, joined);
  try {
    for (let i = 0; i < upload.totalChunks; i++) {
      const part = await ctx.storage.stream(chunkKey(id, i));
      await new Promise<void>((resolve, reject) => {
        part.on('error', reject);
        part.on('end', resolve);
        part.pipe(joined, { end: false });
      });
    }
    joined.end();
    const stored = await writing;
    if (stored.size !== upload.size)
      throw new Error(`Joined zip is ${stored.size} bytes, expected ${upload.size}.`);
  } catch (err) {
    joined.destroy();
    await writing.catch(() => undefined);
    await ctx.storage.delete(tempKey).catch(() => undefined);
    throw err;
  }
  for (let i = 0; i < upload.totalChunks; i++)
    await ctx.storage.delete(chunkKey(id, i)).catch(() => undefined);
  await redis.del(KEY(id), CHUNKS(id));
  return { tempKey, fileName: upload.fileName, size: upload.size };
}
