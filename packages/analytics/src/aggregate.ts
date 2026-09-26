import { sql, type Database } from '@edushare/database';

/**
 * Rebuilds daily aggregates for the last `days` days and recomputes popularity signals.
 * Idempotent: safe to run repeatedly (the worker runs it every 15 minutes).
 */
export async function aggregateAnalytics(db: Database, days = 2): Promise<void> {
  const since = sql`(current_date - ${days - 1}::int)`;
  await db.transaction(async (tx) => {
    await tx.execute(sql`DELETE FROM resource_stats_daily WHERE day >= ${since}`);
    await tx.execute(sql`
      INSERT INTO resource_stats_daily (resource_id, day, views, downloads, shares)
      SELECT resource_id, day, sum(v)::int, sum(d)::int, sum(s)::int FROM (
        SELECT resource_id, created_at::date AS day, count(*) AS v, 0 AS d, 0 AS s FROM resource_views WHERE created_at >= ${since} GROUP BY 1, 2
        UNION ALL
        SELECT resource_id, created_at::date, 0, count(*), 0 FROM resource_downloads WHERE created_at >= ${since} GROUP BY 1, 2
        UNION ALL
        SELECT resource_id, created_at::date, 0, 0, count(*) FROM resource_shares WHERE created_at >= ${since} GROUP BY 1, 2
      ) x GROUP BY resource_id, day`);

    await tx.execute(sql`DELETE FROM site_stats_daily WHERE day >= ${since}`);
    await tx.execute(sql`
      INSERT INTO site_stats_daily (day, metric, value)
      SELECT day, metric, value FROM (
        SELECT created_at::date AS day, 'views' AS metric, count(*)::int AS value FROM resource_views WHERE created_at >= ${since} GROUP BY 1
        UNION ALL SELECT created_at::date, 'downloads', count(*)::int FROM resource_downloads WHERE created_at >= ${since} GROUP BY 1
        UNION ALL SELECT created_at::date, 'shares', count(*)::int FROM resource_shares WHERE created_at >= ${since} GROUP BY 1
        UNION ALL SELECT created_at::date, 'searches', count(*)::int FROM search_queries WHERE created_at >= ${since} GROUP BY 1
        UNION ALL SELECT created_at::date, 'no_result_searches', count(*)::int FROM search_queries WHERE created_at >= ${since} AND results_count = 0 GROUP BY 1
        UNION ALL SELECT created_at::date, 'visitors', count(DISTINCT visitor_hash)::int FROM resource_views WHERE created_at >= ${since} GROUP BY 1
      ) m`);
  });
  await recomputePopularity(db);
}

/**
 * Popularity signals:
 * - trending_day: weighted activity in the last 24 hours
 * - trending_week: 7-day activity with exponential decay (half-life 2 days)
 * - popularity: long-term score blending lifetime totals (log-scaled) with recent activity
 * Downloads weigh 3x and shares 4x a view, because they express stronger intent.
 */
export async function recomputePopularity(db: Database): Promise<void> {
  await db.execute(sql`
    WITH day AS (
      SELECT resource_id, sum(w) AS score FROM (
        SELECT resource_id, 1.0 AS w FROM resource_views WHERE created_at > now() - interval '24 hours'
        UNION ALL SELECT resource_id, 3.0 FROM resource_downloads WHERE created_at > now() - interval '24 hours'
        UNION ALL SELECT resource_id, 4.0 FROM resource_shares WHERE created_at > now() - interval '24 hours'
      ) e GROUP BY resource_id
    ),
    week AS (
      SELECT resource_id,
        sum((views + 3 * downloads + 4 * shares) * power(0.5, (current_date - day) / 2.0)) AS score
      FROM resource_stats_daily WHERE day > current_date - 7 GROUP BY resource_id
    ),
    scores AS (
      SELECT r.id,
        coalesce(d.score, 0) AS trending_day,
        coalesce(w.score, 0) AS trending_week,
        ln(1 + r.view_count + 3 * r.download_count + 4 * r.share_count) + 0.5 * ln(1 + coalesce(w.score, 0)) AS popularity
      FROM resources r
      LEFT JOIN day d ON d.resource_id = r.id
      LEFT JOIN week w ON w.resource_id = r.id
    )
    UPDATE resources r SET trending_day = s.trending_day, trending_week = s.trending_week, popularity = s.popularity
    FROM scores s
    WHERE r.id = s.id AND (r.trending_day <> s.trending_day OR r.trending_week <> s.trending_week OR r.popularity <> s.popularity)`);
}

/** Removes raw events older than the retention window; aggregates are kept. */
export async function purgeRawEvents(db: Database, retentionDays = 400): Promise<void> {
  const cutoff = sql`now() - (${retentionDays}::int * interval '1 day')`;
  await db.execute(sql`DELETE FROM resource_views WHERE created_at < ${cutoff}`);
  await db.execute(sql`DELETE FROM resource_downloads WHERE created_at < ${cutoff}`);
  await db.execute(sql`DELETE FROM resource_shares WHERE created_at < ${cutoff}`);
  await db.execute(sql`DELETE FROM analytics_events WHERE created_at < ${cutoff}`);
  await db.execute(sql`DELETE FROM search_queries WHERE created_at < ${cutoff}`);
}
