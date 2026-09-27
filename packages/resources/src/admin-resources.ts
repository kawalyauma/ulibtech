import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type Database,
  type SQL,
} from '@edushare/database';
import {
  classes,
  resourceFiles,
  resourceRedirects,
  resourceTags,
  resourceTypes,
  resourceVersions,
  resources,
  subjects,
  tags,
  academicYears,
  mediaAssets,
} from '@edushare/database/schema';
import {
  AppError,
  CACHE_TAGS,
  slugify,
  type AdminResourceRow,
  type Paginated,
  type ResourceMetadataInput,
  type ResourceStatus,
  type ResourceUpdateInput,
  type adminResourceListSchema,
} from '@edushare/shared';
import type { z } from 'zod';
import { invalidateVocabulary } from '@edushare/search';
import { diff, recordAudit } from './audit';
import { PUBLIC_CACHE_NS, type Actor, type ServiceContext } from './context';
import { findDuplicates } from './duplicates';
import { loadDetail } from './queries';
import { mapDetail } from './mappers';
import { uniqueResourceSlug } from './slugs';
import { attachFileToResource, ingestUpload, type TemporaryUpload } from './uploads';
import { getResourceStats } from '@edushare/analytics';

type AdminListQuery = z.infer<typeof adminResourceListSchema>;

/** Invalidates caches and asks the public site to revalidate affected pages. */
export async function afterContentChange(ctx: ServiceContext, slugs: string[]): Promise<void> {
  await ctx.cache?.invalidate(PUBLIC_CACHE_NS, 'suggest');
  invalidateVocabulary();
  await ctx.enqueue('revalidate-web', {
    tags: [
      CACHE_TAGS.resources,
      CACHE_TAGS.home,
      CACHE_TAGS.landing,
      CACHE_TAGS.sitemap,
      CACHE_TAGS.collections,
      CACHE_TAGS.taxonomy,
      ...slugs.map((s) => CACHE_TAGS.resource(s)),
    ],
  });
}

async function syncTags(
  db: Database,
  resourceId: string,
  names: string[] | undefined,
): Promise<void> {
  if (names === undefined) return;
  const clean = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 40);
  await db.delete(resourceTags).where(eq(resourceTags.resourceId, resourceId));
  if (clean.length === 0) return;
  const tagIds: string[] = [];
  for (const name of clean) {
    const slug = slugify(name, 80);
    if (!slug) continue;
    const [row] = await db
      .insert(tags)
      .values({ name, slug })
      .onConflictDoUpdate({ target: tags.slug, set: { slug } })
      .returning({ id: tags.id });
    if (row) tagIds.push(row.id);
  }
  if (tagIds.length) {
    await db
      .insert(resourceTags)
      .values([...new Set(tagIds)].map((tagId) => ({ resourceId, tagId })))
      .onConflictDoNothing();
  }
}

function metadataColumns(input: ResourceUpdateInput) {
  const cols: Partial<typeof resources.$inferInsert> = {};
  const set = <K extends keyof typeof resources.$inferInsert>(
    key: K,
    value: (typeof resources.$inferInsert)[K] | undefined,
  ) => {
    if (value !== undefined) cols[key] = value;
  };
  set('title', input.title);
  set('description', input.description);
  set('shortDescription', input.shortDescription);
  set('classId', input.classId);
  set('subjectId', input.subjectId);
  set('resourceTypeId', input.resourceTypeId);
  set('academicYearId', input.academicYearId);
  set('termId', input.termId);
  set('topicId', input.topicId);
  set('subtopicId', input.subtopicId);
  set('curriculumId', input.curriculumId);
  set('topicText', input.topic);
  set('subtopicText', input.subtopic);
  set('author', input.author);
  set('publisher', input.publisher);
  set('keywords', input.keywords);
  set('featured', input.featured);
  set('seoTitle', input.seoTitle);
  set('seoDescription', input.seoDescription);
  set('canonicalUrl', input.canonicalUrl);
  return cols;
}

