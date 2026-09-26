import { eq, sql } from '@edushare/database';
import {
  mediaAssets,
  resourceFiles,
  resources,
  type ThumbnailVariantRecord,
} from '@edushare/database/schema';
import fs from 'node:fs/promises';
import {
  CONVERTIBLE_TO_PDF,
  convertWithLibreOffice,
  createThumbnailVariants,
  defaultOcr,
  extractDocument,
  getScanner,
  looksScanned,
  renderSourceImage,
  type ExtractionResult,
  type FileScanner,
  type OcrResult,
} from '@edushare/documents';
import { withLocalCopy } from '@edushare/storage';
import { autoClassifyResource } from './classify';
import { aiEnabled } from './ai';
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
  preview?: boolean;
  ocr?: boolean;
  published?: boolean;
  classified?: string[];
}

export interface ProcessOptions {
  scanner?: FileScanner;
  /** Office → PDF converter (defaults to LibreOffice when installed). */
  convertToPdf?: (path: string) => Promise<string | null>;
  /** OCR for scanned PDFs/images (defaults to Tesseract when OCR_ENABLED=true). */
  ocr?: (path: string, kind: 'pdf' | 'image') => Promise<OcrResult | null>;
}

const LEGACY_TEXT_FROM_PDF = new Set(['doc', 'ppt']);

function previewKeyFor(storageKey: string, fileId: string): string {
  const [, yyyy, mm] = storageKey.split('/');
  return `previews/${yyyy ?? 'misc'}/${mm ?? 'misc'}/${fileId}.pdf`;
}

/**
 * Background processing for an uploaded file:
 * scan → convert (Office→PDF) → extract text/metadata (→ OCR if scanned) → auto-classify →
 * thumbnail → search index → optional auto-publish → optional AI enrichment.
 */
