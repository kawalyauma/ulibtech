import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { Transform, type Readable } from 'node:stream';
import yauzl, { type Entry, type ZipFile } from 'yauzl';
import type { Redis } from '@edushare/cache';
import { eq } from '@edushare/database';
import { resourceFiles } from '@edushare/database/schema';
import { ALLOWED_FILE_TYPES, titleFromFileName } from '@edushare/shared';
import { buildKey, withLocalCopy } from '@edushare/storage';
import { createResourceFromUpload } from './admin-resources';
import { suggestClassification } from './classify';
import type { Actor, ServiceContext } from './context';

/**
 * Bulk import from a single zip: every supported document becomes a draft resource marked
 * with `suggestions.import`, then the normal pipeline (scan → extract/OCR → classify →
 * thumbnail → AI → autopilot) takes over. Folder names act as classification hints, so
 * "P6/Science/Past Papers/term 2.pdf" is pre-classified before the AI even runs.
 */

export interface ZipImportItem {
  path: string;
  status: 'created' | 'skipped' | 'failed';
  resourceId?: string;
  reason?: string;
}

export interface ZipImportBatch {
  id: string;
  fileName: string;
  status: 'queued' | 'extracting' | 'done' | 'failed';
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  total: number;
  created: number;
  skipped: number;
  failed: number;
  error?: string;
  items: ZipImportItem[];
}

const KEY = (id: string) => `es:zip-import:${id}`;
const LIST_KEY = 'es:zip-imports';
const TTL_SECONDS = 30 * 24 * 3600;
const MAX_ENTRIES = 3000;
const MAX_ITEMS_KEPT = 3000;

const EXTENSIONS = new Set<string>(
  Object.values(ALLOWED_FILE_TYPES).flatMap((t) => [...t.extensions]),
);

export async function saveZipBatch(redis: Redis, batch: ZipImportBatch): Promise<void> {
  batch.updatedAt = new Date().toISOString();
  batch.items = batch.items.slice(-MAX_ITEMS_KEPT);
  await redis.set(KEY(batch.id), JSON.stringify(batch), 'EX', TTL_SECONDS);
}

export async function getZipBatch(redis: Redis, id: string): Promise<ZipImportBatch | null> {
  const raw = await redis.get(KEY(id));
  return raw ? (JSON.parse(raw) as ZipImportBatch) : null;
}

export async function listZipBatches(redis: Redis, limit = 20): Promise<ZipImportBatch[]> {
  const ids = await redis.lrange(LIST_KEY, 0, limit - 1);
  const batches = await Promise.all(ids.map((id) => getZipBatch(redis, id)));
  return batches.filter((b): b is ZipImportBatch => Boolean(b));
}

export async function createZipBatch(
  redis: Redis,
  fileName: string,
  actor: Pick<Actor, 'name'>,
): Promise<ZipImportBatch> {
  const now = new Date().toISOString();
  const batch: ZipImportBatch = {
    id: randomUUID(),
    fileName,
    status: 'queued',
    createdAt: now,
    updatedAt: now,
    createdBy: actor.name,
    total: 0,
    created: 0,
    skipped: 0,
    failed: 0,
    items: [],
  };
  await saveZipBatch(redis, batch);
  await redis.lpush(LIST_KEY, batch.id);
  await redis.ltrim(LIST_KEY, 0, 49);
  return batch;
}

/** Why an archive entry is not imported, or null when it should be. Exported for tests. */
export function skipReason(entryPath: string, sizeBytes: number, maxBytes: number): string | null {
  const name = path.posix.basename(entryPath);
  if (entryPath.endsWith('/')) return 'folder';
  if (entryPath.startsWith('__MACOSX/') || name.startsWith('.') || name.startsWith('~$'))
    return 'system file';
  if (/^(thumbs\.db|desktop\.ini)$/i.test(name)) return 'system file';
  const ext = path.posix.extname(name).slice(1).toLowerCase();
  if (ext === 'zip') return 'nested zip files are not unpacked; upload them separately';
  if (!EXTENSIONS.has(ext)) return `unsupported file type (.${ext || 'none'})`;
  if (sizeBytes === 0) return 'empty file';
  if (sizeBytes > maxBytes) return `larger than ${Math.round(maxBytes / 1024 / 1024)} MB`;
  return null;
}

/** Folder names, as a phrase for rule-based classification ("P6 Science Past Papers"). */
export function folderHint(entryPath: string): string {
  const dir = path.posix.dirname(entryPath);
  return dir === '.' ? '' : dir.split('/').filter(Boolean).join(' ').replace(/[_-]+/g, ' ');
}

const openZip = (file: string) =>
  new Promise<ZipFile>((resolve, reject) =>
    yauzl.open(
      file,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: false },
      (err, zip) => (err || !zip ? reject(err ?? new Error('Could not open zip')) : resolve(zip)),
    ),
  );