export async function createResourceFromUpload(
  ctx: ServiceContext,
  actor: Actor,
  upload: TemporaryUpload,
  input: ResourceMetadataInput,
  extra: { suggestions?: Record<string, unknown> } = {},
) {
  const file = await ingestUpload(ctx, actor, upload);
  const slug = await uniqueResourceSlug(ctx.db, input.slug ?? input.title);
  const duplicates = await findDuplicates(ctx.db, {
    sha256: file.sha256,
    sizeBytes: file.sizeBytes,
    title: input.title,
    classId: input.classId ?? null,
    subjectId: input.subjectId ?? null,
    academicYearId: input.academicYearId ?? null,
  });

  const resource = await ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .insert(resources)
      .values({
        ...metadataColumns(input),
        title: input.title,
        slug,
        // "Publish now" is honoured once processing (incl. the security scan) completes.
        status: input.status === 'published' || input.status === 'review' ? 'review' : 'draft',
        publishWhenReady: input.status === 'published',
        fileId: file.id,
        createdById: actor.id,
        updatedById: actor.id || null,
        ...(extra.suggestions ? { suggestions: extra.suggestions } : {}),
      })
      .returning();
    if (!row) throw new Error('Failed to create resource');
    await tx.update(resourceFiles).set({ resourceId: row.id }).where(eq(resourceFiles.id, file.id));
    await tx.insert(resourceVersions).values({
      resourceId: row.id,
      versionNumber: 1,
      fileId: file.id,
      createdById: actor.id,
      notes: 'Initial upload',
    });
    await syncTags(tx as unknown as Database, row.id, input.tags);
    return row;
  });

  await recordAudit(ctx, actor, {
    action: 'resource.upload',
    entityType: 'resource',
    entityId: resource.id,
    entityLabel: resource.title,
    changes: { file: file.originalName, sizeBytes: file.sizeBytes, kind: file.kind },
  });
  await ctx.search.indexResource(resource.id);
  await ctx.enqueue('process-file', { fileId: file.id, resourceId: resource.id });

  return {
    resource: await getAdminResource(ctx, resource.id),
    duplicates,
    publishRequested: input.status === 'published',
  };
}

export async function updateResource(
  ctx: ServiceContext,
  actor: Actor,
  id: string,
  input: ResourceUpdateInput,
) {
  const before = await ctx.db.query.resources.findFirst({
    where: eq(resources.id, id),
    columns: { searchVector: false, contentVector: false, searchText: false },
  });
  if (!before) throw AppError.notFound('Resource');
  const cols = metadataColumns(input);
  let newSlug: string | undefined;
  if (input.slug && input.slug !== before.slug) {
    newSlug = await uniqueResourceSlug(ctx.db, input.slug, id);
    cols.slug = newSlug;
  }
  await ctx.db.transaction(async (tx) => {
    if (Object.keys(cols).length) {
      await tx
        .update(resources)
        .set({ ...cols, updatedById: actor.id || null })
        .where(eq(resources.id, id));
    }
    if (newSlug) {
      await tx
        .insert(resourceRedirects)
        .values({ oldSlug: before.slug, resourceId: id })
        .onConflictDoNothing();
      await tx.delete(resourceRedirects).where(eq(resourceRedirects.oldSlug, newSlug));
    }
    await syncTags(tx as unknown as Database, id, input.tags);
  });
  const changes = diff(
    before as unknown as Record<string, unknown>,
    cols as Record<string, unknown>,
  );
  if (input.tags) changes.tags = { from: null, to: input.tags };
  const seoChanged =
    'seoTitle' in changes || 'seoDescription' in changes || 'canonicalUrl' in changes;
  await recordAudit(ctx, actor, {
    action:
      seoChanged && Object.keys(changes).length <= 3 ? 'resource.seo_update' : 'resource.update',
    entityType: 'resource',
    entityId: id,
    entityLabel: (cols.title as string | undefined) ?? before.title,
    changes,
  });
  await ctx.search.indexResource(id);
  if (before.status === 'published')
    await afterContentChange(ctx, [before.slug, ...(newSlug ? [newSlug] : [])]);
  return getAdminResource(ctx, id);
}

