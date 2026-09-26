import { sql, type Database } from '@edushare/database';

export interface DashboardReport {
  today: { views: number; downloads: number; searches: number; shares: number; noResultSearches: number; visitors: number };
  totals: { resources: number; published: number; drafts: number; processing: number; failed: number };
  series: { day: string; views: number; downloads: number; searches: number; shares: number }[];
  topDownloaded: { id: string; title: string; slug: string; count: number }[];
  topViewed: { id: string; title: string; slug: string; count: number }[];
  topSearches: { query: string; count: number; avgResults: number }[];
  noResultSearches: { query: string; count: number; lastSearchedAt: string }[];
  topSubjects: { name: string; count: number }[];
  topClasses: { name: string; count: number }[];
  topTypes: { name: string; count: number }[];
  shareChannels: { channel: string; count: number }[];
  devices: { device: string; count: number }[];
}

/** Admin dashboard report. `days` controls the window used for "top" lists and the series. */
export async function getDashboardReport(db: Database, days = 30): Promise<DashboardReport> {
  const since = sql`now() - (${days}::int * interval '1 day')`;
  const [todayRows, totalsRows, seriesRows, topDl, topViews, topSearches, noResults, topSubjects, topClasses, topTypes, channels, devices] =
    await Promise.all([
      db.execute<Record<string, number>>(sql`
        SELECT
          (SELECT count(*)::int FROM resource_views WHERE created_at >= current_date) AS views,
          (SELECT count(*)::int FROM resource_downloads WHERE created_at >= current_date) AS downloads,
          (SELECT count(*)::int FROM search_queries WHERE created_at >= current_date) AS searches,
          (SELECT count(*)::int FROM resource_shares WHERE created_at >= current_date) AS shares,
          (SELECT count(*)::int FROM search_queries WHERE created_at >= current_date AND results_count = 0) AS no_results,
          (SELECT count(DISTINCT visitor_hash)::int FROM resource_views WHERE created_at >= current_date) AS visitors`),
      db.execute<Record<string, number>>(sql`
        SELECT count(*)::int AS resources,
          count(*) FILTER (WHERE r.status = 'published')::int AS published,
          count(*) FILTER (WHERE r.status IN ('draft', 'review'))::int AS drafts,
          count(*) FILTER (WHERE f.processing_status IN ('pending', 'processing'))::int AS processing,
          count(*) FILTER (WHERE f.processing_status = 'failed' OR f.is_missing)::int AS failed
        FROM resources r LEFT JOIN resource_files f ON f.id = r.file_id`),
      db.execute<{ day: string; views: number; downloads: number; searches: number; shares: number }>(sql`
        WITH days AS (SELECT generate_series(current_date - (${days - 1}::int), current_date, interval '1 day')::date AS day),
        live AS (
          SELECT current_date AS day,
            (SELECT count(*) FROM resource_views WHERE created_at >= current_date) AS views,
            (SELECT count(*) FROM resource_downloads WHERE created_at >= current_date) AS downloads,
            (SELECT count(*) FROM search_queries WHERE created_at >= current_date) AS searches,
            (SELECT count(*) FROM resource_shares WHERE created_at >= current_date) AS shares
        )
        SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
          CASE WHEN d.day = current_date THEN (SELECT views FROM live) ELSE coalesce(max(s.value) FILTER (WHERE s.metric = 'views'), 0) END::int AS views,
          CASE WHEN d.day = current_date THEN (SELECT downloads FROM live) ELSE coalesce(max(s.value) FILTER (WHERE s.metric = 'downloads'), 0) END::int AS downloads,
          CASE WHEN d.day = current_date THEN (SELECT searches FROM live) ELSE coalesce(max(s.value) FILTER (WHERE s.metric = 'searches'), 0) END::int AS searches,
          CASE WHEN d.day = current_date THEN (SELECT shares FROM live) ELSE coalesce(max(s.value) FILTER (WHERE s.metric = 'shares'), 0) END::int AS shares
        FROM days d LEFT JOIN site_stats_daily s ON s.day = d.day
        GROUP BY d.day ORDER BY d.day`),
      db.execute<{ id: string; title: string; slug: string; count: number }>(sql`
        SELECT r.id, r.title, r.slug, count(*)::int AS count FROM resource_downloads e JOIN resources r ON r.id = e.resource_id
        WHERE e.created_at >= ${since} GROUP BY r.id ORDER BY count DESC LIMIT 10`),
      db.execute<{ id: string; title: string; slug: string; count: number }>(sql`
        SELECT r.id, r.title, r.slug, count(*)::int AS count FROM resource_views e JOIN resources r ON r.id = e.resource_id
        WHERE e.created_at >= ${since} GROUP BY r.id ORDER BY count DESC LIMIT 10`),
      db.execute<{ query: string; count: number; avgResults: number }>(sql`
        SELECT normalized AS query, count(*)::int AS count, round(avg(results_count))::int AS "avgResults"
        FROM search_queries WHERE created_at >= ${since} AND normalized <> '' GROUP BY normalized ORDER BY count DESC LIMIT 15`),
      db.execute<{ query: string; count: number; lastSearchedAt: string }>(sql`
        SELECT normalized AS query, count(*)::int AS count, max(created_at)::text AS "lastSearchedAt"
        FROM search_queries WHERE created_at >= ${since} AND results_count = 0 AND normalized <> ''
        GROUP BY normalized ORDER BY count DESC, max(created_at) DESC LIMIT 20`),
      db.execute<{ name: string; count: number }>(sql`
        SELECT s.name, count(*)::int AS count FROM search_queries q JOIN subjects s ON s.slug = coalesce(q.filters->>'subject', q.filters->'interpreted'->>'subject')
        WHERE q.created_at >= ${since} GROUP BY s.name ORDER BY count DESC LIMIT 10`),
      db.execute<{ name: string; count: number }>(sql`
        SELECT coalesce(c.short_name, c.name) AS name, count(*)::int AS count FROM search_queries q JOIN classes c ON c.slug = coalesce(q.filters->>'class', q.filters->'interpreted'->>'class')
        WHERE q.created_at >= ${since} GROUP BY c.id ORDER BY count DESC LIMIT 10`),
      db.execute<{ name: string; count: number }>(sql`
        SELECT t.plural_name AS name, count(*)::int AS count FROM resource_downloads e JOIN resources r ON r.id = e.resource_id JOIN resource_types t ON t.id = r.resource_type_id
        WHERE e.created_at >= ${since} GROUP BY t.id ORDER BY count DESC LIMIT 10`),
      db.execute<{ channel: string; count: number }>(sql`
        SELECT channel::text, count(*)::int AS count FROM resource_shares WHERE created_at >= ${since} GROUP BY channel ORDER BY count DESC`),
      db.execute<{ device: string; count: number }>(sql`
        SELECT coalesce(device_type, 'unknown') AS device, count(*)::int AS count FROM resource_views WHERE created_at >= ${since} GROUP BY 1 ORDER BY count DESC`),
    ]);

  const t = todayRows[0] ?? {};
  const tot = totalsRows[0] ?? {};
  return {
    today: {
      views: t.views ?? 0,
      downloads: t.downloads ?? 0,
      searches: t.searches ?? 0,
      shares: t.shares ?? 0,
      noResultSearches: t.no_results ?? 0,
      visitors: t.visitors ?? 0,
    },
    totals: {
      resources: tot.resources ?? 0,
      published: tot.published ?? 0,
      drafts: tot.drafts ?? 0,
      processing: tot.processing ?? 0,
      failed: tot.failed ?? 0,
    },
    series: [...seriesRows],
    topDownloaded: [...topDl],
    topViewed: [...topViews],
    topSearches: [...topSearches],
    noResultSearches: [...noResults],
    topSubjects: [...topSubjects],
    topClasses: [...topClasses],
    topTypes: [...topTypes],
    shareChannels: [...channels],
    devices: [...devices],
  };
}

export async function getResourceStats(db: Database, resourceId: string, days = 30) {
  return db.execute<{ day: string; views: number; downloads: number; shares: number }>(sql`
    WITH days AS (SELECT generate_series(current_date - (${days - 1}::int), current_date, interval '1 day')::date AS day)
    SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
      coalesce(s.views, 0)::int AS views, coalesce(s.downloads, 0)::int AS downloads, coalesce(s.shares, 0)::int AS shares
    FROM days d LEFT JOIN resource_stats_daily s ON s.day = d.day AND s.resource_id = ${resourceId}
    ORDER BY d.day`);
}

/** Trending searches for the public homepage (queries that returned results). */
export async function getTrendingSearches(db: Database, limit = 8): Promise<string[]> {
  const rows = await db.execute<{ q: string }>(sql`
    SELECT normalized AS q FROM search_queries
    WHERE created_at > now() - interval '7 days' AND results_count > 0 AND length(normalized) BETWEEN 3 AND 60
    GROUP BY normalized HAVING count(DISTINCT visitor_hash) >= 2
    ORDER BY count(DISTINCT visitor_hash) DESC LIMIT ${limit}`);
  return rows.map((r) => r.q);
}