const openEntry = (zip: ZipFile, entry: Entry) =>
  new Promise<Readable>((resolve, reject) =>
    zip.openReadStream(entry, (err, stream) =>
      err || !stream ? reject(err ?? new Error('Could not read entry')) : resolve(stream),
    ),
  );

async function* entries(zip: ZipFile): AsyncGenerator<Entry> {
  while (true) {
    const next = await new Promise<Entry | null>((resolve, reject) => {
      const onEntry = (e: Entry) => cleanup(() => resolve(e));
      const onEnd = () => cleanup(() => resolve(null));
      const onError = (err: Error) => cleanup(() => reject(err));
      const cleanup = (fn: () => void) => {
        zip.off('entry', onEntry);
        zip.off('end', onEnd);
        zip.off('error', onError);
        fn();
      };
      zip.on('entry', onEntry);
      zip.on('end', onEnd);
      zip.on('error', onError);
      zip.readEntry();
    });
    if (!next) return;
    yield next;
  }
}

export async function runZipImport(
  ctx: ServiceContext,
  redis: Redis,
  job: { batchId: string; tempKey: string; actor: Actor; maxFileBytes: number },
): Promise<ZipImportBatch> {
  const batch = (await getZipBatch(redis, job.batchId)) ?? {
    ...(await createZipBatch(redis, 'upload.zip', job.actor)),
    id: job.batchId,
  };
  batch.status = 'extracting';
  await saveZipBatch(redis, batch);
  try {
    await withLocalCopy(ctx.storage, job.tempKey, async (zipPath) => {
      const zip = await openZip(zipPath);
      try {
        let seen = 0;
        for await (const entry of entries(zip)) {
          const entryPath = entry.fileName.replace(/\\/g, '/');
          const reason = skipReason(entryPath, entry.uncompressedSize, job.maxFileBytes);
          if (reason === 'folder') continue;
          if (++seen > MAX_ENTRIES) {
            batch.items.push({
              path: entryPath,
              status: 'skipped',
              reason: `only the first ${MAX_ENTRIES} files are imported`,
            });
            batch.skipped++;
            break;
          }
          batch.total++;
          if (reason) {
            batch.items.push({ path: entryPath, status: 'skipped', reason });
            batch.skipped++;
            continue;
          }
          const result = await importEntry(ctx, zip, entry, entryPath, job, batch.id);
          batch.items.push(result);
          if (result.status === 'created') batch.created++;
          else if (result.status === 'skipped') batch.skipped++;
          else batch.failed++;
          await saveZipBatch(redis, batch);
        }
      } finally {
        zip.close();
      }
    });
    batch.status = 'done';
  } catch (err) {
    batch.status = 'failed';
    batch.error = (err as Error).message.slice(0, 500);
  } finally {
    await ctx.storage.delete(job.tempKey).catch(() => undefined);
  }
  await saveZipBatch(redis, batch);
  return batch;
}

async function importEntry(
  ctx: ServiceContext,
  zip: ZipFile,
  entry: Entry,
  entryPath: string,
  job: { actor: Actor; maxFileBytes: number },
  batchId: string,
): Promise<ZipImportItem> {
  const name = path.posix.basename(entryPath).slice(0, 255);
  const tempKey = buildKey('temporary', 'upload');
  try {
    const hash = createHash('sha256');
    let size = 0;
    const meter = new Transform({
      transform(chunk: Buffer, _enc, cb) {
        size += chunk.length;
        hash.update(chunk);
        cb(null, chunk);
      },
    });
    const stream = await openEntry(zip, entry);
    await ctx.storage.upload(tempKey, stream.pipe(meter));
    const sha256 = hash.digest('hex');

    const existing = await ctx.db.query.resourceFiles.findFirst({
      where: eq(resourceFiles.sha256, sha256),
      columns: { id: true, resourceId: true },
    });
    if (existing?.resourceId) {
      await ctx.storage.delete(tempKey);
      return { path: entryPath, status: 'skipped', reason: 'already on the site (same file)' };
    }

    const hint = folderHint(entryPath);
    const guess = hint
      ? await suggestClassification(ctx, { title: hint, fileName: name })
      : { sources: {}, labels: {} };
    const { sources: _s, labels: _l, ...ids } = guess;
    const { resource } = await createResourceFromUpload(
      ctx,
      job.actor,
      { tempKey, originalName: name, sizeBytes: size, sha256 },
      {
        title: titleFromFileName(name).slice(0, 200) || 'Untitled resource',
        status: 'draft',
        ...ids,
      },
      { suggestions: { import: { batchId, path: entryPath } } },
    );
    return { path: entryPath, status: 'created', resourceId: resource.id };
  } catch (err) {
    await ctx.storage.delete(tempKey).catch(() => undefined);
    return { path: entryPath, status: 'failed', reason: (err as Error).message.slice(0, 300) };
  }
}
