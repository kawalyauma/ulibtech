import { Hono } from 'hono';
import { recordEvent, recordSearch, recordShare, recordView } from '@edushare/analytics';
import { eq } from '@edushare/database';
import { resources } from '@edushare/database/schema';
import {
  getCardsByIds,
  getHome,
  getLanding,
  getPublicCollection,
  getPublicResource,
  getPublicTaxonomy,
  getRelatedResources,
  getSetting,
  getSitemapIndex,
  getSitemapUrls,
  getClassSubjects,
  listPublicCollections,
  listPublicResources,
  searchResources,
  PUBLIC_CACHE_NS,
} from '@edushare/resources';
import {
  AppError,
  listResourcesQuerySchema,
  searchQuerySchema,
  shareEventSchema,
  suggestQuerySchema,
  trackEventSchema,
  RESOURCE_SORTS,
} from '@edushare/shared';
import { z } from 'zod';
import { expandNumberWords, normalizeQuery } from '@edushare/search';
import {
  CACHE_PUBLIC_LONG,
  CACHE_PUBLIC_SHORT,
  CACHE_NONE,
  jsonBody,
  parse,
  query,
  type AppEnv,
} from '../lib/http';
import { visitorMeta } from '../lib/visitor';
import { limiter } from '../middleware/rate-limit';
import type { Services } from '../services';

const landingQuerySchema = z.object({
  path: z.string().min(1).max(200),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
  sort: z.enum(RESOURCE_SORTS).default('newest'),
  term: z.string().max(40).optional(),
  year: z.coerce.number().int().optional(),
  fileType: z.string().max(10).optional(),
});

