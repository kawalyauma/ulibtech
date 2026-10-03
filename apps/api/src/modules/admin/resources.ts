import { Readable } from 'node:stream';
import { Hono } from 'hono';
import sharp from 'sharp';
import { eq, inArray } from '@edushare/database';
import { mediaAssets, resources } from '@edushare/database/schema';
import {
  bulkResourceAction,
  createResourceFromUpload,
  completeZipUpload,
  createZipBatch,
  createZipUpload,
  getZipBatch,
  listZipBatches,
  putZipChunk,
  zipUploadStatus,
  deleteResource,
  findDuplicates,
  getAdminResource,
  listAdminResources,
  recordAudit,
  replaceResourceFile,
  setCurrentVersion,
  setResourceStatus,
  updateResource,
  afterContentChange,
  aiEnabled,
  enrichResource,
  IMPORT_TEMPLATE_CSV,
  parseImportSheet,
  resolveImportRows,
  suggestClassification,
  type Actor,
} from '@edushare/resources';
import {
  AppError,
  adminResourceListSchema,
  bulkActionSchema,
  resourceMetadataSchema,
  resourceUpdateSchema,
  THUMBNAIL_WIDTHS,
  titleFromFileName,
} from '@edushare/shared';
import { z } from 'zod';
import { clientIp, jsonBody, parse, query, type AppContext, type AppEnv } from '../../lib/http';
import { fieldsToObject, parseMultipart } from '../../lib/upload';
import { requirePermission } from '../../middleware/auth';
import type { Services } from '../../services';

export function actorOf(c: AppContext): Actor {
  const a = c.get('admin')!;
  return { id: a.id, name: a.name, ip: clientIp(c), permissions: a.permissions };
}

const bulkCommonSchema = resourceMetadataSchema.omit({ title: true, slug: true }).extend({
  titles: z.record(z.string(), z.string().min(3).max(200)).optional(),
});

