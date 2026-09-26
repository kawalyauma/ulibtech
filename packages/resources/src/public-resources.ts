import { and, desc, eq, inArray, ne, sql, type SQL } from '@edushare/database';
import { resourceRedirects, resources } from '@edushare/database/schema';
import type {
  ListResourcesQuery,
  Paginated,
  ResourceCard,
  ResourceDetail,
  SearchQuery,
  SearchResponse,
} from '@edushare/shared';
import type { ServiceContext } from './context';
import { mapCard, mapDetail, type ResourceWithRelations } from './mappers';
import { cardRelations, loadCardsByIds, loadDetail, resourceColumns } from './queries';

function filtersOf(q: ListResourcesQuery | SearchQuery) {
  return {
    class: q.class,
    subject: q.subject,
    type: q.type,
    year: q.year,
    term: q.term,
    fileType: q.fileType,
    topic: q.topic,
    curriculum: q.curriculum,
    level: q.level,
    collection: q.collection,
    featured: q.featured,
  };
}

/** Full-text search, hydrated into cards. */
export async function searchResources(
  ctx: ServiceContext,
  q: SearchQuery,
): Promise<SearchResponse> {
  const result = await ctx.search.search({
    q: q.q,
    filters: filtersOf(q),
    page: q.page,
    pageSize: q.pageSize,
    sort: q.sort,
  });
  const cards = await loadCardsByIds(
    ctx.db,
    result.hits.map((h) => h.id),
  );
  const byId = new Map(cards.map((c) => [c.id, c]));
  const items = result.hits
    .map((h) => {
      const row = byId.get(h.id);
      if (!row) return null;
      return { ...mapCard(row, ctx.mediaBaseUrl), highlight: h.highlight, score: h.score };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  return {
    items,
    page: q.page,
    pageSize: q.pageSize,
    total: result.total,
    totalPages: Math.max(1, Math.ceil(result.total / q.pageSize)),
    query: q.q,
    normalizedQuery: result.normalizedQuery,
    tookMs: result.tookMs,
    mode: result.mode,
    didYouMean: result.didYouMean,
    interpreted: result.interpreted,
    facets: result.facets,
  };
}

/** Filtered listing (landing pages, "browse" views). */
export async function listPublicResources(
  ctx: ServiceContext,
  q: ListResourcesQuery,
): Promise<Paginated<ResourceCard> & { facets: SearchResponse['facets'] }> {
  const res = await searchResources(ctx, { ...q, q: '', sort: q.sort });
  const items = q.exclude ? res.items.filter((i) => i.id !== q.exclude) : res.items;
  return {
    items: items.map(({ highlight: _h, score: _s, ...card }) => card),
    page: res.page,
    pageSize: res.pageSize,
    total: res.total,
    totalPages: res.totalPages,
    facets: res.facets,
  };
}

export type PublicResourceLookup =
  | { kind: 'found'; resource: ResourceDetail }
  | { kind: 'redirect'; slug: string }
  | { kind: 'unavailable'; title: string }
  | { kind: 'not_found' };

export async function getPublicResource(
  ctx: ServiceContext,
  slug: string,
): Promise<PublicResourceLookup> {
  const row = await loadDetail(ctx.db, { slug });
  if (!row) {
    const redirect = await ctx.db.query.resourceRedirects.findFirst({
      where: eq(resourceRedirects.oldSlug, slug),
      with: undefined,
    });
    if (redirect) {
      const target = await ctx.db.query.resources.findFirst({
        where: eq(resources.id, redirect.resourceId),
        columns: { slug: true, status: true },
      });
      if (target) return { kind: 'redirect', slug: target.slug };
    }
    return { kind: 'not_found' };
  }
  if (row.status !== 'published') {
    return row.status === 'unpublished' || row.status === 'archived'
      ? { kind: 'unavailable', title: row.title }
      : { kind: 'not_found' };
  }
  return { kind: 'found', resource: mapDetail(row, ctx.mediaBaseUrl) };
}

async function findCards(
  ctx: ServiceContext,
  where: SQL[],
  limit: number,
  order: SQL[] = [desc(resources.downloadCount), desc(resources.publishedAt)],
) {
  const rows = (await ctx.db.query.resources.findMany({
    where: and(eq(resources.status, 'published'), ...where),
    columns: resourceColumns,
    with: cardRelations,
    orderBy: order,
    limit,
  })) as ResourceWithRelations[];
  return rows.map((r) => mapCard(r, ctx.mediaBaseUrl));
}

export interface RelatedGroup {
  title: string;
  href: string | null;
  items: ResourceCard[];
}

/** Related resources grouped for display, e.g. "More P6 Mathematics Past Papers". */
export async function getRelatedResources(
  ctx: ServiceContext,
  resource: ResourceDetail,
  limit = 6,
): Promise<RelatedGroup[]> {
  const groups: RelatedGroup[] = [];
  const seen = new Set<string>([resource.id]);
  const exclude = () =>
    sql`${resources.id} NOT IN (${sql.join(
      [...seen].map((id) => sql`${id}::uuid`),
      sql`, `,
    )})`;
  const cls = resource.class;
  const sub = resource.subject;
  const typ = resource.resourceType;
  const label = [cls?.shortName ?? cls?.name, sub?.name].filter(Boolean).join(' ');

  const add = (title: string, href: string | null, items: ResourceCard[]) => {
    const fresh = items.filter((i) => !seen.has(i.id));
    fresh.forEach((i) => seen.add(i.id));
    if (fresh.length) groups.push({ title, href, items: fresh });
  };

  if (cls && sub && typ) {
    add(
      `More ${label} ${typ.pluralName}`,
      `/${cls.slug}/${sub.slug}/${typ.slug}`,
      await findCards(
        ctx,
        [
          eq(resources.classId, cls.id),
          eq(resources.subjectId, sub.id),
          eq(resources.resourceTypeId, typ.id),
          exclude(),
        ],
        limit,
        [desc(resources.publishedAt)],
      ),
    );
  }
  if (cls && sub) {
    add(
      `Other ${label} Resources`,
      `/${cls.slug}/${sub.slug}`,
      await findCards(
        ctx,
        [
          eq(resources.classId, cls.id),
          eq(resources.subjectId, sub.id),
          exclude(),
          ...(typ ? [ne(resources.resourceTypeId, typ.id)] : []),
        ],
        limit,
      ),
    );
  }
  if (resource.topic) {
    add(
      `More on ${resource.topic.name}`,
      `/topics/${resource.topic.slug}`,
      await findCards(ctx, [eq(resources.topicId, resource.topic.id), exclude()], limit),
    );
  }
  if (cls && typ && groups.reduce((n, g) => n + g.items.length, 0) < limit) {
    add(
      `More ${cls.shortName ?? cls.name} ${typ.pluralName}`,
      `/${cls.slug}/${typ.slug}`,
      await findCards(
        ctx,
        [eq(resources.classId, cls.id), eq(resources.resourceTypeId, typ.id), exclude()],
        limit,
      ),
    );
  }
  if (sub && groups.reduce((n, g) => n + g.items.length, 0) < limit) {
    add(
      `Popular ${sub.name} Resources`,
      `/subjects/${sub.slug}`,
      await findCards(ctx, [eq(resources.subjectId, sub.id), exclude()], limit),
    );
  }
  return groups;
}

export async function getCardsByIds(
  ctx: ServiceContext,
  ids: string[],
  publishedOnly = true,
): Promise<ResourceCard[]> {
  if (!ids.length) return [];
  const rows = await loadCardsByIds(ctx.db, ids);
  return rows
    .filter((r) => !publishedOnly || r.status === 'published')
    .map((r) => mapCard(r, ctx.mediaBaseUrl));
}

export async function listCards(
  ctx: ServiceContext,
  opts: {
    where?: SQL[];
    order: 'newest' | 'downloads' | 'trending_week' | 'trending_today' | 'popular';
    limit: number;
  },
): Promise<ResourceCard[]> {
  const order =
    opts.order === 'newest'
      ? [desc(resources.publishedAt)]
      : opts.order === 'downloads'
        ? [desc(resources.downloadCount), desc(resources.publishedAt)]
        : opts.order === 'trending_today'
          ? [
              desc(resources.trendingDay),
              desc(resources.trendingWeek),
              desc(resources.downloadCount),
            ]
          : opts.order === 'popular'
            ? [desc(resources.popularity), desc(resources.downloadCount)]
            : [
                desc(resources.trendingWeek),
                desc(resources.downloadCount),
                desc(resources.publishedAt),
              ];
  return findCards(ctx, opts.where ?? [], opts.limit, order);
}

export { inArray };
