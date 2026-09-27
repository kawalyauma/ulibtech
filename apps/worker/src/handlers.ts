import type { Job } from 'bullmq';
import { aggregateAnalytics, purgeRawEvents } from '@edushare/analytics';
import { purgeExpiredSessions } from '@edushare/auth';
import type { JobName, JobPayloads } from '@edushare/jobs';
import { getNotifier } from '@edushare/notifications';
import {
  checkFiles,
  enrichResource,
  noResultReport,
  processFile,
  runZipImport,
  type ServiceContext,
} from '@edushare/resources';
import { getRedis } from '@edushare/cache';
import { getServerEnv } from '@edushare/shared';

type Handler<N extends JobName> = (data: JobPayloads[N], job: Job) => Promise<unknown>;

/** Calls the public Next.js site to revalidate cache tags (ISR on-demand revalidation). */
export async function revalidateWeb(tags: string[], paths: string[] = []): Promise<void> {
  const env = getServerEnv();
  const res = await fetch(`${env.WEB_INTERNAL_URL.replace(/\/$/, '')}/api/revalidate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-revalidate-secret': env.REVALIDATE_SECRET },
    body: JSON.stringify({ tags: [...new Set(tags)], paths }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Revalidation failed: HTTP ${res.status}`);
}

export function createHandlers(ctx: ServiceContext): { [N in JobName]: Handler<N> } {
  return {
    'process-file': async (data, job) => {
      try {
        return await processFile(ctx, data.fileId);
      } catch (err) {
        if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
          await getNotifier().notifyAdmins({
            subject: 'File processing failed',
            body: (err as Error).message,
            severity: 'error',
            meta: { fileId: data.fileId, resourceId: data.resourceId },
          });
        }
        throw err;
      }
    },
    'index-resource': async (data) => ctx.search.indexResource(data.resourceId),
    'remove-resource': async (data) => ctx.search.removeResource(data.resourceId),
    'rebuild-index': async () => ctx.search.rebuildIndex(),
    'revalidate-web': async (data) => revalidateWeb(data.tags, data.paths),
    'refresh-sitemap': async () => revalidateWeb(['sitemap']),
    'aggregate-analytics': async (data) => {
      await aggregateAnalytics(ctx.db, data.days ?? 2);
      await purgeExpiredSessions(ctx.db);
    },
    'check-files': async () => {
      const result = await checkFiles(ctx);
      if (result.missing > 0) {
        await getNotifier().notifyAdmins({
          subject: 'Broken files detected',
          body: `${result.missing} of ${result.checked} resource files are missing from storage.`,
          severity: 'warning',
        });
      }
      await purgeRawEvents(ctx.db, 400);
      return result;
    },
    'cleanup-temporary': async (data) => {
      const storage = ctx.storage;
      if (!storage.list) return { removed: 0 };
      const cutoff = Date.now() - (data.olderThanHours ?? 24) * 3_600_000;
      const items = await storage.list('temporary');
      let removed = 0;
      for (const item of items) {
        if (item.modifiedAt.getTime() < cutoff && !item.key.endsWith('.gitkeep')) {
          await storage.delete(item.key);
          removed++;
        }
      }
      return { removed };
    },
    'ai-enrich': async (data) => enrichResource(ctx, data.resourceId),
    'import-zip': async (data) => {
      const env = getServerEnv();
      const batch = await runZipImport(ctx, getRedis(), {
        batchId: data.batchId,
        tempKey: data.tempKey,
        actor: { id: data.actorId, name: data.actorName, permissions: [] },
        maxFileBytes: env.MAX_UPLOAD_MB * 1024 * 1024,
      });
      if (batch.status === 'failed' || batch.failed > 0) {
        await getNotifier().notifyAdmins({
          subject: `Zip import "${batch.fileName}" ${batch.status === 'failed' ? 'failed' : 'finished with errors'}`,
          body:
            batch.error ??
            `${batch.created} imported, ${batch.skipped} skipped, ${batch.failed} failed.`,
          severity: batch.status === 'failed' ? 'error' : 'warning',
          meta: { batchId: batch.id },
        });
      }
      return { created: batch.created, skipped: batch.skipped, failed: batch.failed };
    },
    'no-result-report': async (data) => {
      const report = await noResultReport(ctx, data.days ?? 7);
      if (report.items.length) {
        await getNotifier().notifyAdmins({
          subject: `Weekly report: ${report.items.length} searches found nothing`,
          body: report.items
            .slice(0, 20)
            .map((i) => `• "${i.query}" – ${i.count} searches`)
            .join('\n'),
          severity: 'info',
          meta: { days: report.days },
        });
      }
      return { items: report.items.length };
    },
    'delete-storage-objects': async (data) => {
      for (const key of data.keys) await ctx.storage.delete(key);
      return { deleted: data.keys.length };
    },
  };
}
