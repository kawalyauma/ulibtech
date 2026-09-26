import { Hono } from 'hono';
import { and, desc, eq, sql, type SQL } from '@edushare/database';
import { adminRoles, admins, auditLogs, roles, seoMetadata } from '@edushare/database/schema';
import { destroyAdminSessions, hashPassword, loadAdminAccess } from '@edushare/auth';
import { getDashboardReport, aggregateAnalytics } from '@edushare/analytics';
import { getQueueHealth } from '@edushare/jobs';
import {
  afterContentChange,
  createTaxonomy,
  deleteCollection,
  deleteTaxonomy,
  getAdminCollection,
  getLanding,
  getSetting,
  isTaxonomyEntity,
  listAdminCollections,
  listTaxonomy,
  recordAudit,
  saveCollection,
  updateSetting,
  updateTaxonomy,
  PUBLIC_CACHE_NS,
} from '@edushare/resources';
import { AppError, adminCreateSchema, adminUpdateSchema, paginationSchema, seoMetadataInputSchema, PERMISSIONS } from '@edushare/shared';
import { z } from 'zod';
import { jsonBody, parse, query, type AppEnv } from '../../lib/http';
import { requirePermission } from '../../middleware/auth';
import type { Services } from '../../services';
import { actorOf } from './resources';

