import type { MiddlewareHandler } from 'hono';
import { randomUUID } from 'node:crypto';
import type { AppEnv } from '../lib/http';

/** Strict security headers for API responses (JSON, files). */
export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  const requestId = c.req.header('x-request-id')?.slice(0, 64) || randomUUID();
  c.set('requestId', requestId);
  await next();
  const h = c.res.headers;
  h.set('X-Request-Id', requestId);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('X-Frame-Options', 'SAMEORIGIN');
  h.set('Cross-Origin-Resource-Policy', 'same-site');
  if (!h.has('Content-Security-Policy')) {
    h.set('Content-Security-Policy', "default-src 'none'; frame-ancestors 'self'; base-uri 'none'");
  }
  if (process.env.COOKIE_SECURE === 'true') {
    h.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
};

/** Minimal structured access log. */
export const accessLog: MiddlewareHandler<AppEnv> = async (c, next) => {
  const start = performance.now();
  await next();
  if (process.env.NODE_ENV === 'test' || c.req.path === '/health') return;
  const ms = Math.round(performance.now() - start);
  console.log(
    JSON.stringify({ t: new Date().toISOString(), id: c.get('requestId'), m: c.req.method, p: c.req.path, s: c.res.status, ms }),
  );
};
