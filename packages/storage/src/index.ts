import { LocalFilesystemStorageProvider } from './local';
import { S3StorageProvider } from './s3';
import type { StorageProvider } from './types';

export * from './types';
export * from './keys';
export { LocalFilesystemStorageProvider } from './local';
export { S3StorageProvider } from './s3';

let instance: StorageProvider | undefined;

/** Returns the configured storage provider (singleton). */
export function getStorage(): StorageProvider {
  if (!instance) {
    const driver = process.env.STORAGE_DRIVER ?? 'local';
    if (driver === 's3') {
      const bucket = process.env.S3_BUCKET;
      if (!bucket) throw new Error('STORAGE_DRIVER=s3 requires S3_BUCKET');
      instance = new S3StorageProvider({
        bucket,
        region: process.env.S3_REGION,
        endpoint: process.env.S3_ENDPOINT || undefined,
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
        prefix: process.env.S3_PREFIX,
      });
      return instance;
    }
    if (driver !== 'local') throw new Error(`Unsupported STORAGE_DRIVER: ${driver}`);
    const accel = process.env.STORAGE_ACCEL_REDIRECT === 'true' ? '/_protected' : null;
    instance = new LocalFilesystemStorageProvider({
      root: process.env.STORAGE_ROOT ?? './storage',
      accelPrefix: accel,
    });
  }
  return instance;
}

export function setStorage(provider: StorageProvider): void {
  instance = provider;
}

/**
 * Runs `fn` with a path to a local copy of an object. Filesystem providers pass the real
 * path; remote providers (S3/MinIO) download to a temporary file that is removed afterwards.
 */
export async function withLocalCopy<T>(storage: StorageProvider, key: string, fn: (path: string) => Promise<T>): Promise<T> {
  if (storage.localPath) return fn(storage.localPath(key));
  const { createWriteStream } = await import('node:fs');
  const { rm } = await import('node:fs/promises');
  const { pipeline } = await import('node:stream/promises');
  const { tmpdir } = await import('node:os');
  const { join, extname } = await import('node:path');
  const { randomUUID } = await import('node:crypto');
  const tmp = join(tmpdir(), `edushare-${randomUUID()}${extname(key)}`);
  try {
    await pipeline(await storage.stream(key), createWriteStream(tmp));
    return await fn(tmp);
  } finally {
    await rm(tmp, { force: true });
  }
}

/** Reads the first bytes of an object (used for file signature detection). */
export async function readObjectHead(storage: StorageProvider, key: string, bytes = 64 * 1024): Promise<Buffer> {
  const meta = await storage.getMetadata(key);
  if (!meta || meta.size === 0) return Buffer.alloc(0);
  const stream = await storage.stream(key, { start: 0, end: Math.min(bytes, meta.size) - 1 });
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c as Buffer));
  return Buffer.concat(chunks);
}