async function assertPublishable(ctx: ServiceContext, id: string) {
  const row = await ctx.db.query.resources.findFirst({
    where: eq(resources.id, id),
    columns: { id: true, title: true, slug: true, status: true, fileId: true },
    with: { file: { columns: { processingStatus: true, scanStatus: true, isMissing: true } } },
  });
  if (!row) throw AppError.notFound('Resource');
  if (!row.file) throw AppError.badRequest('Attach a file before publishing.');
  if (row.file.isMissing)
    throw AppError.badRequest('The file for this resource is missing from storage.');
  if (row.file.scanStatus === 'infected')
    throw AppError.badRequest('This file failed the security scan and cannot be published.');
  if (row.file.scanStatus === 'pending') {
    throw AppError.conflict(
      'The file is still being processed. It will be publishable in a moment.',
      { retryable: true },
    );
  }
  return row;
}

export async function setResourceStatus(
  ctx: ServiceContext,
  actor: Actor,
  id: string,
  status: Exclude<ResourceStatus, 'draft' | 'review'>,
) {
  const row =
    status === 'published'
      ? await assertPublishable(ctx, id)
      : await ctx.db.query.resources.findFirst({
          where: eq(resources.id, id),
          columns: { id: true, title: true, slug: true, status: true, fileId: true },
        });
  if (!row) throw AppError.notFound('Resource');
  if (row.status === status) return getAdminResource(ctx, id);
  const now = new Date();
  await ctx.db
    .update(resources)
    .set({
      status,
      updatedById: actor.id || null,
      ...(status === 'published'
        ? { publishedAt: sql`coalesce(${resources.publishedAt}, now())` as unknown as Date }
        : {}),
      ...(status === 'archived' ? { archivedAt: now } : {}),
    })
    .where(eq(resources.id, id));
  if (status === 'published') await ctx.search.indexResource(id);
  else await ctx.search.removeResource(id);
  await recordAudit(ctx, actor, {
    action: `resource.${status === 'published' ? 'publish' : status === 'unpublished' ? 'unpublish' : 'archive'}`,
    entityType: 'resource',
    entityId: id,
    entityLabel: row.title,
    changes: { status: { from: row.status, to: status } },
  });
  await afterContentChange(ctx, [row.slug]);
  return getAdminResource(ctx, id);
}

export async function deleteResource(ctx: ServiceContext, actor: Actor, id: string) {
  const row = await ctx.db.query.resources.findFirst({
    where: eq(resources.id, id),
    columns: { id: true, title: true, slug: true, status: true, thumbnailId: true },
  });
  if (!row) throw AppError.notFound('Resource');
  const files = await ctx.db
    .select({ key: resourceFiles.storageKey, preview: resourceFiles.previewKey })
    .from(resourceFiles)
    .where(eq(resourceFiles.resourceId, id));
  const thumb = row.thumbnailId
    ? await ctx.db.query.mediaAssets.findFirst({ where: eq(mediaAssets.id, row.thumbnailId) })
    : null;
  await ctx.db.transaction(async (tx) => {
    await tx.update(resources).set({ fileId: null, thumbnailId: null }).where(eq(resources.id, id));
    await tx.delete(resources).where(eq(resources.id, id));
    if (thumb) await tx.delete(mediaAssets).where(eq(mediaAssets.id, thumb.id));
  });
  const keys = [
    ...files.flatMap((f) => (f.preview ? [f.key, f.preview] : [f.key])),
    ...(thumb?.variants.map((v) => v.key) ?? []),
  ];
  if (keys.length) await ctx.enqueue('delete-storage-objects', { keys });
  await recordAudit(ctx, actor, {
    action: 'resource.delete',
    entityType: 'resource',
    entityId: id,
    entityLabel: row.title,
    changes: { slug: row.slug, status: row.status, files: files.length },
  });
  if (row.status === 'published') await afterContentChange(ctx, [row.slug]);
}

