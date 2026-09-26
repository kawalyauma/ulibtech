import type { Cache } from '@edushare/cache';
import type { Database } from '@edushare/database';
import type { JobName, JobPayloads } from '@edushare/jobs';
import type { SearchProvider } from '@edushare/search';
import type { StorageProvider } from '@edushare/storage';

export type Enqueue = <N extends JobName>(name: N, data: JobPayloads[N], opts?: { delay?: number; jobId?: string }) => Promise<boolean>;

export interface ServiceContext {
  db: Database;
  storage: StorageProvider;
  search: SearchProvider;
  cache?: Cache;
  enqueue: Enqueue;
  /** Public URL prefix under which the thumbnails bucket is served (e.g. `/media`). */
  mediaBaseUrl: string;
}

export interface Actor {
  id: string;
  name: string;
  ip?: string | null;
  permissions: string[];
}

/** Cache namespaces used for public API responses. */
export const PUBLIC_CACHE_NS = 'public';