export function adminMiscRoutes(services: Services) {
  const { ctx, db } = services;
  const app = new Hono<AppEnv>();

  // ---------------------------------------------------------------- taxonomy
  app.get('/taxonomy/:entity', requirePermission('resources.read'), async (c) => {
    const entity = c.req.param('entity');
    if (!isTaxonomyEntity(entity)) throw AppError.notFound('Taxonomy');
    return c.json({ items: await listTaxonomy(ctx, entity) });
  });
  app.post('/taxonomy/:entity', requirePermission('taxonomy.manage'), async (c) => {
    const entity = c.req.param('entity');
    if (!isTaxonomyEntity(entity)) throw AppError.notFound('Taxonomy');
    try {
      return c.json(await createTaxonomy(ctx, actorOf(c), entity, await jsonBody(c)), 201);
    } catch (err) {
      if (err instanceof z.ZodError) throw zodToAppError(err);
      throw err;
    }
  });
  app.patch('/taxonomy/:entity/:id', requirePermission('taxonomy.manage'), async (c) => {
    const entity = c.req.param('entity');
    if (!isTaxonomyEntity(entity)) throw AppError.notFound('Taxonomy');
    try {
      return c.json(await updateTaxonomy(ctx, actorOf(c), entity, c.req.param('id'), await jsonBody(c)));
    } catch (err) {
      if (err instanceof z.ZodError) throw zodToAppError(err);
      throw err;
    }
  });
  app.delete('/taxonomy/:entity/:id', requirePermission('taxonomy.manage'), async (c) => {
    const entity = c.req.param('entity');
    if (!isTaxonomyEntity(entity)) throw AppError.notFound('Taxonomy');
    await deleteTaxonomy(ctx, actorOf(c), entity, c.req.param('id'));
    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------- collections
  app.get('/collections', requirePermission('resources.read'), async (c) => c.json({ items: await listAdminCollections(ctx) }));
  app.get('/collections/:id', requirePermission('resources.read'), async (c) => c.json(await getAdminCollection(ctx, c.req.param('id'))));
  app.post('/collections', requirePermission('collections.manage'), async (c) => {
    try {
      return c.json(await saveCollection(ctx, actorOf(c), null, await jsonBody(c)), 201);
    } catch (err) {
      if (err instanceof z.ZodError) throw zodToAppError(err);
      throw err;
    }
  });
  app.patch('/collections/:id', requirePermission('collections.manage'), async (c) => {
    try {
      return c.json(await saveCollection(ctx, actorOf(c), c.req.param('id'), await jsonBody(c)));
    } catch (err) {
      if (err instanceof z.ZodError) throw zodToAppError(err);
      throw err;
    }
  });
  app.delete('/collections/:id', requirePermission('collections.manage'), async (c) => {
    await deleteCollection(ctx, actorOf(c), c.req.param('id'));
    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------- SEO landing overrides
  app.get('/seo', requirePermission('seo.manage'), async (c) => c.json({ items: await db.select().from(seoMetadata).orderBy(seoMetadata.path) }));
  app.get('/seo/preview', requirePermission('seo.manage'), async (c) => {
    const path = c.req.query('path') ?? '';
    const result = await getLanding(ctx, path, { pageSize: 1 });
    if (!result) throw AppError.notFound('Landing page');
    return c.json({ landing: result.landing, total: result.resources.total });
  });
  app.put('/seo', requirePermission('seo.manage'), async (c) => {
    const input = parse(seoMetadataInputSchema, await jsonBody(c));
    const [row] = await db
      .insert(seoMetadata)
      .values({ ...input, updatedById: actorOf(c).id })
      .onConflictDoUpdate({ target: seoMetadata.path, set: { ...input, updatedById: actorOf(c).id, updatedAt: new Date() } })
      .returning();
    await recordAudit(ctx, actorOf(c), { action: 'seo.update', entityType: 'seo', entityId: row!.id, entityLabel: input.path, changes: input });
    await ctx.cache?.invalidate(PUBLIC_CACHE_NS);
    await afterContentChange(ctx, []);
    return c.json(row);
  });
  app.delete('/seo/:id', requirePermission('seo.manage'), async (c) => {
    const [row] = await db.delete(seoMetadata).where(eq(seoMetadata.id, c.req.param('id'))).returning();
    if (!row) throw AppError.notFound('SEO entry');
    await recordAudit(ctx, actorOf(c), { action: 'seo.delete', entityType: 'seo', entityId: row.id, entityLabel: row.path });
    await afterContentChange(ctx, []);
    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------- analytics
  app.get('/analytics/dashboard', requirePermission('analytics.read'), async (c) => {
    const days = parse(z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), query(c)).days;
    return c.json(await getDashboardReport(db, days));
  });
  app.post('/analytics/aggregate', requirePermission('analytics.read'), async (c) => {
    await aggregateAnalytics(db, 2);
    return c.json({ ok: true });
  });

  // ---------------------------------------------------------------- settings
  app.get('/settings/:key', requirePermission('resources.read'), async (c) => {
    const key = c.req.param('key');
    if (key !== 'site' && key !== 'homepage') throw AppError.notFound('Setting');
    return c.json(await getSetting(ctx, key));
  });
  app.put('/settings/:key', async (c) => {
    const key = c.req.param('key');
    if (key !== 'site' && key !== 'homepage') throw AppError.notFound('Setting');
    const perm = key === 'homepage' ? 'homepage.manage' : 'settings.manage';
    if (!c.get('admin')!.permissions.includes(perm)) throw AppError.forbidden();
    try {
      return c.json(await updateSetting(ctx, actorOf(c), key, await jsonBody(c)));
    } catch (err) {
      if (err instanceof z.ZodError) throw zodToAppError(err);
      throw err;
    }
  });

  // ---------------------------------------------------------------- administrators
  app.get('/roles', requirePermission('admins.manage'), async (c) => {
    const rows = await db.query.roles.findMany({ with: { permissions: { with: { permission: true } } } });
    return c.json({
      items: rows.map((r) => ({ id: r.id, key: r.key, name: r.name, description: r.description, permissions: r.permissions.map((p) => p.permission.key) })),
      permissions: PERMISSIONS,
    });
  });
  app.get('/admins', requirePermission('admins.manage'), async (c) => {
    const rows = await db.query.admins.findMany({ columns: { passwordHash: false }, with: { roles: { with: { role: true } } }, orderBy: [admins.name] });
    return c.json({
      items: rows.map((a) => ({ ...a, roles: a.roles.map((r) => r.role.key) })),
    });
  });
  const setRoles = async (adminId: string, keys: string[]) => {
    const roleRows = await db.select().from(roles);
    const ids = keys.map((k) => roleRows.find((r) => r.key === k)?.id).filter((x): x is string => Boolean(x));
    if (!ids.length) throw AppError.badRequest('Choose at least one valid role');
    await db.delete(adminRoles).where(eq(adminRoles.adminId, adminId));
    await db.insert(adminRoles).values(ids.map((roleId) => ({ adminId, roleId })));
  };
  app.post('/admins', requirePermission('admins.manage'), async (c) => {
    const input = parse(adminCreateSchema, await jsonBody(c));
    const exists = await db.query.admins.findFirst({ where: eq(admins.email, input.email) });
    if (exists) throw AppError.conflict('An administrator with that email already exists');
    const [row] = await db.insert(admins).values({ email: input.email, name: input.name, passwordHash: await hashPassword(input.password) }).returning({ id: admins.id });
    await setRoles(row!.id, input.roleKeys);
    await recordAudit(ctx, actorOf(c), { action: 'admin.create', entityType: 'admin', entityId: row!.id, entityLabel: input.email, changes: { roles: input.roleKeys } });
    return c.json({ id: row!.id }, 201);
  });
  app.patch('/admins/:id', requirePermission('admins.manage'), async (c) => {
    const id = c.req.param('id');
    const input = parse(adminUpdateSchema, await jsonBody(c));
    const me = actorOf(c);
    if (id === me.id && (input.isActive === false || (input.roleKeys && !input.roleKeys.includes('super_admin')))) {
      throw AppError.badRequest('You cannot deactivate yourself or remove your own super admin role.');
    }
    const set: Partial<typeof admins.$inferInsert> = {};
    if (input.name) set.name = input.name;
    if (input.isActive !== undefined) set.isActive = input.isActive;
    if (input.password) {
      set.passwordHash = await hashPassword(input.password);
      set.passwordChangedAt = new Date();
    }
    if (Object.keys(set).length) await db.update(admins).set(set).where(eq(admins.id, id));
    if (input.roleKeys) await setRoles(id, input.roleKeys);
    if (input.isActive === false || input.password) await destroyAdminSessions(db, id);
    await recordAudit(ctx, me, { action: 'admin.update', entityType: 'admin', entityId: id, changes: { ...input, password: input.password ? '[changed]' : undefined } });
    const access = await loadAdminAccess(db, id);
    return c.json({ ok: true, ...access });
  });

  // ---------------------------------------------------------------- audit log
  app.get('/audit', requirePermission('audit.read'), async (c) => {
    const q = parse(
      paginationSchema.extend({ entityType: z.string().max(40).optional(), entityId: z.string().max(64).optional(), action: z.string().max(60).optional() }),
      query(c),
    );
    const where: SQL[] = [];
    if (q.entityType) where.push(eq(auditLogs.entityType, q.entityType));
    if (q.entityId) where.push(eq(auditLogs.entityId, q.entityId));
    if (q.action) where.push(sql`${auditLogs.action} LIKE ${`${q.action.replace(/[%_]/g, '')}%`}`);
    const rows = await db
      .select({ log: auditLogs, total: sql<number>`count(*) OVER ()::int` })
      .from(auditLogs)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(auditLogs.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const total = rows[0]?.total ?? 0;
    return c.json({ items: rows.map((r) => r.log), page: q.page, pageSize: q.pageSize, total, totalPages: Math.max(1, Math.ceil(total / q.pageSize)) });
  });

  // ---------------------------------------------------------------- system
  app.get('/system/queues', requirePermission('settings.manage'), async (c) => {
    try {
      return c.json({ items: await getQueueHealth() });
    } catch {
      return c.json({ items: [], error: 'Queue backend unavailable' });
    }
  });
  app.post('/system/reindex', requirePermission('settings.manage'), async (c) => {
    await ctx.enqueue('rebuild-index', {});
    await recordAudit(ctx, actorOf(c), { action: 'system.reindex', entityType: 'system' });
    return c.json({ ok: true });
  });
  app.post('/system/check-files', requirePermission('settings.manage'), async (c) => {
    await ctx.enqueue('check-files', {});
    return c.json({ ok: true });
  });
  app.post('/system/refresh-sitemap', requirePermission('seo.manage'), async (c) => {
    await afterContentChange(ctx, []);
    return c.json({ ok: true });
  });

  return app;
}

function zodToAppError(err: z.ZodError): AppError {
  const fields: Record<string, string> = {};
  for (const i of err.issues) fields[i.path.join('.') || '_'] ??= i.message;
  return new AppError('VALIDATION_ERROR', 'Some fields are invalid', { fields });
}