/** Uploads a new file version and makes it the current public file. */
export async function replaceResourceFile(
  ctx: ServiceContext,
  actor: Actor,
  id: string,
  upload: TemporaryUpload,
  notes?: string,
) {
  const row = await ctx.db.query.resources.findFirst({
    where: eq(resources.id, id),
    columns: { id: true, title: true, slug: true, status: true },
  });
  if (!row) {
    await ctx.storage.delete(upload.tempKey);
    throw AppError.notFound('Resource');
  }
  const file = await ingestUpload(ctx, actor, upload);
  await attachFileToResource(ctx, file.id, id);
  const [{ next } = { next: 1 }] = await ctx.db.execute<{ next: number }>(
    sql`SELECT coalesce(max(version_number), 0)::int + 1 AS next FROM resource_versions WHERE resource_id = ${id}`,
  );
  await ctx.db.insert(resourceVersions).values({
    resourceId: id,
    versionNumber: next,
    fileId: file.id,
    createdById: actor.id,
    notes: notes?.slice(0, 500) ?? null,
  });
  await ctx.db
    .update(resources)
    .set({ fileId: file.id, updatedById: actor.id || null })
    .where(eq(resources.id, id));
  await recordAudit(ctx, actor, {
    action: 'resource.replace_file',
    entityType: 'resource',
    entityId: id,
    entityLabel: row.title,
    changes: { version: next, file: file.originalName },
  });
  await ctx.enqueue('process-file', { fileId: file.id, resourceId: id, reindex: true });
  if (row.status === 'published') await afterContentChange(ctx, [row.slug]);
  return getAdminResource(ctx, id);
}

export async function setCurrentVersion(
  ctx: ServiceContext,
  actor: Actor,
  id: string,
  versionId: string,
) {
  const version = await ctx.db.query.resourceVersions.findFirst({
    where: and(eq(resourceVersions.id, versionId), eq(resourceVersions.resourceId, id)),
    with: { file: { columns: { id: true, scanStatus: true, isMissing: true } } },
  });
  if (!version) throw AppError.notFound('Version');
  if (version.file.scanStatus === 'infected' || version.file.isMissing)
    throw AppError.badRequest('That version cannot be made public.');
  const row = await ctx.db.query.resources.findFirst({
    where: eq(resources.id, id),
    columns: { title: true, slug: true, status: true },
  });
  await ctx.db
    .update(resources)
    .set({ fileId: version.fileId, updatedById: actor.id || null })
    .where(eq(resources.id, id));
  await recordAudit(ctx, actor, {
    action: 'resource.set_version',
    entityType: 'resource',
    entityId: id,
    entityLabel: row?.title ?? null,
    changes: { version: version.versionNumber },
  });
  await ctx.enqueue('process-file', { fileId: version.fileId, resourceId: id, reindex: true });
  if (row?.status === 'published') await afterContentChange(ctx, [row.slug]);
  return getAdminResource(ctx, id);
}

export async function getAdminResource(ctx: ServiceContext, id: string) {
  const row = await loadDetail(ctx.db, { id });
  if (!row) throw AppError.notFound('Resource');
  const [versions, stats] = await Promise.all([
    ctx.db.query.resourceVersions.findMany({
      where: eq(resourceVersions.resourceId, id),
      orderBy: desc(resourceVersions.versionNumber),
      with: { file: { columns: { extractedText: false } } },
    }),
    getResourceStats(ctx.db, id, 30),
  ]);
  const duplicates = await findDuplicates(ctx.db, {
    sha256: row.file?.sha256,
    title: row.title,
    classId: row.classId,
    subjectId: row.subjectId,
    academicYearId: row.academicYearId,
    excludeResourceId: id,
  });
  return {
    ...mapDetail(row, ctx.mediaBaseUrl),
    status: row.status,
    ids: {
      classId: row.classId,
      subjectId: row.subjectId,
      resourceTypeId: row.resourceTypeId,
      academicYearId: row.academicYearId,
      termId: row.termId,
      topicId: row.topicId,
      subtopicId: row.subtopicId,
      curriculumId: row.curriculumId,
    },
    processing: row.file
      ? {
          status: row.file.processingStatus,
          error: row.file.processingError,
          scanStatus: row.file.scanStatus,
          processedAt: row.file.processedAt?.toISOString() ?? null,
          isMissing: row.file.isMissing,
          originalName: row.file.originalName,
          sha256: row.file.sha256,
          hasPreview: Boolean(row.file.previewKey),
          ocrApplied: row.file.ocrApplied,
          metadata: row.file.metadata,
        }
      : null,
    versions: versions.map((v) => ({
      id: v.id,
      versionNumber: v.versionNumber,
      notes: v.notes,
      createdAt: v.createdAt.toISOString(),
      isCurrent: v.fileId === row.fileId,
      file: {
        id: v.file.id,
        originalName: v.file.originalName,
        sizeBytes: v.file.sizeBytes,
        kind: v.file.kind,
        pageCount: v.file.pageCount,
        processingStatus: v.file.processingStatus,
        scanStatus: v.file.scanStatus,
      },
    })),
    stats: [...stats],
    duplicates,
    suggestions: (row.suggestions ?? null) as {
      rules?: Record<string, unknown>;
      ai?: Record<string, unknown>;
    } | null,
  };
}
export type AdminResourceDetail = Awaited<ReturnType<typeof getAdminResource>>;

