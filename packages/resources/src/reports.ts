import { sql } from '@edushare/database';
import { loadVocabulary } from '@edushare/search';
import type { ServiceContext } from './context';
import { landingPath } from './landing';

export interface NoResultItem {
  query: string;
  count: number;
  visitors: number;
  lastSearchedAt: string;
}

/** Searches that returned nothing — the best guide to what to upload next. */
export async function noResultReport(
  ctx: Pick<ServiceContext, 'db'>,
  days = 7,
): Promise<{ days: number; items: NoResultItem[] }> {
  const rows = await ctx.db.execute<{
    query: string;
    count: number;
    visitors: number;
    last: string;
  }>(sql`
    SELECT normalized AS query, count(*)::int AS count, count(DISTINCT visitor_hash)::int AS visitors, max(created_at)::text AS last
    FROM search_queries
    WHERE created_at > now() - (${days}::int * interval '1 day') AND results_count = 0 AND normalized <> ''
    GROUP BY normalized
    ORDER BY count(DISTINCT visitor_hash) DESC, count(*) DESC
    LIMIT 200`);
  return {
    days,
    items: rows.map((r) => ({
      query: r.query,
      count: r.count,
      visitors: r.visitors,
      lastSearchedAt: r.last,
    })),
  };
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]!);
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    // Prevent spreadsheet formula injection and quote as needed.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return (
    [headers.join(','), ...rows.map((r) => headers.map((h) => cell(r[h])).join(','))].join('\n') +
    '\n'
  );
}

export interface SeoSuggestion {
  path: string;
  heading: string;
  resources: number;
  searches: number;
  hasOverride: boolean;
  reason: string;
}

/**
 * Landing pages worth writing custom SEO text for, ranked by search demand and content.
 * Demand comes from the classes/subjects visitors searched for in the last 30 days.
 */
export async function seoSuggestions(
  ctx: Pick<ServiceContext, 'db'>,
  limit = 40,
): Promise<SeoSuggestion[]> {
  const v = await loadVocabulary(ctx.db);
  const [combos, demand, overrides] = await Promise.all([
    ctx.db.execute<{
      class_id: string | null;
      subject_id: string | null;
      resource_type_id: string | null;
      n: number;
    }>(sql`
      SELECT class_id, subject_id, resource_type_id, count(*)::int AS n FROM resources WHERE status = 'published'
      GROUP BY GROUPING SETS ((class_id, subject_id), (class_id, resource_type_id), (class_id, subject_id, resource_type_id), (resource_type_id), (class_id))`),
    ctx.db.execute<{ c: string | null; s: string | null; n: number }>(sql`
      SELECT coalesce(filters->>'class', filters->>'interpretedClass') AS c, coalesce(filters->>'subject', filters->>'interpretedSubject') AS s, count(*)::int AS n
      FROM search_queries WHERE created_at > now() - interval '30 days' GROUP BY 1, 2`),
    ctx.db.execute<{ path: string }>(sql`SELECT path FROM seo_metadata`),
  ]);
  const overridden = new Set(overrides.map((o) => o.path));
  const out: SeoSuggestion[] = [];
  for (const row of combos) {
    const c = v.classes.find((x) => x.id === row.class_id);
    const s = v.subjects.find((x) => x.id === row.subject_id);
    const t = v.types.find((x) => x.id === row.resource_type_id);
    if (!c && !t) continue;
    if (row.class_id && !c) continue;
    const path = landingPath({ class: c?.slug, subject: s?.slug, type: t?.slug });
    const searches = demand
      .filter((d) => (!c || d.c === c.slug) && (!s || d.s === s.slug) && (d.c || d.s))
      .reduce((n, d) => n + d.n, 0);
    const heading = [c?.label, s?.name, t?.label ?? (c && !s ? 'Resources' : null)]
      .filter(Boolean)
      .join(' ');
    out.push({
      path,
      heading,
      resources: row.n,
      searches,
      hasOverride: overridden.has(path),
      reason: searches > 0 ? `${searches} searches in 30 days` : `${row.n} published resources`,
    });
  }
  return [...new Map(out.map((o) => [o.path, o])).values()]
    .sort(
      (a, b) =>
        Number(a.hasOverride) - Number(b.hasOverride) ||
        b.searches - a.searches ||
        b.resources - a.resources,
    )
    .slice(0, limit);
}
