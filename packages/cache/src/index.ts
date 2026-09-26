import { Redis } from 'ioredis';

export { Redis };

const globalForRedis = globalThis as unknown as { __edushareRedis?: Redis };

export function createRedis(
  url = process.env.REDIS_URL ?? 'redis://localhost:6379',
  opts: { forQueue?: boolean } = {},
): Redis {
  return new Redis(url, {
    // BullMQ workers require maxRetriesPerRequest=null for blocking commands.
    maxRetriesPerRequest: opts.forQueue ? null : 2,
    enableOfflineQueue: true,
    lazyConnect: false,
    connectTimeout: 5000,
  });
}

export function getRedis(): Redis {
  if (!globalForRedis.__edushareRedis) {
    globalForRedis.__edushareRedis = createRedis();
    globalForRedis.__edushareRedis.on('error', (err: Error) => {
      console.error('[redis]', err.message);
    });
  }
  return globalForRedis.__edushareRedis;
}

export async function closeRedis(): Promise<void> {
  if (globalForRedis.__edushareRedis) {
    await globalForRedis.__edushareRedis.quit().catch(() => undefined);
    globalForRedis.__edushareRedis = undefined;
  }
}

const PREFIX = 'es:';

/**
 * JSON cache with namespace versioning. Invalidating a namespace bumps its version,
 * which makes every key in it unreachable without scanning.
 */
export class Cache {
  constructor(private readonly redis: Redis) {}

  private async nsVersion(ns: string): Promise<string> {
    const v = await this.redis.get(`${PREFIX}nsv:${ns}`);
    return v ?? '0';
  }

  private async key(ns: string, key: string) {
    return `${PREFIX}c:${ns}:${await this.nsVersion(ns)}:${key}`;
  }

  async get<T>(ns: string, key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(await this.key(ns, key));
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async set(ns: string, key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis.set(await this.key(ns, key), JSON.stringify(value), 'EX', ttlSeconds);
    } catch {
      // Cache failures must never break requests.
    }
  }

  /** Returns a cached value or computes, stores and returns it. */
  async wrap<T>(ns: string, key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(ns, key);
    if (hit !== null) return hit;
    const value = await fn();
    await this.set(ns, key, value, ttlSeconds);
    return value;
  }

  async invalidate(...namespaces: string[]): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();
      for (const ns of namespaces) pipeline.incr(`${PREFIX}nsv:${ns}`);
      await pipeline.exec();
    } catch {
      // ignore
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetSeconds: number;
  limit: number;
}

/** Fixed-window rate limiter. Fails open if Redis is unavailable. */
export async function rateLimit(
  redis: Redis,
  bucket: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const windowId = Math.floor(Date.now() / 1000 / windowSeconds);
  const key = `${PREFIX}rl:${bucket}:${identifier}:${windowId}`;
  try {
    const results = await redis
      .multi()
      .incr(key)
      .expire(key, windowSeconds + 1)
      .exec();
    const count = Number(results?.[0]?.[1] ?? 0);
    const resetSeconds = windowSeconds - (Math.floor(Date.now() / 1000) % windowSeconds);
    return { allowed: count <= limit, remaining: Math.max(0, limit - count), resetSeconds, limit };
  } catch {
    return { allowed: true, remaining: limit, resetSeconds: windowSeconds, limit };
  }
}

/** Returns true the first time a key is seen within `ttlSeconds` (used for view de-duplication). */
export async function firstSeen(redis: Redis, key: string, ttlSeconds: number): Promise<boolean> {
  try {
    const res = await redis.set(`${PREFIX}seen:${key}`, '1', 'EX', ttlSeconds, 'NX');
    return res === 'OK';
  } catch {
    return true;
  }
}

/** Popularity counters in sorted sets, bucketed by UTC day. */
export async function bumpPopularity(
  redis: Redis,
  metric: 'view' | 'download' | 'share',
  resourceId: string,
): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const key = `${PREFIX}pop:${metric}:${day}`;
  try {
    await redis
      .multi()
      .zincrby(key, 1, resourceId)
      .expire(key, 60 * 60 * 24 * 10)
      .exec();
  } catch {
    // ignore
  }
}

export async function getPopularity(
  redis: Redis,
  metric: 'view' | 'download' | 'share',
  day: string,
  limit = 50,
): Promise<{ id: string; score: number }[]> {
  try {
    const raw = await redis.zrevrange(`${PREFIX}pop:${metric}:${day}`, 0, limit - 1, 'WITHSCORES');
    const out: { id: string; score: number }[] = [];
    for (let i = 0; i < raw.length; i += 2)
      out.push({ id: raw[i] ?? '', score: Number(raw[i + 1]) });
    return out;
  } catch {
    return [];
  }
}
