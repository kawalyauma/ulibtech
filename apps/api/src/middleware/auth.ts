import type { MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';
import { hasPermission, safeEqual, validateSession } from '@edushare/auth';
import { AppError, CSRF_HEADER, SESSION_COOKIE, type Permission } from '@edushare/shared';
import type { AppEnv } from '../lib/http';
import type { Services } from '../services';

/** Loads the admin session from the HttpOnly cookie. Rejects unauthenticated requests. */
export function requireAdmin(services: Services): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (!token) throw AppError.unauthenticated();
    const session = await validateSession(services.db, token, {
      idleMinutes: services.env.SESSION_IDLE_MINUTES,
      absoluteHours: services.env.SESSION_ABSOLUTE_HOURS,
    });
    if (!session) throw AppError.unauthenticated('Your session has expired. Please sign in again.');
    c.set('admin', session);
    c.header('Cache-Control', 'no-store');
    await next();
  };
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection for cookie-authenticated admin requests: a per-session token must be sent
 * in the X-CSRF-Token header, and the Origin (when present) must be an allowed admin origin.
 */
export function csrfProtection(services: Services): MiddlewareHandler<AppEnv> {
  const allowed = new Set(
    [...services.env.ADMIN_ALLOWED_ORIGINS.split(','), services.env.ADMIN_SITE_URL]
      .map((o) => o.trim().replace(/\/$/, ''))
      .filter(Boolean),
  );
  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) return next();
    const origin = c.req.header('origin');
    if (origin && !allowed.has(origin.replace(/\/$/, '')))
      throw AppError.forbidden('Request origin not allowed');
    const session = c.get('admin');
    const token = c.req.header(CSRF_HEADER);
    if (!session || !token || !safeEqual(token, session.csrfToken)) {
      throw AppError.forbidden('Invalid or missing CSRF token. Refresh the page and try again.');
    }
    await next();
  };
}

export function requirePermission(...permissions: Permission[]): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const admin = c.get('admin');
    if (!admin) throw AppError.unauthenticated();
    if (!hasPermission(admin.permissions, permissions)) throw AppError.forbidden();
    await next();
  };
}
