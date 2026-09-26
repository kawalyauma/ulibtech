import { eq } from '@edushare/database';
import { resourceFiles } from '@edushare/database/schema';
import { detectFileType, readHead, UnsupportedFileError } from '@edushare/documents';
import { AppError } from '@edushare/shared';
import { buildKey } from '@edushare/storage';
import type { Actor, ServiceContext } from './context';

export interface TemporaryUpload {
  /** Storage key inside the `temporary/` bucket. */
  tempKey: string;
  originalName: string;
  sizeBytes: number;
  sha256: string;
}

/**
 * Validates an uploaded temporary file by signature, moves it into permanent storage and
 * creates a `resource_files` row. The caller links it to a resource.
 */
export async function ingestUpload(ctx: ServiceContext, actor: Actor, upload: TemporaryUpload) {
  if (!ctx.storage.localPath) throw new Error('Storage provider must expose local paths for validation');
  if (upload.sizeBytes <= 0) {
    await ctx.storage.delete(upload.tempKey);
    throw new AppError('BAD_REQUEST', 'The uploaded file is empty.');
  }
  let detected;
  try {
    const head = await readHead(ctx.storage.localPath(upload.tempKey));
    detected = await detectFileType(head, upload.originalName);
  } catch (err) {
    await ctx.storage.delete(upload.tempKey);
    if (err instanceof UnsupportedFileError) throw new AppError('UNSUPPORTED_MEDIA_TYPE', err.message);
    throw err;
  }
  const key = buildKey('resources', detected.extension);
  await ctx.storage.move(upload.tempKey, key);
  const [file] = await ctx.db
    .insert(resourceFiles)
    .values({
      storageKey: key,
      originalName: upload.originalName.slice(0, 255),
      kind: detected.kind,
      mimeType: detected.mime,
      extension: detected.extension,
      sizeBytes: upload.sizeBytes,
      sha256: upload.sha256,
      uploadedById: actor.id,
    })
    .returning();
  if (!file) throw new Error('Failed to store file record');
  return file;
}

export async function attachFileToResource(ctx: ServiceContext, fileId: string, resourceId: string) {
  await ctx.db.update(resourceFiles).set({ resourceId }).where(eq(resourceFiles.id, fileId));
}
