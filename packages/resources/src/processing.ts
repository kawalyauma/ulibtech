import { eq, sql } from '@edushare/database';
import { mediaAssets, resourceFiles, resources, type ThumbnailVariantRecord } from '@edushare/database/schema';
import { createThumbnailVariants, extractDocument, getScanner, renderSourceImage, type FileScanner } from '@edushare/documents';
import type { AllowedFileKind } from '@edushare/shared';
import { recordAudit } from './audit';
import type { ServiceContext } from './context';
import { afterContentChange, setResourceStatus } from './admin-resources';
import { fileLabel } from './mappers';

export interface ProcessResult {
  status: 'ready' | 'failed' | 'infected' | 'skipped';
  pageCount?: number | null;
  textLength?: number;
  thumbnail?: boolean;
  published?: boolean;
}

/**
 * Background processing for an uploaded file:
 * scan → extract text/metadata → thumbnail → search index → optional auto-publish.
 */
export async function processFile(
  ctx: ServiceContext,
  fileId: string,
  opts: { scanner?: FileScanner } = {},
): Promise<ProcessResult> {
  const file = await ctx.db.query.resourceFiles.findFirst({ where: eq(resourceFiles.id, fileId) });
  if (!file) return { status: 'skipped' };
  if (!ctx.storage.localPath) throw new Error('Processing requires a filesystem-backed storage provider');
  const path = ctx.storage.localPath(file.storageKey);
  if (!(await ctx.storage.exists(file.storageKey))) {
    await ctx.db.update(resourceFiles).set({ isMissing: true, processingStatus: 'failed', processingError: 'File missing from storage' }).where(eq(resourceFiles.id, fileId));
    return { status: 'failed' };
  }

  await ctx.db.update(resourceFiles).set({ processingStatus: 'processing', processingError: null }).where(eq(resourceFiles.id, fileId));

  // 1. Security scan
  const scanner = opts.scanner ?? getScanner();
  const verdict = await scanner.scan(path);
  if (verdict.status === 'infected') {
    await ctx.db
      .update(resourceFiles)
      .set({ scanStatus: 'infected', processingStatus: 'failed', processingError: `Security scan failed: ${verdict.signature ?? 'threat detected'}` })
      .where(eq(resourceFiles.id, fileId));
    if (file.resourceId) {
      await ctx.db.update(resources).set({ status: 'unpublished', publishWhenReady: false }).where(eq(resources.id, file.resourceId));
      await ctx.search.removeResource(file.resourceId);
      await recordAudit(ctx, null, { action: 'file.infected', entityType: 'resource', entityId: file.resourceId, entityLabel: file.originalName, changes: { signature: verdict.signature ?? null } });
    }
    return { status: 'infected' };
  }
  await ctx.db.update(resourceFiles).set({ scanStatus: verdict.status }).where(eq(resourceFiles.id, fileId));

  try {
    // 2. Text & metadata extraction (no OCR)
    const extraction = await extractDocument(path, file.kind as AllowedFileKind).catch((err: unknown) => {
      console.warn(`[processing] extraction failed for ${fileId}:`, (err as Error).message);
      return { text: '', pageCount: null, metadata: { extractionError: (err as Error).message } };
    });
    await ctx.db
      .update(resourceFiles)
      .set({
        extractedText: extraction.text || null,
        pageCount: extraction.pageCount,
        metadata: { ...file.metadata, ...extraction.metadata },
      })
      .where(eq(resourceFiles.id, fileId));

    let thumbnail = false;
    let published = false;
    if (file.resourceId) {
      const resource = await ctx.db.query.resources.findFirst({
        where: eq(resources.id, file.resourceId),
        columns: { id: true, title: true, slug: true, fileId: true, thumbnailId: true, status: true, publishWhenReady: true, createdById: true },
        with: { class: true, subject: true, resourceType: true, thumbnail: true },
      });
      // Only the current file drives the thumbnail; custom (non-generated) thumbnails are kept.
      if (resource && resource.fileId === fileId && (!resource.thumbnail || resource.thumbnail.generated)) {
        const source = await renderSourceImage(path, file.kind as AllowedFileKind, {
          title: resource.title,
          subtitle: [resource.class?.shortName ?? resource.class?.name, resource.subject?.name].filter(Boolean).join(' • ') || null,
          badge: resource.resourceType?.name ?? null,
          fileLabel: fileLabel(file.kind),
        });
        const variants = await createThumbnailVariants(source);
        const base = `thumbnails/${file.storageKey.split('/').slice(1, 3).join('/')}/${fileId}`;
        const stored: ThumbnailVariantRecord[] = [];
        for (const v of variants) {
          const key = `${base}-${v.width}.${v.format}`;
          await ctx.storage.upload(key, v.buffer, { contentType: `image/${v.format}` });
          stored.push({ width: v.width, height: v.height, format: v.format, key });
        }
        const largest = stored.reduce((a, b) => (b.width > a.width ? b : a));
        const oldThumb = resource.thumbnail;
        const [asset] = await ctx.db
          .insert(mediaAssets)
          .values({ kind: 'thumbnail', generated: true, width: largest.width, height: largest.height, variants: stored })
          .returning();
        await ctx.db.update(resources).set({ thumbnailId: asset!.id }).where(eq(resources.id, resource.id));
        if (oldThumb) {
          await ctx.db.delete(mediaAssets).where(eq(mediaAssets.id, oldThumb.id));
          const oldKeys = oldThumb.variants.map((v) => v.key).filter((k) => !stored.some((s) => s.key === k));
          if (oldKeys.length) await ctx.enqueue('delete-storage-objects', { keys: oldKeys });
        }
        thumbnail = true;
      }
      if (resource) {
        await ctx.search.indexResource(resource.id);
        if (resource.publishWhenReady && resource.fileId === fileId) {
          await ctx.db.update(resources).set({ publishWhenReady: false }).where(eq(resources.id, resource.id));
          const actorRow = resource.createdById
            ? await ctx.db.query.admins.findFirst({ where: (a, { eq: e }) => e(a.id, resource.createdById!), columns: { id: true, name: true } })
            : null;
          await setResourceStatus(ctx, actorRow ? { id: actorRow.id, name: actorRow.name, permissions: [] } : { id: '', name: 'system', permissions: [] }, resource.id, 'published').catch((err: unknown) => {
            console.warn('[processing] auto-publish failed:', (err as Error).message);
          });
          published = true;
        } else if (resource.status === 'published') {
          await afterContentChange(ctx, [resource.slug]);
        }
      }
    }

    await ctx.db
      .update(resourceFiles)
      .set({ processingStatus: 'ready', processedAt: sql`now()` as unknown as Date })
      .where(eq(resourceFiles.id, fileId));
    return { status: 'ready', pageCount: extraction.pageCount, textLength: extraction.text.length, thumbnail, published };
  } catch (err) {
    await ctx.db
      .update(resourceFiles)
      .set({ processingStatus: 'failed', processingError: (err as Error).message.slice(0, 1000) })
      .where(eq(resourceFiles.id, fileId));
    throw err;
  }
}

/** Marks files whose physical object is missing (broken file check). */
export async function checkFiles(ctx: ServiceContext): Promise<{ checked: number; missing: number }> {
  const files = await ctx.db
    .select({ id: resourceFiles.id, key: resourceFiles.storageKey, isMissing: resourceFiles.isMissing })
    .from(resourceFiles)
    .innerJoin(resources, eq(resources.fileId, resourceFiles.id));
  let missing = 0;
  for (const f of files) {
    const exists = await ctx.storage.exists(f.key);
    if (!exists) missing++;
    if (exists === f.isMissing) {
      await ctx.db.update(resourceFiles).set({ isMissing: !exists, lastCheckedAt: new Date() }).where(eq(resourceFiles.id, f.id));
    }
  }
  await ctx.db.execute(sql`UPDATE resource_files SET last_checked_at = now() WHERE id IN (SELECT file_id FROM resources WHERE file_id IS NOT NULL)`);
  return { checked: files.length, missing };
}
