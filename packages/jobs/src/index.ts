import { Queue, type JobsOptions } from 'bullmq';
import { createRedis, type Redis } from '@edushare/cache';

/** Queue names. Kept small so priorities are easy to reason about. */
export const QUEUES = {
  processing: 'resource-processing',
  indexing: 'search-indexing',
  maintenance: 'maintenance',
  /** AI calls are slow (seconds to minutes), so they never block file processing. */
  ai: 'ai-enrichment',
  /** Zip imports unpack many files; one at a time keeps disk and memory use flat. */
  imports: 'zip-imports',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface JobPayloads {
  /** Extract text/metadata, scan and generate thumbnails for an uploaded file. */
  'process-file': { fileId: string; resourceId: string | null; reindex?: boolean };
  /** (Re)build the search document for a resource. */
  'index-resource': { resourceId: string };
  'remove-resource': { resourceId: string };
  'rebuild-index': Record<string, never>;
  /** Ask the public site to revalidate cached pages / sitemaps. */
  'revalidate-web': { tags: string[]; paths?: string[] };
  'aggregate-analytics': { days?: number };
  'check-files': Record<string, never>;
  'cleanup-temporary': { olderThanHours?: number };
  'delete-storage-objects': { keys: string[] };
  'refresh-sitemap': Record<string, never>;
  /** Optional Claude-powered summary and classification suggestions. */
  'ai-enrich': { resourceId: string };
  /** Weekly digest of searches that returned no results. */
  'no-result-report': { days?: number };
  /** Unpack an uploaded zip into draft resources (AI then classifies and publishes them). */
  'import-zip': { batchId: string; tempKey: string; actorId: string; actorName: string };
}
export type JobName = keyof JobPayloads;

export const JOB_QUEUE: Record<JobName, QueueName> = {
  'process-file': QUEUES.processing,
  'index-resource': QUEUES.indexing,
  'remove-resource': QUEUES.indexing,
  'rebuild-index': QUEUES.indexing,
  'revalidate-web': QUEUES.maintenance,
  'aggregate-analytics': QUEUES.maintenance,
  'check-files': QUEUES.maintenance,
  'cleanup-temporary': QUEUES.maintenance,
  'delete-storage-objects': QUEUES.maintenance,
  'refresh-sitemap': QUEUES.maintenance,
  'ai-enrich': QUEUES.ai,
  'no-result-report': QUEUES.maintenance,
  'import-zip': QUEUES.imports,
};

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 1000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

/**
 * Per-job overrides. AI enrichment calls an external provider that rate-limits bursts (a
 * large zip import queues thousands), so it retries patiently instead of failing fast.
 */
const JOB_OPTIONS: Partial<Record<JobName, JobsOptions>> = {
  'ai-enrich': { attempts: 10, backoff: { type: 'exponential', delay: 60_000 } },
  'import-zip': { attempts: 3, backoff: { type: 'fixed', delay: 30_000 } },
};

let connection: Redis | undefined;
const queues = new Map<QueueName, Queue>();

export function getQueueConnection(): Redis {
  connection ??= createRedis(undefined, { forQueue: true });
  return connection;
}

export function getQueue(name: QueueName): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: getQueueConnection(), defaultJobOptions });
    queues.set(name, q);
  }
  return q;
}

/**
 * Enqueue a background job. Returns false (and logs) instead of throwing when Redis is
 * unavailable so that admin operations still succeed; maintenance jobs repair state later.
 */
export async function enqueue<N extends JobName>(
  name: N,
  data: JobPayloads[N],
  opts: JobsOptions = {},
): Promise<boolean> {
  try {
    await getQueue(JOB_QUEUE[name]).add(name, data, { ...JOB_OPTIONS[name], ...opts });
    return true;
  } catch (err) {
    console.error(`[jobs] failed to enqueue ${name}:`, (err as Error).message);
    return false;
  }
}

export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close().catch(() => undefined)));
  queues.clear();
  if (connection) {
    await connection.quit().catch(() => undefined);
    connection = undefined;
  }
}

export interface QueueHealth {
  name: string;
  waiting: number;
  active: number;
  failed: number;
  delayed: number;
  completed: number;
}

export async function getQueueHealth(): Promise<QueueHealth[]> {
  return Promise.all(
    Object.values(QUEUES).map(async (name) => {
      const counts = await getQueue(name).getJobCounts(
        'waiting',
        'active',
        'failed',
        'delayed',
        'completed',
      );
      return {
        name,
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
        completed: counts.completed ?? 0,
      };
    }),
  );
}
