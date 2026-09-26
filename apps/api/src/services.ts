import { Cache, getRedis, type Redis } from '@edushare/cache';
import { getDb, type Database } from '@edushare/database';
import { enqueue } from '@edushare/jobs';
import type { ServiceContext } from '@edushare/resources';
import { createSearchProvider } from '@edushare/search';
import { getServerEnv, type ServerEnv } from '@edushare/shared';
import { getStorage } from '@edushare/storage';

export interface Services {
  env: ServerEnv;
  db: Database;
  redis: Redis;
  cache: Cache;
  ctx: ServiceContext;
}

/** Builds the production service graph. Tests may pass their own `Services`. */
export function createServices(overrides: Partial<Pick<ServiceContext, 'enqueue'>> = {}): Services {
  const env = getServerEnv();
  const { db } = getDb();
  const redis = getRedis();
  const cache = new Cache(redis);
  const ctx: ServiceContext = {
    db,
    storage: getStorage(),
    search: createSearchProvider(db, cache),
    cache,
    enqueue: overrides.enqueue ?? enqueue,
    mediaBaseUrl: '/media',
  };
  return { env, db, redis, cache, ctx };
}