export async function processFile(
  ctx: ServiceContext,
  fileId: string,
  opts: ProcessOptions = {},
): Promise<ProcessResult> {
  const file = await ctx.db.query.resourceFiles.findFirst({ where: eq(resourceFiles.id, fileId) });
  if (!file) return { status: 'skipped' };
  if (!(await ctx.storage.exists(file.storageKey))) {
    await ctx.db
      .update(resourceFiles)
      .set({
        isMissing: true,
        processingStatus: 'failed',
        processingError: 'File missing from storage',
      })
      .where(eq(resourceFiles.id, fileId));
    return { status: 'failed' };
  }
  await ctx.db
    .update(resourceFiles)
    .set({ processingStatus: 'processing', processingError: null })
    .where(eq(resourceFiles.id, fileId));

  return withLocalCopy(ctx.storage, file.storageKey, async (path) => {
    // 1. Security scan
    const scanner = opts.scanner ?? getScanner();
    const verdict = await scanner.scan(path);
    if (verdict.status === 'infected') {
      await ctx.db
        .update(resourceFiles)
        .set({
          scanStatus: 'infected',
          processingStatus: 'failed',
          processingError: `Security scan failed: ${verdict.signature ?? 'threat detected'}`,
        })
        .where(eq(resourceFiles.id, fileId));
      if (file.resourceId) {
        await ctx.db
          .update(resources)
          .set({ status: 'unpublished', publishWhenReady: false })
          .where(eq(resources.id, file.resourceId));
        await ctx.search.removeResource(file.resourceId);
        await recordAudit(ctx, null, {
          action: 'file.infected',
          entityType: 'resource',
          entityId: file.resourceId,
          entityLabel: file.originalName,
          changes: { signature: verdict.signature ?? null },
        });
      }
      return { status: 'infected' } satisfies ProcessResult;
    }
    await ctx.db
      .update(resourceFiles)
      .set({ scanStatus: verdict.status })
      .where(eq(resourceFiles.id, fileId));

    let pdfRendition: string | null = null;
    try {
      const kind = file.kind as AllowedFileKind;
      // 2. Office documents → PDF rendition (preview, thumbnail, page count, legacy text)
      let previewKey: string | null = null;
      if (CONVERTIBLE_TO_PDF.has(kind)) {
        pdfRendition = await (
          opts.convertToPdf ?? ((p: string) => convertWithLibreOffice(p, 'pdf'))
        )(path);
        if (pdfRendition) {
          previewKey = previewKeyFor(file.storageKey, fileId);
          await ctx.storage.upload(previewKey, await fs.readFile(pdfRendition), {
            contentType: 'application/pdf',
          });
        }
      }

      // 3. Text & metadata extraction
      const safeExtract = (p: string, k: AllowedFileKind) =>
        extractDocument(p, k).catch((err: unknown) => {
          console.warn(`[processing] extraction failed for ${fileId}:`, (err as Error).message);
          return {
            text: '',
            pageCount: null,
            metadata: { extractionError: (err as Error).message },
          } as ExtractionResult;
        });
      let extraction: ExtractionResult =
        pdfRendition && LEGACY_TEXT_FROM_PDF.has(kind)
          ? await safeExtract(pdfRendition, 'pdf')
          : await safeExtract(path, kind);
      if (pdfRendition && !extraction.pageCount) {
        const pdfInfo = await safeExtract(pdfRendition, 'pdf');
        extraction = {
          ...extraction,
          pageCount: pdfInfo.pageCount,
          text: extraction.text || pdfInfo.text,
        };
      }

      // 4. OCR when a PDF/image has (almost) no text layer
      let ocrApplied = false;
      const isImage = kind === 'jpg' || kind === 'png' || kind === 'webp';
      if ((kind === 'pdf' || isImage) && looksScanned(extraction.text, extraction.pageCount)) {
        const ocr = await (opts.ocr ?? defaultOcr)(path, isImage ? 'image' : 'pdf');
        if (ocr && ocr.text.trim().length > extraction.text.trim().length) {
          extraction = {
            ...extraction,
            text: ocr.text,
            metadata: { ...extraction.metadata, ocrPages: ocr.pages },
          };
          ocrApplied = true;
        }
      }

      await ctx.db
        .update(resourceFiles)
        .set({
          extractedText: extraction.text || null,
          pageCount: extraction.pageCount,
          metadata: { ...file.metadata, ...extraction.metadata },
          previewKey,
          ocrApplied,
        })
        .where(eq(resourceFiles.id, fileId));
      if (file.previewKey && file.previewKey !== previewKey)
        await ctx.enqueue('delete-storage-objects', { keys: [file.previewKey] });

      let thumbnail = false;
      let published = false;
      let classified: string[] = [];
      if (file.resourceId) {
        // 5. Rule-based classification of empty fields from title, file name and text
        classified = await autoClassifyResource(ctx, file.resourceId, {
          fileName: file.originalName,
          text: extraction.text,
        });

        const resource = await ctx.db.query.resources.findFirst({
          where: eq(resources.id, file.resourceId),
          columns: {
            id: true,
            title: true,
            slug: true,
            fileId: true,
            thumbnailId: true,
            status: true,
            publishWhenReady: true,
            createdById: true,
          },
          with: { class: true, subject: true, resourceType: true, thumbnail: true },
        });
        // 6. Thumbnail from the current file (custom thumbnails are kept)
        if (
          resource &&
          resource.fileId === fileId &&
          (!resource.thumbnail || resource.thumbnail.generated)
        ) {
          const source = await renderSourceImage(
            pdfRendition ?? path,
            pdfRendition ? 'pdf' : kind,
            {
              title: resource.title,
              subtitle:
                [resource.class?.shortName ?? resource.class?.name, resource.subject?.name]
                  .filter(Boolean)
                  .join(' • ') || null,
              badge: resource.resourceType?.name ?? null,
              fileLabel: fileLabel(file.kind),
            },
          );
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
            .values({
              kind: 'thumbnail',
              generated: true,
              width: largest.width,
              height: largest.height,
              variants: stored,
            })
            .returning();
          await ctx.db
            .update(resources)
            .set({ thumbnailId: asset!.id })
            .where(eq(resources.id, resource.id));
          if (oldThumb) {
            await ctx.db.delete(mediaAssets).where(eq(mediaAssets.id, oldThumb.id));
            const oldKeys = oldThumb.variants
              .map((v) => v.key)
              .filter((k) => !stored.some((st) => st.key === k));
            if (oldKeys.length) await ctx.enqueue('delete-storage-objects', { keys: oldKeys });
          }
          thumbnail = true;
        }
        if (resource) {
          // 7. Search index, then optional auto-publish
          await ctx.search.indexResource(resource.id);
          if (resource.publishWhenReady && resource.fileId === fileId) {
            await ctx.db
              .update(resources)
              .set({ publishWhenReady: false })
              .where(eq(resources.id, resource.id));
            const actorRow = resource.createdById
              ? await ctx.db.query.admins.findFirst({
                  where: (a, { eq: e }) => e(a.id, resource.createdById!),
                  columns: { id: true, name: true },
                })
              : null;
            await setResourceStatus(
              ctx,
              actorRow
                ? { id: actorRow.id, name: actorRow.name, permissions: [] }
                : { id: '', name: 'system', permissions: [] },
              resource.id,
              'published',
            ).catch((err: unknown) => {
              console.warn('[processing] auto-publish failed:', (err as Error).message);
            });
            published = true;
          } else if (resource.status === 'published') {
            await afterContentChange(ctx, [resource.slug]);
          }
          // 8. Optional AI summary/classification suggestions
          if (aiEnabled() && extraction.text.length > 200)
            await ctx.enqueue('ai-enrich', { resourceId: resource.id });
        }
      }

      await ctx.db
        .update(resourceFiles)
        .set({ processingStatus: 'ready', processedAt: sql`now()` as unknown as Date })
        .where(eq(resourceFiles.id, fileId));
      return {
        status: 'ready',
        pageCount: extraction.pageCount,
        textLength: extraction.text.length,
        thumbnail,
        preview: Boolean(previewKey),
        ocr: ocrApplied,
        published,
        classified,
      } satisfies ProcessResult;
    } catch (err) {
      await ctx.db
        .update(resourceFiles)
        .set({ processingStatus: 'failed', processingError: (err as Error).message.slice(0, 1000) })
        .where(eq(resourceFiles.id, fileId));
      throw err;
    } finally {
      if (pdfRendition) await fs.rm(pdfRendition, { force: true });
    }
  });
}

/** Marks files whose physical object is missing (broken file check). */
export async function checkFiles(
  ctx: ServiceContext,
): Promise<{ checked: number; missing: number }> {
  const files = await ctx.db
    .select({
      id: resourceFiles.id,
      key: resourceFiles.storageKey,
      isMissing: resourceFiles.isMissing,
    })
    .from(resourceFiles)
    .innerJoin(resources, eq(resources.fileId, resourceFiles.id));
  let missing = 0;
  for (const f of files) {
    const exists = await ctx.storage.exists(f.key);
    if (!exists) missing++;
    if (exists === f.isMissing) {
      await ctx.db
        .update(resourceFiles)
        .set({ isMissing: !exists, lastCheckedAt: new Date() })
        .where(eq(resourceFiles.id, f.id));
    }
  }
  await ctx.db.execute(
    sql`UPDATE resource_files SET last_checked_at = now() WHERE id IN (SELECT file_id FROM resources WHERE file_id IS NOT NULL)`,
  );
  return { checked: files.length, missing };
}