export async function listAdminResources(
  ctx: ServiceContext,
  q: AdminListQuery,
): Promise<Paginated<AdminResourceRow>> {
  const where: SQL[] = [];
  if (q.status) where.push(eq(resources.status, q.status));
  if (q.classId) where.push(eq(resources.classId, q.classId));
  if (q.subjectId) where.push(eq(resources.subjectId, q.subjectId));
  if (q.resourceTypeId) where.push(eq(resources.resourceTypeId, q.resourceTypeId));
  if (q.q) {
    const like = `%${q.q.replace(/[%_]/g, '')}%`;
    where.push(
      or(
        ilike(resources.title, like),
        ilike(resources.slug, like),
        ilike(resourceFiles.originalName, like),
      )!,
    );
  }
  const order =
    q.sort === 'newest'
      ? desc(resources.createdAt)
      : q.sort === 'title'
        ? asc(resources.title)
        : q.sort === 'downloads'
          ? desc(resources.downloadCount)
          : q.sort === 'views'
            ? desc(resources.viewCount)
            : desc(resources.updatedAt);
  const whereSql = where.length ? and(...where) : undefined;
  const rows = await ctx.db
    .select({
      id: resources.id,
      title: resources.title,
      slug: resources.slug,
      status: resources.status,
      featured: resources.featured,
      className: classes.shortName,
      subjectName: subjects.name,
      resourceTypeName: resourceTypes.name,
      year: academicYears.year,
      viewCount: resources.viewCount,
      downloadCount: resources.downloadCount,
      shareCount: resources.shareCount,
      processingStatus: resourceFiles.processingStatus,
      scanStatus: resourceFiles.scanStatus,
      fileExtension: resourceFiles.extension,
      updatedAt: resources.updatedAt,
      publishedAt: resources.publishedAt,
      total: sql<number>`count(*) OVER ()::int`,
    })
    .from(resources)
    .leftJoin(classes, eq(classes.id, resources.classId))
    .leftJoin(subjects, eq(subjects.id, resources.subjectId))
    .leftJoin(resourceTypes, eq(resourceTypes.id, resources.resourceTypeId))
    .leftJoin(academicYears, eq(academicYears.id, resources.academicYearId))
    .leftJoin(resourceFiles, eq(resourceFiles.id, resources.fileId))
    .where(whereSql)
    .orderBy(order)
    .limit(q.pageSize)
    .offset((q.page - 1) * q.pageSize);
  const total = rows[0]?.total ?? 0;
  return {
    items: rows.map(({ total: _t, ...r }) => ({
      ...r,
      updatedAt: r.updatedAt.toISOString(),
      publishedAt: r.publishedAt?.toISOString() ?? null,
    })),
    page: q.page,
    pageSize: q.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  };
}

export async function bulkResourceAction(
  ctx: ServiceContext,
  actor: Actor,
  ids: string[],
  action: 'publish' | 'unpublish' | 'archive' | 'delete' | 'feature' | 'unfeature',
) {
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of ids) {
    try {
      if (action === 'delete') await deleteResource(ctx, actor, id);
      else if (action === 'feature' || action === 'unfeature')
        await updateResource(ctx, actor, id, { featured: action === 'feature' });
      else
        await setResourceStatus(
          ctx,
          actor,
          id,
          action === 'publish' ? 'published' : action === 'unpublish' ? 'unpublished' : 'archived',
        );
      results.push({ id, ok: true });
    } catch (err) {
      results.push({ id, ok: false, error: err instanceof Error ? err.message : 'Failed' });
    }
  }
  return results;
}

export async function getResourceIdsByStatus(db: Database, statuses: ResourceStatus[]) {
  return db.select({ id: resources.id }).from(resources).where(inArray(resources.status, statuses));
}
