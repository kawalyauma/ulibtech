import { bumpPopularity, firstSeen, type Redis } from '@edushare/cache';
import { sql, type Database } from '@edushare/database';
import {
  analyticsEvents,
  resourceDownloads,
  resourceShares,
  resourceViews,
  searchQueries,
} from '@edushare/database/schema';
import type { ShareChannel } from '@edushare/shared';

export interface VisitorMeta {
  visitorHash: string | null;
  deviceType: string | null;
  referrerHost: string | null;
  bot: boolean;
}

export interface AnalyticsDeps {
  db: Database;
  redis: Redis;
}

/** Records a resource page view (deduplicated per visitor for 30 minutes). */
export async function recordView(deps: AnalyticsDeps, resourceId: string, meta: VisitorMeta): Promise<boolean> {
  if (meta.bot) return false;
  const fresh = await firstSeen(deps.redis, `view:${resourceId}:${meta.visitorHash ?? 'anon'}`, 1800);
  if (!fresh) return false;
  await deps.db.transaction(async (tx) => {
    await tx.insert(resourceViews).values({
      resourceId,
      visitorHash: meta.visitorHash,
      deviceType: meta.deviceType,
      referrerHost: meta.referrerHost,
    });
    await tx.execute(sql`UPDATE resources SET view_count = view_count + 1 WHERE id = ${resourceId}`);
  });
  await bumpPopularity(deps.redis, 'view', resourceId);
  return true;
}

/** Records a download. Repeated requests (retries, range requests) within 10 minutes count once. */
export async function recordDownload(
  deps: AnalyticsDeps,
  resourceId: string,
  fileId: string | null,
  meta: VisitorMeta,
): Promise<boolean> {
  if (meta.bot) return false;
  const fresh = await firstSeen(deps.redis, `dl:${resourceId}:${meta.visitorHash ?? 'anon'}`, 600);
  if (!fresh) return false;
  await deps.db.transaction(async (tx) => {
    await tx.insert(resourceDownloads).values({
      resourceId,
      fileId,
      visitorHash: meta.visitorHash,
      deviceType: meta.deviceType,
      referrerHost: meta.referrerHost,
    });
    await tx.execute(sql`UPDATE resources SET download_count = download_count + 1 WHERE id = ${resourceId}`);
  });
  await bumpPopularity(deps.redis, 'download', resourceId);
  return true;
}

export async function recordShare(
  deps: AnalyticsDeps,
  resourceId: string,
  channel: ShareChannel,
  meta: VisitorMeta,
): Promise<boolean> {
  if (meta.bot) return false;
  const fresh = await firstSeen(deps.redis, `share:${resourceId}:${channel}:${meta.visitorHash ?? 'anon'}`, 60);
  if (!fresh) return false;
  await deps.db.transaction(async (tx) => {
    await tx.insert(resourceShares).values({
      resourceId,
      channel,
      visitorHash: meta.visitorHash,
      deviceType: meta.deviceType,
      referrerHost: meta.referrerHost,
    });
    await tx.execute(sql`UPDATE resources SET share_count = share_count + 1 WHERE id = ${resourceId}`);
  });
  await bumpPopularity(deps.redis, 'share', resourceId);
  return true;
}

/** Stores a search query. The same query from the same visitor is only logged once per 5 minutes. */
export async function recordSearch(
  deps: AnalyticsDeps,
  input: { query: string; normalized: string; resultsCount: number; filters: Record<string, unknown> },
  meta: VisitorMeta,
): Promise<boolean> {
  if (meta.bot) return false;
  const query = input.query.trim().slice(0, 200);
  if (!query && Object.keys(input.filters).length === 0) return false;
  const fresh = await firstSeen(deps.redis, `search:${meta.visitorHash ?? 'anon'}:${input.normalized}:${JSON.stringify(input.filters)}`, 300);
  if (!fresh) return false;
  await deps.db.insert(searchQueries).values({
    query,
    normalized: input.normalized.slice(0, 200),
    resultsCount: input.resultsCount,
    filters: input.filters,
    visitorHash: meta.visitorHash,
  });
  return true;
}

export async function recordEvent(
  deps: AnalyticsDeps,
  type: string,
  resourceId: string | null,
  props: Record<string, unknown>,
  meta: VisitorMeta,
): Promise<void> {
  if (meta.bot) return;
  await deps.db.insert(analyticsEvents).values({ type, resourceId, props, visitorHash: meta.visitorHash });
}