export function adminResourceRoutes(services: Services) {
  const { ctx, env } = services;
  const app = new Hono<AppEnv>();
  const maxBytes = env.MAX_UPLOAD_MB * 1024 * 1024;

  const checkLength = (c: AppContext, files = 1) => {
    const len = Number(c.req.header('content-length') ?? 0);
    if (len && len > maxBytes * files + 1024 * 1024) {
      throw new AppError(
        'PAYLOAD_TOO_LARGE',
        `Uploads are limited to ${env.MAX_UPLOAD_MB} MB per file.`,
      );
    }
  };

  app.get('/', requirePermission('resources.read'), async (c) => {
    return c.json(await listAdminResources(ctx, parse(adminResourceListSchema, query(c))));
  });

  app.post('/', requirePermission('resources.create'), async (c) => {
    checkLength(c);
    const { fields, files } = await parseMultipart(c, ctx.storage, {
      maxFileBytes: maxBytes,
      maxFiles: 1,
    });
    const file = files[0];
    if (!file) throw AppError.badRequest('Choose a file to upload.');
    try {
      const raw = fieldsToObject(fields);
      if (!raw.title) raw.title = titleFromFileName(file.originalName);
      const input = parse(resourceMetadataSchema, raw);
      if (
        input.status === 'published' &&
        !c.get('admin')!.permissions.includes('resources.publish')
      ) {
        input.status = 'review';
      }
      const result = await createResourceFromUpload(ctx, actorOf(c), file, input);
      return c.json(result, 201);
    } catch (err) {
      await ctx.storage.delete(file.tempKey).catch(() => undefined);
      throw err;
    }
  });

  // Bulk upload: many files sharing common metadata. Creates drafts for review.
  app.post('/bulk-upload', requirePermission('resources.create'), async (c) => {
    checkLength(c, 50);
    const { fields, files } = await parseMultipart(c, ctx.storage, {
      maxFileBytes: maxBytes,
      maxFiles: 50,
    });
    if (!files.length) throw AppError.badRequest('Choose at least one file.');
    const common = parse(bulkCommonSchema, fieldsToObject(fields));
    const results: {
      fileName: string;
      ok: boolean;
      resource?: { id: string; title: string; slug: string };
      duplicates?: unknown[];
      error?: string;
    }[] = [];
    for (const f of files) {
      try {
        const title = common.titles?.[f.originalName] ?? titleFromFileName(f.originalName);
        const { titles: _t, ...meta } = common;
        const r = await createResourceFromUpload(ctx, actorOf(c), f, {
          ...meta,
          title,
          status: 'draft',
        });
        results.push({
          fileName: f.originalName,
          ok: true,
          resource: { id: r.resource.id, title: r.resource.title, slug: r.resource.slug },
          duplicates: r.duplicates,
        });
      } catch (err) {
        await ctx.storage.delete(f.tempKey).catch(() => undefined);
        results.push({
          fileName: f.originalName,
          ok: false,
          error: err instanceof AppError ? err.message : 'Upload failed',
        });
      }
    }
    return c.json({ results }, 201);
  });

  // ---------------------------------------------------------------- zip import
  // One zip of documents; the worker unpacks it and each file goes through processing, AI
  // enrichment and (with AI_AUTOPILOT=true) automatic publishing when it passes quality checks.
  const zipMaxBytes = Number(process.env.ZIP_MAX_MB ?? 4096) * 1024 * 1024;

  const queueZipImport = async (
    c: AppContext,
    file: { tempKey: string; fileName: string; size: number },
  ) => {
    const actor = actorOf(c);
    const batch = await createZipBatch(services.redis, file.fileName, actor);
    const queued = await ctx.enqueue('import-zip', {
      batchId: batch.id,
      tempKey: file.tempKey,
      actorId: actor.id,
      actorName: actor.name,
    });
    if (!queued) {
      await ctx.storage.delete(file.tempKey).catch(() => undefined);
      throw new AppError('INTERNAL', 'The import queue is unavailable. Try again shortly.');
    }
    await recordAudit(ctx, actor, {
      action: 'resource.zip_import',
      entityType: 'import',
      entityId: batch.id,
      entityLabel: file.fileName,
      changes: { sizeBytes: file.size },
    });
    return batch;
  };

  // Chunked, resumable upload (used by the admin UI): start → PUT each 16 MB chunk (retries
  // are safe) → complete. Survives flaky connections that kill a single multi-GB request.
  app.post('/zip-uploads', requirePermission('resources.create'), async (c) => {
    const body = parse(
      z.object({ fileName: z.string().min(1).max(255), size: z.number().int().positive() }),
      await jsonBody(c),
    );
    const upload = await createZipUpload(
      services.redis,
      { ...body, maxBytes: zipMaxBytes },
      actorOf(c),
    );
    return c.json({ upload }, 201);
  });

  app.get('/zip-uploads/:id', requirePermission('resources.create'), async (c) =>
    c.json(await zipUploadStatus(services.redis, c.req.param('id'), actorOf(c))),
  );

  app.put('/zip-uploads/:id/chunks/:index', requirePermission('resources.create'), async (c) => {
    const raw = c.req.raw.body;
    if (!raw) throw AppError.badRequest('Empty chunk.');
    const result = await putZipChunk(
      ctx,
      services.redis,
      c.req.param('id'),
      Number(c.req.param('index')),
      Readable.fromWeb(raw as import('node:stream/web').ReadableStream),
      actorOf(c),
    );
    return c.json(result);
  });

  app.post('/zip-uploads/:id/complete', requirePermission('resources.create'), async (c) => {
    const file = await completeZipUpload(ctx, services.redis, c.req.param('id'), actorOf(c));
    return c.json({ batch: await queueZipImport(c, file) }, 202);
  });
  app.post('/zip-import', requirePermission('resources.create'), async (c) => {
    const len = Number(c.req.header('content-length') ?? 0);
    if (len && len > zipMaxBytes + 1024 * 1024)
      throw new AppError(
        'PAYLOAD_TOO_LARGE',
        `Zip files are limited to ${zipMaxBytes / 1024 / 1024} MB.`,
      );
    const { files } = await parseMultipart(c, ctx.storage, {
      maxFileBytes: zipMaxBytes,
      maxFiles: 1,
    });
    const file = files[0];
    if (!file) throw AppError.badRequest('Choose a .zip file to import.');
    if (!/\.zip$/i.test(file.originalName)) {
      await ctx.storage.delete(file.tempKey).catch(() => undefined);
      throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Only .zip files can be imported here.');
    }
    const batch = await queueZipImport(c, {
      tempKey: file.tempKey,
      fileName: file.originalName,
      size: file.sizeBytes,
    });
    return c.json({ batch }, 202);
  });

  app.get('/zip-imports', requirePermission('resources.read'), async (c) =>
    c.json({ items: await listZipBatches(services.redis) }),
  );

  app.get('/zip-imports/:batchId', requirePermission('resources.read'), async (c) => {
    const batch = await getZipBatch(services.redis, c.req.param('batchId'));
    if (!batch) throw AppError.notFound('Import');
    // Live state of each created resource: status plus the autopilot's decision.
    const ids = batch.items.flatMap((i) => (i.resourceId ? [i.resourceId] : []));
    const rows = ids.length
      ? await ctx.db
          .select({
            id: resources.id,
            title: resources.title,
            slug: resources.slug,
            status: resources.status,
            suggestions: resources.suggestions,
          })
          .from(resources)
          .where(inArray(resources.id, ids))
      : [];
    const byId = new Map(
      rows.map((r) => {
        const autopilot = (r.suggestions ?? {}).autopilot as
          { published: boolean; reasons: string[] } | undefined;
        return [
          r.id,
          {
            id: r.id,
            title: r.title,
            slug: r.slug,
            status: r.status,
            reasons: autopilot?.reasons ?? null,
            checked: Boolean(autopilot),
          },
        ];
      }),
    );
    return c.json({
      batch,
      resources: batch.items.map((i) => ({
        ...i,
        resource: i.resourceId ? (byId.get(i.resourceId) ?? null) : null,
      })),
    });
  });

  // ---------------------------------------------------------------- spreadsheet import
  app.get('/import/template', requirePermission('resources.create'), (c) => {
    c.header('Content-Type', 'text/csv; charset=utf-8');
    c.header('Content-Disposition', 'attachment; filename="edushare-import-template.csv"');
    return c.body(IMPORT_TEMPLATE_CSV);
  });

  const readSheet = async (c: AppContext, maxFiles: number) => {
    const { fields, files } = await parseMultipart(c, ctx.storage, {
      maxFileBytes: maxBytes,
      maxFiles,
    });
    const sheet = files.find((f) => f.field === 'sheet');
    if (!sheet) {
      await Promise.all(files.map((f) => ctx.storage.delete(f.tempKey).catch(() => undefined)));
      throw AppError.badRequest('Attach the metadata spreadsheet (CSV or XLSX) as "sheet".');
    }
    try {
      const rows = await parseImportSheet(
        await ctx.storage.read(sheet.tempKey),
        sheet.originalName,
      );
      return { fields, files: files.filter((f) => f !== sheet), rows };
    } finally {
      await ctx.storage.delete(sheet.tempKey).catch(() => undefined);
    }
  };

  app.post('/import/validate', requirePermission('resources.create'), async (c) => {
    const { rows } = await readSheet(c, 1);
    const resolved = await resolveImportRows(ctx, rows);
    return c.json({
      rows: resolved,
      valid: resolved.filter((r) => !r.errors.length).length,
      invalid: resolved.filter((r) => r.errors.length).length,
    });
  });

  app.post('/import', requirePermission('resources.create'), async (c) => {
    checkLength(c, 100);
    const { files, rows } = await readSheet(c, 101);
    const resolved = await resolveImportRows(ctx, rows);
    const byName = new Map(files.map((f) => [f.originalName.toLowerCase(), f]));
    const used = new Set<string>();
    const canPublish = c.get('admin')!.permissions.includes('resources.publish');
    const results: {
      row: number;
      ok: boolean;
      action: string;
      id?: string;
      title?: string;
      error?: string;
    }[] = [];
    try {
      for (const r of resolved) {
        if (r.errors.length) {
          results.push({ row: r.row, ok: false, action: 'skipped', error: r.errors.join('; ') });
          continue;
        }
        try {
          const status =
            r.metadata.status === 'published' && !canPublish ? 'review' : r.metadata.status;
          if (r.existingId) {
            const { status: _s, ...meta } = r.metadata;
            const updated = await updateResource(ctx, actorOf(c), r.existingId, meta);
            results.push({
              row: r.row,
              ok: true,
              action: 'updated',
              id: updated.id,
              title: updated.title,
            });
            continue;
          }
          const file = byName.get((r.fileName ?? '').toLowerCase());
          if (!file) {
            results.push({
              row: r.row,
              ok: false,
              action: 'skipped',
              error: `File "${r.fileName}" was not included in the upload`,
            });
            continue;
          }
          used.add(file.tempKey);
          const input = parse(resourceMetadataSchema, {
            ...r.metadata,
            title: r.metadata.title ?? titleFromFileName(file.originalName),
            status,
          });
          const created = await createResourceFromUpload(ctx, actorOf(c), file, input);
          results.push({
            row: r.row,
            ok: true,
            action: 'created',
            id: created.resource.id,
            title: created.resource.title,
          });
        } catch (err) {
          results.push({
            row: r.row,
            ok: false,
            action: 'failed',
            error: err instanceof AppError ? err.message : 'Import failed',
          });
        }
      }
    } finally {
      for (const f of files)
        if (!used.has(f.tempKey)) await ctx.storage.delete(f.tempKey).catch(() => undefined);
    }
    const unmatched = files.filter((f) => !used.has(f.tempKey)).map((f) => f.originalName);
    return c.json({ results, unmatchedFiles: unmatched }, 201);
  });

  // Classification suggestions for the upload form (from title and file name).
  app.post('/classify', requirePermission('resources.create'), async (c) => {
    const body = parse(
      z.object({ title: z.string().max(200).optional(), fileName: z.string().max(255).optional() }),
      await jsonBody(c),
    );
    return c.json(await suggestClassification(ctx, body));
  });

  app.post('/duplicates', requirePermission('resources.read'), async (c) => {
    const body = parse(
      z.object({
        title: z.string().max(200).optional(),
        sha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .optional(),
        sizeBytes: z.number().int().optional(),
        classId: z.uuid().nullable().optional(),
        subjectId: z.uuid().nullable().optional(),
        academicYearId: z.uuid().nullable().optional(),
        excludeResourceId: z.uuid().optional(),
      }),
      await jsonBody(c),
    );
    return c.json({ items: await findDuplicates(ctx.db, body) });
  });

  app.post('/bulk', requirePermission('resources.update'), async (c) => {
    const body = parse(bulkActionSchema, await jsonBody(c));
    const perms = c.get('admin')!.permissions;
    const needed =
      body.action === 'delete'
        ? 'resources.delete'
        : ['publish', 'unpublish', 'archive'].includes(body.action)
          ? 'resources.publish'
          : 'resources.update';
    if (!perms.includes(needed)) throw AppError.forbidden();
    return c.json({ results: await bulkResourceAction(ctx, actorOf(c), body.ids, body.action) });
  });

  app.get('/:id', requirePermission('resources.read'), async (c) =>
    c.json(await getAdminResource(ctx, c.req.param('id'))),
  );

  app.patch('/:id', requirePermission('resources.update'), async (c) => {
    const input = parse(resourceUpdateSchema, await jsonBody(c));
    if (input.status) delete input.status; // status changes use dedicated endpoints
    return c.json(await updateResource(ctx, actorOf(c), c.req.param('id'), input));
  });

  app.delete('/:id', requirePermission('resources.delete'), async (c) => {
    await deleteResource(ctx, actorOf(c), c.req.param('id'));
    return c.json({ ok: true });
  });

  for (const [action, status] of [
    ['publish', 'published'],
    ['unpublish', 'unpublished'],
    ['archive', 'archived'],
  ] as const) {
    app.post(`/:id/${action}`, requirePermission('resources.publish'), async (c) =>
      c.json(await setResourceStatus(ctx, actorOf(c), c.req.param('id'), status)),
    );
  }

  app.post('/:id/file', requirePermission('resources.update'), async (c) => {
    checkLength(c);
    const { fields, files } = await parseMultipart(c, ctx.storage, {
      maxFileBytes: maxBytes,
      maxFiles: 1,
    });
    const file = files[0];
    if (!file) throw AppError.badRequest('Choose a file to upload.');
    const notes = typeof fields.notes === 'string' ? fields.notes : undefined;
    return c.json(await replaceResourceFile(ctx, actorOf(c), c.req.param('id'), file, notes));
  });

  app.post('/:id/versions/:versionId/activate', requirePermission('resources.update'), async (c) =>
    c.json(await setCurrentVersion(ctx, actorOf(c), c.req.param('id'), c.req.param('versionId'))),
  );

  app.post('/:id/reprocess', requirePermission('resources.update'), async (c) => {
    const row = await ctx.db.query.resources.findFirst({
      where: eq(resources.id, c.req.param('id')),
      columns: { fileId: true },
    });
    if (!row?.fileId) throw AppError.notFound('File');
    await ctx.enqueue('process-file', {
      fileId: row.fileId,
      resourceId: c.req.param('id'),
      reindex: true,
    });
    return c.json({ ok: true });
  });

  app.post('/:id/enrich', requirePermission('resources.update'), async (c) => {
    if (!aiEnabled())
      throw AppError.badRequest(
        'AI suggestions are not enabled on this server (set AI_ENRICH_ENABLED and an Anthropic API key).',
      );
    const suggestion = await enrichResource(ctx, c.req.param('id'));
    if (!suggestion) throw AppError.badRequest('Not enough extracted text to summarise this file.');
    return c.json(await getAdminResource(ctx, c.req.param('id')));
  });

  // Apply rule-based or AI suggestions field by field (admin stays in control).
  app.post('/:id/suggestions/apply', requirePermission('resources.update'), async (c) => {
    const body = parse(
      z.object({
        source: z.enum(['rules', 'ai']),
        fields: z
          .array(
            z.enum([
              'classId',
              'subjectId',
              'resourceTypeId',
              'academicYearId',
              'termId',
              'topicId',
              'shortDescription',
              'description',
              'keywords',
            ]),
          )
          .min(1),
      }),
      await jsonBody(c),
    );
    const id = c.req.param('id');
    const row = await ctx.db.query.resources.findFirst({
      where: eq(resources.id, id),
      columns: { suggestions: true, keywords: true },
    });
    if (!row) throw AppError.notFound('Resource');
    const sugg = (row.suggestions ?? {})[body.source] as
      | {
          ids?: Record<string, string>;
          shortDescription?: string;
          description?: string;
          keywords?: string[];
          [k: string]: unknown;
        }
      | undefined;
    if (!sugg)
      throw AppError.badRequest('There are no suggestions of that kind for this resource.');
    const ids = body.source === 'ai' ? (sugg.ids ?? {}) : (sugg as Record<string, string>);
    const update: Record<string, unknown> = {};
    for (const f of body.fields) {
      if (f === 'shortDescription' || f === 'description') {
        if (sugg[f]) update[f] = sugg[f];
      } else if (f === 'keywords') {
        if (sugg.keywords?.length)
          update.keywords = [...new Set([...row.keywords, ...sugg.keywords])];
      } else if (ids[f]) update[f] = ids[f];
    }
    return c.json(await updateResource(ctx, actorOf(c), id, update));
  });

  // Custom thumbnail (replaces the generated one).
  app.post('/:id/thumbnail', requirePermission('resources.update'), async (c) => {
    checkLength(c);
    const id = c.req.param('id');
    const row = await ctx.db.query.resources.findFirst({
      where: eq(resources.id, id),
      columns: { id: true, title: true, slug: true, status: true, thumbnailId: true },
    });
    if (!row) throw AppError.notFound('Resource');
    const { files } = await parseMultipart(c, ctx.storage, {
      maxFileBytes: 10 * 1024 * 1024,
      maxFiles: 1,
    });
    const file = files[0];
    if (!file) throw AppError.badRequest('Choose an image.');
    try {
      const path = await ctx.storage.read(file.tempKey);
      const meta = await sharp(path)
        .metadata()
        .catch(() => null);
      if (!meta || !['jpeg', 'png', 'webp'].includes(meta.format ?? ''))
        throw new AppError(
          'UNSUPPORTED_MEDIA_TYPE',
          'Thumbnail must be a JPEG, PNG or WebP image.',
        );
      const variants = [];
      for (const width of THUMBNAIL_WIDTHS) {
        const height = Math.round(width * 1.3);
        const key = `thumbnails/custom/${id}-${Date.now()}-${width}.webp`;
        const buf = await sharp(path)
          .rotate()
          .resize(width, height, { fit: 'cover', position: 'top' })
          .webp({ quality: 80 })
          .toBuffer();
        await ctx.storage.upload(key, buf, { contentType: 'image/webp' });
        variants.push({ width, height, format: 'webp' as const, key });
      }
      const [asset] = await ctx.db
        .insert(mediaAssets)
        .values({ kind: 'thumbnail', generated: false, width: 1200, height: 1560, variants })
        .returning();
      await ctx.db.update(resources).set({ thumbnailId: asset!.id }).where(eq(resources.id, id));
      if (row.thumbnailId)
        await ctx.db.delete(mediaAssets).where(eq(mediaAssets.id, row.thumbnailId));
      await recordAudit(ctx, actorOf(c), {
        action: 'resource.thumbnail',
        entityType: 'resource',
        entityId: id,
        entityLabel: row.title,
      });
      if (row.status === 'published') await afterContentChange(ctx, [row.slug]);
      return c.json(await getAdminResource(ctx, id));
    } finally {
      await ctx.storage.delete(file.tempKey).catch(() => undefined);
    }
  });

  return app;
}
