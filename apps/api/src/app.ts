import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { sql } from '@edushare/database';
import { AppError, isAppError } from '@edushare/shared';
import { StorageKeyError } from '@edushare/storage';
import type { AppEnv } from './lib/http';
import { accessLog, securityHeaders } from './middleware/security';
import { csrfProtection, requireAdmin } from './middleware/auth';
import { limiter } from './middleware/rate-limit';
import { publicRoutes } from './modules/public';
import { fileRoutes } from './modules/files';
import { authRoutes } from './modules/admin/auth';
import { adminResourceRoutes } from './modules/admin/resources';
import { adminMiscRoutes } from './modules/admin/misc';
import type { Services } from './services';

export function createApp(services: Services) {
  const app = new Hono<AppEnv>();

  app.use('*', securityHeaders);
  app.use('*', accessLog);

  app.get('/health', async (c) => {
    const checks = { db: false, redis: false };
    try {
      await services.db.execute(sql`SELECT 1`);
      checks.db = true;
    } catch {
      /* reported below */
    }
    try {
      checks.redis = (await services.redis.ping()) === 'PONG';
    } catch {
      /* reported below */
    }
    const ok = checks.db && checks.redis;
    c.header('Cache-Control', 'no-store');
    return c.json({ ok, checks }, ok ? 200 : 503);
  });

  // JSON bodies are small; uploads use multipart streaming with their own limits.
  app.use('/api/*', async (c, next) => {
    const type = c.req.header('content-type') ?? '';
    if (type.startsWith('multipart/form-data')) return next();
    return bodyLimit({ maxSize: 256 * 1024, onError: () => { throw new AppError('PAYLOAD_TOO_LARGE', 'Request body too large'); } })(c, next);
  });

  app.route('/', fileRoutes(services));

  // Admin API (cookie session + CSRF). Never cached publicly.
  const admin = new Hono<AppEnv>();
  admin.use('*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'no-store');
    c.header('X-Robots-Tag', 'noindex, nofollow');
  });
  admin.route('/auth', authRoutes(services));
  admin.use('*', async (c, next) => (c.req.path.startsWith('/api/admin/auth/') ? next() : requireAdmin(services)(c, next)));
  admin.use('*', async (c, next) => (c.req.path.startsWith('/api/admin/auth/') ? next() : csrfProtection(services)(c, next)));
  admin.use('*', async (c, next) =>
    c.req.path.startsWith('/api/admin/auth/') ? next() : limiter(services.redis, 'admin', 600, 60, (cc) => cc.get('admin')?.id ?? 'anon')(c, next),
  );
  admin.route('/resources', adminResourceRoutes(services));
  admin.route('/', adminMiscRoutes(services));
  app.route('/api/admin', admin);

  app.route('/api', publicRoutes(services));

  app.notFound((c) => c.json({ error: { code: 'NOT_FOUND', message: 'Not found' } }, 404));

  app.onError((err, c) => {
    if (isAppError(err)) {
      return c.json({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } }, err.status as 400);
    }
    if (err instanceof StorageKeyError) {
      return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid file path' } }, 400);
    }
    const pgCode = (err as { code?: string }).code;
    if (pgCode === '22P02') return c.json({ error: { code: 'BAD_REQUEST', message: 'Invalid identifier' } }, 400);
    console.error(JSON.stringify({ level: 'error', id: c.get('requestId'), path: c.req.path, msg: err.message, stack: err.stack }));
    // Never expose internal error details to clients.
    return c.json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.' } }, 500);
  });

  return app;
}