export function publicRoutes(services: Services) {
  const { ctx, redis, cache } = services;
  const app = new Hono<AppEnv>();
  const internal = (c: { req: { header: (n: string) => string | undefined } }) =>
    c.req.header('x-internal-secret') === services.env.REVALIDATE_SECRET;

  // Generous general limit; server-side rendering calls carry the internal secret and are exempt.
  app.use('*', async (c, next) => {
    if (internal(c)) return next();
    return limiter(redis, 'public', 300, 60)(c, next);
  });

  app.get('/home', async (c) => {
    c.header('Cache-Control', CACHE_PUBLIC_SHORT);
    return c.json(await getHome(ctx));
  });

  app.get('/taxonomy', async (c) => {
    c.header('Cache-Control', CACHE_PUBLIC_LONG);
    return c.json(await getPublicTaxonomy(ctx));
  });
  app.get('/classes', async (c) => {
    c.header('Cache-Control', CACHE_PUBLIC_LONG);
    return c.json({ items: (await getPublicTaxonomy(ctx)).levels });
  });
  app.get('/classes/:slug', async (c) => {
    const tax = await getPublicTaxonomy(ctx);
    const level = tax.levels.find((l) => l.classes.some((x) => x.slug === c.req.param('slug')));
    const cls = level?.classes.find((x) => x.slug === c.req.param('slug'));
    if (!cls || !level) throw AppError.notFound('Class');
    const subjects = await cache.wrap(
      PUBLIC_CACHE_NS,
      `class-subjects:${cls.id}`,
      300,
      async () => [...(await getClassSubjects(ctx, cls.id))],
    );
    c.header('Cache-Control', CACHE_PUBLIC_SHORT);
    return c.json({
      class: cls,
      level: { id: level.id, name: level.name, slug: level.slug },
      subjects,
    });
  });
  app.get('/subjects', async (c) => {
    c.header('Cache-Control', CACHE_PUBLIC_LONG);
    return c.json({ items: (await getPublicTaxonomy(ctx)).subjects });
  });
  app.get('/resource-types', async (c) => {
    c.header('Cache-Control', CACHE_PUBLIC_LONG);
    return c.json({ items: (await getPublicTaxonomy(ctx)).types });
  });
  app.get('/academic-years', async (c) => {
    c.header('Cache-Control', CACHE_PUBLIC_LONG);
    return c.json({ items: (await getPublicTaxonomy(ctx)).years });
  });
  app.get('/terms', async (c) => {
    c.header('Cache-Control', CACHE_PUBLIC_LONG);
    return c.json({ items: (await getPublicTaxonomy(ctx)).terms });
  });

  app.get('/settings/public', async (c) => {
    c.header('Cache-Control', CACHE_PUBLIC_LONG);
    return c.json({ site: await getSetting(ctx, 'site') });
  });

  app.get('/resources', async (c) => {
    const q = parse(listResourcesQuerySchema, query(c));
    c.header('Cache-Control', CACHE_PUBLIC_SHORT);
    return c.json(await listPublicResources(ctx, q));
  });

  app.get('/resources/by-ids', async (c) => {
    const ids = (c.req.query('ids') ?? '')
      .split(',')
      .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
      .slice(0, 50);
    c.header('Cache-Control', CACHE_PUBLIC_SHORT);
    return c.json({ items: await getCardsByIds(ctx, ids) });
  });

  app.get('/resources/:slug', async (c) => {
    const result = await getPublicResource(ctx, c.req.param('slug'));
    if (result.kind === 'not_found') throw AppError.notFound('Resource');
    if (result.kind === 'unavailable') {
      c.header('Cache-Control', CACHE_PUBLIC_SHORT);
      return c.json(
        {
          error: {
            code: 'FILE_MISSING',
            message: 'This resource is no longer available.',
            details: { title: result.title },
          },
        },
        410,
      );
    }
    c.header('Cache-Control', CACHE_PUBLIC_SHORT);
    if (result.kind === 'redirect') return c.json({ redirect: result.slug });
    return c.json({ resource: result.resource });
  });

  // Lightweight availability check used by the web proxy to answer 410 for removed resources.
  app.get('/resources/:slug/status', async (c) => {
    const row = await ctx.db.query.resources.findFirst({
      where: eq(resources.slug, c.req.param('slug')),
      columns: { status: true },
    });
    const status = !row
      ? 'missing'
      : row.status === 'published'
        ? 'published'
        : row.status === 'unpublished' || row.status === 'archived'
          ? 'gone'
          : 'missing';
    c.header('Cache-Control', 'public, max-age=30');
    return c.json({ status });
  });

  app.get('/resources/:slug/related', async (c) => {
    const result = await getPublicResource(ctx, c.req.param('slug'));
    if (result.kind !== 'found') throw AppError.notFound('Resource');
    c.header('Cache-Control', CACHE_PUBLIC_SHORT);
    return c.json({ groups: await getRelatedResources(ctx, result.resource, 6) });
  });

  app.get(
    '/search',
    async (c, next) => (internal(c) ? next() : limiter(redis, 'search', 60, 60)(c, next)),
    async (c) => {
      const q = parse(searchQuerySchema, query(c));
      c.header('Cache-Control', 'public, max-age=30, s-maxage=60');
      return c.json(await searchResources(ctx, q));
    },
  );

  app.get(
    '/search/suggest',
    async (c, next) => (internal(c) ? next() : limiter(redis, 'suggest', 120, 60)(c, next)),
    async (c) => {
      const q = parse(suggestQuerySchema, query(c));
      c.header('Cache-Control', 'public, max-age=300, s-maxage=600');
      return c.json({ items: await ctx.search.suggest(q.q, q.limit) });
    },
  );

  app.get('/landing', async (c) => {
    const q = parse(landingQuerySchema, query(c));
    const result = await getLanding(ctx, q.path, q);
    if (!result) throw AppError.notFound('Page');
    c.header('Cache-Control', CACHE_PUBLIC_SHORT);
    return c.json(result);
  });

  app.get('/collections', async (c) => {
    c.header('Cache-Control', CACHE_PUBLIC_SHORT);
    return c.json({ items: await listPublicCollections(ctx) });
  });
  app.get('/collections/:slug', async (c) => {
    const col = await getPublicCollection(ctx, c.req.param('slug'));
    if (!col) throw AppError.notFound('Collection');
    c.header('Cache-Control', CACHE_PUBLIC_SHORT);
    return c.json(col);
  });

  app.get('/seo/sitemap', async (c) => {
    c.header('Cache-Control', CACHE_PUBLIC_SHORT);
    return c.json({ items: await getSitemapIndex(ctx) });
  });
  app.get('/seo/sitemap/:name', async (c) => {
    const urls = await getSitemapUrls(ctx, c.req.param('name'));
    if (!urls) throw AppError.notFound('Sitemap');
    c.header('Cache-Control', CACHE_PUBLIC_SHORT);
    return c.json({ items: urls });
  });

  // ---------------------------------------------------------------- tracking

  app.post('/resources/:id/share', limiter(redis, 'share', 30, 60), async (c) => {
    const id = c.req.param('id');
    const body = parse(shareEventSchema, await jsonBody(c));
    const exists = await ctx.db.query.resources
      .findFirst({ where: eq(resources.id, id), columns: { id: true, status: true } })
      .catch(() => null);
    if (!exists || exists.status !== 'published') throw AppError.notFound('Resource');
    const counted = await recordShare({ db: ctx.db, redis }, id, body.channel, visitorMeta(c));
    c.header('Cache-Control', CACHE_NONE);
    return c.json({ ok: true, counted });
  });

  app.post('/events', limiter(redis, 'events', 120, 60), async (c) => {
    const body = parse(trackEventSchema, await jsonBody(c));
    const meta = visitorMeta(c);
    const deps = { db: ctx.db, redis };
    c.header('Cache-Control', CACHE_NONE);

    let resourceId = body.resourceId ?? null;
    if (!resourceId && body.slug) {
      const row = await ctx.db.query.resources.findFirst({
        where: eq(resources.slug, body.slug),
        columns: { id: true },
      });
      resourceId = row?.id ?? null;
    }
    if (resourceId) {
      const row = await ctx.db.query.resources.findFirst({
        where: eq(resources.id, resourceId),
        columns: { id: true, status: true },
      });
      if (!row || row.status !== 'published') resourceId = null;
    }

    switch (body.type) {
      case 'resource_view': {
        if (!resourceId) throw AppError.notFound('Resource');
        return c.json({ ok: true, counted: await recordView(deps, resourceId, meta) });
      }
      case 'search':
      case 'search_no_result': {
        const props = body.props ?? {};
        const q = String(props.q ?? '').slice(0, 200);
        const results = Number(props.results ?? 0);
        const { q: _q, results: _r, normalized: _n, ...filters } = props;
        const counted = await recordSearch(
          deps,
          {
            query: q,
            normalized: expandNumberWords(normalizeQuery(q)),
            resultsCount: Number.isFinite(results) ? results : 0,
            filters,
          },
          meta,
        );
        return c.json({ ok: true, counted });
      }
      case 'resource_share':
        return c.json({ ok: false, error: 'Use /resources/:id/share' }, 400);
      case 'resource_download':
        return c.json({ ok: false, error: 'Downloads are tracked server-side' }, 400);
      default:
        await recordEvent(deps, body.type, resourceId, body.props ?? {}, meta);
        return c.json({ ok: true, counted: !meta.bot });
    }
  });

  return app;
}
