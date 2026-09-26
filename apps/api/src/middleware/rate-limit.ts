import type { MiddlewareHandler } from 'hono';
import { rateLimit, type Redis } from '@edushare/cache';
import { AppError } from '@edushare/shared';
import { clientIp, type AppContext, type AppEnv } from '../lib/http';

export function limiter(
  redis: Redis,
  bucket: string,
  limit: number,
  windowSeconds: number,
  key: (c: AppContext) => string = (c) => clientIp(c) ?? 'unknown',
): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (process.env.RATE_LIMIT_DISABLED === 'true') return next();
    const res = await rateLimit(redis, bucket, key(c), limit, windowSeconds);
    c.header('RateLimit-Limit', String(res.limit));
    c.header('RateLimit-Remaining', String(res.remaining));
    if (!res.allowed) {
      c.header('Retry-After', String(res.resetSeconds));
      throw new AppError('RATE_LIMITED', 'Too many requests. Please wait a moment and try again.');
    }
    await next();
  };
}
