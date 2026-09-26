import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { eq } from '@edushare/database';
import { admins } from '@edushare/database/schema';
import {
  createSession,
  destroyAdminSessions,
  destroySession,
  getDummyHash,
  hashPassword,
  loadAdminAccess,
  verifyPassword,
} from '@edushare/auth';
import { recordAudit } from '@edushare/resources';
import { AppError, loginSchema, passwordSchema, SESSION_COOKIE } from '@edushare/shared';
import { z } from 'zod';
import { clientIp, jsonBody, parse, type AppEnv } from '../../lib/http';
import { limiter } from '../../middleware/rate-limit';
import { csrfProtection, requireAdmin } from '../../middleware/auth';
import type { Services } from '../../services';

export function authRoutes(services: Services) {
  const app = new Hono<AppEnv>();
  const { db, env, redis } = services;
  const cookieOpts = {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'Lax' as const,
    path: '/',
  };

  app.post('/login', limiter(redis, 'login-ip', 20, 900), async (c) => {
    const body = parse(loginSchema, await jsonBody(c));
    await limiter(redis, 'login-email', 8, 900, () => body.email)(c, async () => undefined);
    const admin = await db.query.admins.findFirst({ where: eq(admins.email, body.email) });
    // Always run a hash verification to avoid leaking which emails exist via timing.
    const ok = await verifyPassword(admin?.passwordHash ?? (await getDummyHash()), body.password);
    if (!admin || !ok || !admin.isActive) {
      await recordAudit(services.ctx, null, {
        action: 'auth.login_failed',
        entityType: 'admin',
        entityLabel: body.email,
      });
      throw new AppError('UNAUTHENTICATED', 'Incorrect email or password.');
    }
    const session = await createSession(
      db,
      admin.id,
      { idleMinutes: env.SESSION_IDLE_MINUTES, absoluteHours: env.SESSION_ABSOLUTE_HOURS },
      { ip: clientIp(c), userAgent: c.req.header('user-agent') },
    );
    await db.update(admins).set({ lastLoginAt: new Date() }).where(eq(admins.id, admin.id));
    setCookie(c, SESSION_COOKIE, session.token, { ...cookieOpts, expires: session.expiresAt });
    const access = await loadAdminAccess(db, admin.id);
    await recordAudit(
      services.ctx,
      { id: admin.id, name: admin.name, ip: clientIp(c), permissions: [] },
      { action: 'auth.login', entityType: 'admin', entityId: admin.id, entityLabel: admin.email },
    );
    c.header('Cache-Control', 'no-store');
    return c.json({
      admin: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        ...access,
        csrfToken: session.csrfToken,
      },
    });
  });

  app.post('/logout', async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await destroySession(db, token);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ ok: true });
  });

  app.get('/me', requireAdmin(services), (c) => {
    const { sessionId: _s, ...admin } = c.get('admin')!;
    return c.json({ admin });
  });

  app.post('/password', requireAdmin(services), csrfProtection(services), async (c) => {
    const body = parse(
      z.object({ currentPassword: z.string().min(1).max(200), newPassword: passwordSchema }),
      await jsonBody(c),
    );
    const me = c.get('admin')!;
    const admin = await db.query.admins.findFirst({ where: eq(admins.id, me.id) });
    if (!admin || !(await verifyPassword(admin.passwordHash, body.currentPassword))) {
      throw new AppError('VALIDATION_ERROR', 'Current password is incorrect', {
        fields: { currentPassword: 'Current password is incorrect' },
      });
    }
    await db
      .update(admins)
      .set({ passwordHash: await hashPassword(body.newPassword), passwordChangedAt: new Date() })
      .where(eq(admins.id, me.id));
    await destroyAdminSessions(db, me.id);
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    await recordAudit(
      services.ctx,
      { id: me.id, name: me.name, ip: clientIp(c), permissions: [] },
      {
        action: 'auth.password_change',
        entityType: 'admin',
        entityId: me.id,
        entityLabel: me.email,
      },
    );
    return c.json({ ok: true, reauthenticate: true });
  });

  return app;
}
