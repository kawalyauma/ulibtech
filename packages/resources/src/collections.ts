import { asc, desc, eq, sql } from '@edushare/database';
import { collectionResources, collections } from '@edushare/database/schema';
import { AppError, collectionInputSchema, slugify, type ResourceCard } from '@edushare/shared';
import { recordAudit } from './audit';
import { PUBLIC_CACHE_NS, type Actor, type ServiceContext } from './context';
import { afterContentChange } from './admin-resources';
import { getCardsByIds } from './public-resources';

export interface PublicCollection {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  featured: boolean;
  resourceCount: number;
  seoTitle: string | null;
  seoDescription: string | null;
  updatedAt: string;
}

export async function listPublicCollections(
  ctx: ServiceContext,
  opts: { featuredOnly?: boolean; limit?: number } = {},
): Promise<PublicCollection[]> {
  const rows = await ctx.db.execute<{
    id: string;
    slug: string;
    title: string;
    description: string | null;
    featured: boolean;
    seo_title: string | null;
    seo_description: string | null;
    updated_at: string;
    n: number;
  }>(sql`
    SELECT c.id, c.slug, c.title, c.description, c.featured, c.seo_title, c.seo_description, c.updated_at::text,
      (SELECT count(*)::int FROM collection_resources cr JOIN resources r ON r.id = cr.resource_id AND r.status = 'published' WHERE cr.collection_id = c.id) AS n
    FROM collections c
    WHERE c.is_published ${opts.featuredOnly ? sql`AND c.featured` : sql``}
    ORDER BY c.featured DESC, c.sort_order, c.updated_at DESC
    LIMIT ${opts.limit ?? 100}`);
  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    title: r.title,
    description: r.description,
    featured: r.featured,
    resourceCount: r.n,
    seoTitle: r.seo_title,
    seoDescription: r.seo_description,
    updatedAt: r.updated_at,
  }));
}

export async function getPublicCollection(
  ctx: ServiceContext,
  slug: string,
): Promise<(PublicCollection & { resources: ResourceCard[] }) | null> {
  const c = await ctx.db.query.collections.findFirst({ where: eq(collections.slug, slug) });
  if (!c || !c.isPublished) return null;
  const items = await ctx.db
    .select({ id: collectionResources.resourceId })
    .from(collectionResources)
    .where(eq(collectionResources.collectionId, c.id))
    .orderBy(asc(collectionResources.position));
  const cards = await getCardsByIds(
    ctx,
    items.map((i) => i.id),
  );
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    description: c.description,
    featured: c.featured,
    resourceCount: cards.length,
    seoTitle: c.seoTitle,
    seoDescription: c.seoDescription,
    updatedAt: c.updatedAt.toISOString(),
    resources: cards,
  };
}

// ------------------------------------------------------------------ admin

export async function listAdminCollections(ctx: ServiceContext) {
  const rows = await ctx.db.query.collections.findMany({ orderBy: [desc(collections.updatedAt)] });
  const counts = await ctx.db.execute<{ id: string; n: number }>(
    sql`SELECT collection_id AS id, count(*)::int AS n FROM collection_resources GROUP BY 1`,
  );
  const map = new Map(counts.map((c) => [c.id, c.n]));
  return rows.map((r) => ({ ...r, resourceCount: map.get(r.id) ?? 0 }));
}

export async function getAdminCollection(ctx: ServiceContext, id: string) {
  const c = await ctx.db.query.collections.findFirst({ where: eq(collections.id, id) });
  if (!c) throw AppError.notFound('Collection');
  const items = await ctx.db
    .select({ id: collectionResources.resourceId })
    .from(collectionResources)
    .where(eq(collectionResources.collectionId, id))
    .orderBy(asc(collectionResources.position));
  return {
    ...c,
    resources: await getCardsByIds(
      ctx,
      items.map((i) => i.id),
      false,
    ),
  };
}

async function setItems(ctx: ServiceContext, collectionId: string, ids: string[] | undefined) {
  if (!ids) return;
  await ctx.db
    .delete(collectionResources)
    .where(eq(collectionResources.collectionId, collectionId));
  const unique = [...new Set(ids)];
  if (unique.length)
    await ctx.db
      .insert(collectionResources)
      .values(unique.map((resourceId, position) => ({ collectionId, resourceId, position })));
}

export async function saveCollection(
  ctx: ServiceContext,
  actor: Actor,
  id: string | null,
  raw: unknown,
) {
  const input = (id ? collectionInputSchema.partial() : collectionInputSchema).parse(raw);
  const { resourceIds, ...fields } = input;
  const values = {
    ...fields,
    ...(input.title && !id ? { slug: input.slug ?? slugify(input.title, 150) } : {}),
  };
  try {
    let row;
    if (id) {
      [row] = await ctx.db
        .update(collections)
        .set(values)
        .where(eq(collections.id, id))
        .returning();
      if (!row) throw AppError.notFound('Collection');
    } else {
      [row] = await ctx.db
        .insert(collections)
        .values(values as typeof collections.$inferInsert)
        .returning();
    }
    await setItems(ctx, row!.id, resourceIds);
    await recordAudit(ctx, actor, {
      action: id ? 'collection.update' : 'collection.create',
      entityType: 'collection',
      entityId: row!.id,
      entityLabel: row!.title,
    });
    await ctx.cache?.invalidate(PUBLIC_CACHE_NS);
    await afterContentChange(ctx, []);
    return getAdminCollection(ctx, row!.id);
  } catch (err) {
    if ((err as { code?: string }).code === '23505')
      throw AppError.conflict('A collection with that slug already exists.');
    throw err;
  }
}

export async function deleteCollection(ctx: ServiceContext, actor: Actor, id: string) {
  const [row] = await ctx.db.delete(collections).where(eq(collections.id, id)).returning();
  if (!row) throw AppError.notFound('Collection');
  await recordAudit(ctx, actor, {
    action: 'collection.delete',
    entityType: 'collection',
    entityId: id,
    entityLabel: row.title,
  });
  await ctx.cache?.invalidate(PUBLIC_CACHE_NS);
  await afterContentChange(ctx, []);
}
