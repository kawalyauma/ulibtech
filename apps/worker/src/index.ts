import { Worker, type Job } from 'bullmq';
import { Cache, closeRedis, createRedis, getRedis } from '@edushare/cache';
import { closeDb, getDb } from '@edushare/database';
import { closeQueues, enqueue, getQueue, QUEUES, type JobName } from '@edushare/jobs';
import type { ServiceContext } from '@edushare/resources';
import { createSearchProvider } from '@edushare/search';
import { getServerEnv } from '@edushare/shared';
import { getStorage } from '@edushare/storage';
import { createHandlers } from './handlers';

const env = getServerEnv();
const { db } = getDb();
const cache = new Cache(getRedis());
const ctx: ServiceContext = {
  db,
  storage: getStorage(),
  search: createSearchProvider(db, cache),
  cache,
  enqueue,
  mediaBaseUrl: (process.env.MEDIA_BASE_URL || '/media').replace(/\/$/, ''),
};
const handlers = createHandlers(ctx);

async function run(job: Job) {
  const handler = handlers[job.name as JobName] as
    ((data: unknown, job: Job) => Promise<unknown>) | undefined;
  if (!handler) throw new Error(`No handler for job ${job.name}`);
  const started = Date.now();
  const result = await handler(job.data, job);
  console.log(
    JSON.stringify({
      t: new Date().toISOString(),
      job: job.name,
      id: job.id,
      ms: Date.now() - started,
    }),
  );
  return result;
}

const concurrency: Record<string, number> = {
  [QUEUES.processing]: Number(process.env.WORKER_PROCESSING_CONCURRENCY ?? 2),
  [QUEUES.indexing]: 4,
  [QUEUES.maintenance]: 2,
};

const workers = Object.values(QUEUES).map(
  (name) =>
    new Worker(name, run, {
      connection: createRedis(env.REDIS_URL, { forQueue: true }),
      concurrency: concurrency[name] ?? 1,
    }),
);
for (const w of workers) {
  w.on('failed', (job, err) => {
    console.error(
      JSON.stringify({
        level: 'error',
        job: job?.name,
        id: job?.id,
        attempts: job?.attemptsMade,
        msg: err.message,
      }),
    );
  });
}

/** Repeatable maintenance schedule. */
async function schedule() {
  const maintenance = getQueue(QUEUES.maintenance);
  await maintenance.upsertJobScheduler(
    'aggregate-analytics',
    { every: 15 * 60_000 },
    { name: 'aggregate-analytics', data: { days: 2 } },
  );
  await maintenance.upsertJobScheduler(
    'aggregate-analytics-daily',
    { pattern: '15 1 * * *' },
    { name: 'aggregate-analytics', data: { days: 8 } },
  );
  await maintenance.upsertJobScheduler(
    'check-files',
    { pattern: '30 2 * * *' },
    { name: 'check-files', data: {} },
  );
  await maintenance.upsertJobScheduler(
    'cleanup-temporary',
    { every: 6 * 3_600_000 },
    { name: 'cleanup-temporary', data: { olderThanHours: 24 } },
  );
  // Monday 06:00: digest of searches that found nothing (what to upload next).
  await maintenance.upsertJobScheduler(
    'no-result-report',
    { pattern: '0 6 * * 1' },
    { name: 'no-result-report', data: { days: 7 } },
  );
  await maintenance.upsertJobScheduler(
    'refresh-sitemap',
    { every: 6 * 3_600_000 },
    { name: 'refresh-sitemap', data: {} },
  );
}

schedule()
  .then(() => console.log(`[worker] started (${workers.length} queues)`))
  .catch((err: unknown) => console.error('[worker] failed to register schedules', err));

async function shutdown(signal: string) {
  console.log(`[worker] ${signal} received, draining`);
  await Promise.allSettled(workers.map((w) => w.close()));
  await Promise.allSettled([closeQueues(), closeRedis(), closeDb()]);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
