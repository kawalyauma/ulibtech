import { sql } from '@edushare/database';
import { SITEMAP_PAGE_SIZE, type SitemapUrl } from '@edushare/seo';
import type { ServiceContext } from './context';

export type SitemapName = 'static' | 'classes' | 'subjects' | 'types' | 'landing' | 'topics' | 'collections' | `resources-${number}`;

export async function getSitemapIndex(ctx: ServiceContext): Promise<{ name: string; lastmod: string | null }[]> {
  const [row] = await ctx.db.execute<{ n: number; last: string | null }>(
    sql`SELECT count(*)::int AS n, max(updated_at)::text AS last FROM resources WHERE status = 'published'`,
  );
  const pages = Math.max(1, Math.ceil((row?.n ?? 0) / SITEMAP_PAGE_SIZE));
  const last = row?.last ?? null;
  return [
    { name: 'static', lastmod: last },
    { name: 'classes', lastmod: last },
    { name: 'subjects', lastmod: last },
    { name: 'types', lastmod: last },
    { name: 'landing', lastmod: last },
    { name: 'topics', lastmod: last },
    { name: 'collections', lastmod: last },
    ...Array.from({ length: pages }, (_, i) => ({ name: `resources-${i + 1}`, lastmod: last })),
  ];
}

/** Returns sitemap URLs as site-relative paths; the web app prefixes the origin. */
export async function getSitemapUrls(ctx: ServiceContext, name: string): Promise<SitemapUrl[] | null> {
  const db = ctx.db;
  if (name === 'static') {
    return [
      { loc: '/', changefreq: 'daily', priority: 1 },
      { loc: '/classes', changefreq: 'weekly', priority: 0.8 },
      { loc: '/subjects', changefreq: 'weekly', priority: 0.8 },
      { loc: '/collections', changefreq: 'weekly', priority: 0.6 },
      { loc: '/about', changefreq: 'yearly', priority: 0.3 },
    ];
  }
  if (name === 'classes') {
    const rows = await db.execute<{ slug: string; last: string | null }>(sql`
      SELECT c.slug, max(r.updated_at)::text AS last FROM classes c
      JOIN resources r ON r.class_id = c.id AND r.status = 'published' GROUP BY c.slug`);
    return rows.map((r) => ({ loc: `/classes/${r.slug}`, lastmod: r.last, changefreq: 'daily', priority: 0.8 }));
  }
  if (name === 'subjects') {
    const rows = await db.execute<{ slug: string; last: string | null }>(sql`
      SELECT s.slug, max(r.updated_at)::text AS last FROM subjects s
      JOIN resources r ON r.subject_id = s.id AND r.status = 'published' GROUP BY s.slug`);
    return rows.map((r) => ({ loc: `/subjects/${r.slug}`, lastmod: r.last, changefreq: 'daily', priority: 0.7 }));
  }
  if (name === 'types') {
    const rows = await db.execute<{ slug: string; last: string | null }>(sql`
      SELECT t.slug, max(r.updated_at)::text AS last FROM resource_types t
      JOIN resources r ON r.resource_type_id = t.id AND r.status = 'published' GROUP BY t.slug`);
    return rows.map((r) => ({ loc: `/${r.slug}`, lastmod: r.last, changefreq: 'daily', priority: 0.8 }));
  }
  if (name === 'landing') {
    const rows = await db.execute<{ c: string | null; s: string | null; t: string | null; y: number | null; last: string | null }>(sql`
      SELECT c.slug AS c, s.slug AS s, t.slug AS t, ay.year AS y, max(r.updated_at)::text AS last
      FROM resources r
      JOIN classes c ON c.id = r.class_id
      LEFT JOIN subjects s ON s.id = r.subject_id
      LEFT JOIN resource_types t ON t.id = r.resource_type_id
      LEFT JOIN academic_years ay ON ay.id = r.academic_year_id
      WHERE r.status = 'published'
      GROUP BY GROUPING SETS ((c.slug, s.slug), (c.slug, t.slug), (c.slug, s.slug, t.slug), (c.slug, s.slug, t.slug, ay.year))`);
    const urls: SitemapUrl[] = [];
    for (const r of rows) {
      if (!r.c) continue;
      let loc: string | null = null;
      if (r.s && r.t && r.y) loc = `/${r.c}/${r.s}/${r.t}/${r.y}`;
      else if (r.s && r.t && r.y === null) loc = `/${r.c}/${r.s}/${r.t}`;
      else if (r.s && !r.t) loc = `/${r.c}/${r.s}`;
      else if (!r.s && r.t) loc = `/${r.c}/${r.t}`;
      if (loc) urls.push({ loc, lastmod: r.last, changefreq: 'daily', priority: loc.split('/').length > 3 ? 0.6 : 0.7 });
    }
    return [...new Map(urls.map((u) => [u.loc, u])).values()];
  }
  if (name === 'topics') {
    const rows = await db.execute<{ slug: string; last: string | null }>(sql`
      SELECT t.slug, max(r.updated_at)::text AS last FROM topics t
      JOIN resources r ON r.topic_id = t.id AND r.status = 'published' GROUP BY t.slug`);
    return rows.map((r) => ({ loc: `/topics/${r.slug}`, lastmod: r.last, changefreq: 'weekly', priority: 0.5 }));
  }
  if (name === 'collections') {
    const rows = await db.execute<{ slug: string; last: string }>(sql`SELECT slug, updated_at::text AS last FROM collections WHERE is_published`);
    return rows.map((r) => ({ loc: `/collections/${r.slug}`, lastmod: r.last, changefreq: 'weekly', priority: 0.6 }));
  }
  const m = /^resources-(\d+)$/.exec(name);
  if (m) {
    const page = Number(m[1]);
    const rows = await db.execute<{ slug: string; last: string; thumb: string | null }>(sql`
      SELECT r.slug, r.updated_at::text AS last,
        (SELECT v->>'key' FROM jsonb_array_elements(ma.variants) v WHERE v->>'format' = 'webp' ORDER BY (v->>'width')::int DESC LIMIT 1) AS thumb
      FROM resources r LEFT JOIN media_assets ma ON ma.id = r.thumbnail_id
      WHERE r.status = 'published'
      ORDER BY r.published_at, r.id
      LIMIT ${SITEMAP_PAGE_SIZE} OFFSET ${(page - 1) * SITEMAP_PAGE_SIZE}`);
    return rows.map((r) => ({
      loc: `/resources/${r.slug}`,
      lastmod: r.last,
      changefreq: 'weekly',
      priority: 0.9,
      image: r.thumb ? `${ctx.mediaBaseUrl}/${r.thumb}` : null,
    }));
  }
  return null;
}
