import { Hono } from 'hono';
import sharp from 'sharp';
import { eq } from '@edushare/database';
import { mediaAssets, resources } from '@edushare/database/schema';
import {
  bulkResourceAction,
  createResourceFromUpload,
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
      throw new AppError('PAYLOAD_TOO_LARGE', `Uploads are limited to ${env.MAX_UPLOAD_MB} MB per file.`);
    }
  };

  app.get('/', requirePermission('resources.read'), async (c) => {
    return c.json(await listAdminResources(ctx, parse(adminResourceListSchema, query(c))));
  });

  app.post('/', requirePermission('resources.create'), async (c) => {
    checkLength(c);
    const { fields, files } = await parseMultipart(c, ctx.storage, { maxFileBytes: maxBytes, maxFiles: 1 });
    const file = files[0];
    if (!file) throw AppError.badRequest('Choose a file to upload.');
    try {
      const raw = fieldsToObject(fields);
      if (!raw.title) raw.title = titleFromFileName(file.originalName);
      const input = parse(resourceMetadataSchema, raw);
      if (input.status === 'published' && !c.get('admin')!.permissions.includes('resources.publish')) {
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
    const { fields, files } = await parseMultipart(c, ctx.storage, { maxFileBytes: maxBytes, maxFiles: 50 });
    if (!files.length) throw AppError.badRequest('Choose at least one file.');
    const common = parse(bulkCommonSchema, fieldsToObject(fields));
    const results: { fileName: string; ok: boolean; resource?: { id: string; title: string; slug: string }; duplicates?: unknown[]; error?: string }[] = [];
    for (const f of files) {
      try {
        const title = common.titles?.[f.originalName] ?? titleFromFileName(f.originalName);
        const { titles: _t, ...meta } = common;
        const r = await createResourceFromUpload(ctx, actorOf(c), f, { ...meta, title, status: 'draft' });
        results.push({ fileName: f.originalName, ok: true, resource: { id: r.resource.id, title: r.resource.title, slug: r.resource.slug }, duplicates: r.duplicates });
      } catch (err) {
        await ctx.storage.delete(f.tempKey).catch(() => undefined);
        results.push({ fileName: f.originalName, ok: false, error: err instanceof AppError ? err.message : 'Upload failed' });
      }
    }
    return c.json({ results }, 201);
  });

  app.post('/duplicates', requirePermission('resources.read'), async (c) => {
    const body = parse(
      z.object({
        title: z.string().max(200).optional(),
        sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
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
    const needed = body.action === 'delete' ? 'resources.delete' : ['publish', 'unpublish', 'archive'].includes(body.action) ? 'resources.publish' : 'resources.update';
    if (!perms.includes(needed)) throw AppError.forbidden();
    return c.json({ results: await bulkResourceAction(ctx, actorOf(c), body.ids, body.action) });
  });

  app.get('/:id', requirePermission('resources.read'), async (c) => c.json(await getAdminResource(ctx, c.req.param('id'))));

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
    const { fields, files } = await parseMultipart(c, ctx.storage, { maxFileBytes: maxBytes, maxFiles: 1 });
    const file = files[0];
    if (!file) throw AppError.badRequest('Choose a file to upload.');
    const notes = typeof fields.notes === 'string' ? fields.notes : undefined;
    return c.json(await replaceResourceFile(ctx, actorOf(c), c.req.param('id'), file, notes));
  });

  app.post('/:id/versions/:versionId/activate', requirePermission('resources.update'), async (c) =>
    c.json(await setCurrentVersion(ctx, actorOf(c), c.req.param('id'), c.req.param('versionId'))),
  );

  app.post('/:id/reprocess', requirePermission('resources.update'), async (c) => {
    const row = await ctx.db.query.resources.findFirst({ where: eq(resources.id, c.req.param('id')), columns: { fileId: true } });
    if (!row?.fileId) throw AppError.notFound('File');
    await ctx.enqueue('process-file', { fileId: row.fileId, resourceId: c.req.param('id'), reindex: true });
    return c.json({ ok: true });
  });

  // Custom thumbnail (replaces the generated one).
  app.post('/:id/thumbnail', requirePermission('resources.update'), async (c) => {
    checkLength(c);
    const id = c.req.param('id');
    const row = await ctx.db.query.resources.findFirst({ where: eq(resources.id, id), columns: { id: true, title: true, slug: true, status: true, thumbnailId: true } });
    if (!row) throw AppError.notFound('Resource');
    const { files } = await parseMultipart(c, ctx.storage, { maxFileBytes: 10 * 1024 * 1024, maxFiles: 1 });
    const file = files[0];
    if (!file || !ctx.storage.localPath) throw AppError.badRequest('Choose an image.');
    try {
      const path = ctx.storage.localPath(file.tempKey);
      const meta = await sharp(path).metadata().catch(() => null);
      if (!meta || !['jpeg', 'png', 'webp'].includes(meta.format ?? '')) throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Thumbnail must be a JPEG, PNG or WebP image.');
      const variants = [];
      for (const width of THUMBNAIL_WIDTHS) {
        const height = Math.round(width * 1.3);
        const key = `thumbnails/custom/${id}-${Date.now()}-${width}.webp`;
        const buf = await sharp(path).rotate().resize(width, height, { fit: 'cover', position: 'top' }).webp({ quality: 80 }).toBuffer();
        await ctx.storage.upload(key, buf, { contentType: 'image/webp' });
        variants.push({ width, height, format: 'webp' as const, key });
      }
      const [asset] = await ctx.db.insert(mediaAssets).values({ kind: 'thumbnail', generated: false, width: 1200, height: 1560, variants }).returning();
      await ctx.db.update(resources).set({ thumbnailId: asset!.id }).where(eq(resources.id, id));
      if (row.thumbnailId) await ctx.db.delete(mediaAssets).where(eq(mediaAssets.id, row.thumbnailId));
      await recordAudit(ctx, actorOf(c), { action: 'resource.thumbnail', entityType: 'resource', entityId: id, entityLabel: row.title });
      if (row.status === 'published') await afterContentChange(ctx, [row.slug]);
      return c.json(await getAdminResource(ctx, id));
    } finally {
      await ctx.storage.delete(file.tempKey).catch(() => undefined);
    }
  });

  return app;
}
