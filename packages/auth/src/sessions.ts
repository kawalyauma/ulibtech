import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, gt, lt, or, type Database } from '@edushare/database';
import { adminRoles, adminSessions, admins, permissions, rolePermissions, roles } from '@edushare/database/schema';
import type { AdminSessionInfo } from '@edushare/shared';

export interface SessionConfig {
  idleMinutes: number;
  absoluteHours: number;
}

export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export async function createSession(
  db: Database,
  adminId: string,
  config: SessionConfig,
  meta: { ip?: string | null; userAgent?: string | null },
): Promise<{ token: string; csrfToken: string; expiresAt: Date }> {
  const token = generateToken();
  const csrfToken = generateToken(24);
  const now = Date.now();
  const idleExpiresAt = new Date(now + config.idleMinutes * 60_000);
  const absoluteExpiresAt = new Date(now + config.absoluteHours * 3_600_000);
  await db.insert(adminSessions).values({
    id: hashToken(token),
    adminId,
    csrfToken,
    ipAddress: meta.ip ?? null,
    userAgent: meta.userAgent?.slice(0, 300) ?? null,
    idleExpiresAt,
    absoluteExpiresAt,
  });
  return { token, csrfToken, expiresAt: absoluteExpiresAt };
}

export async function loadAdminAccess(db: Database, adminId: string): Promise<{ roles: string[]; permissions: string[] }> {
  const rows = await db
    .select({ role: roles.key, permission: permissions.key })
    .from(adminRoles)
    .innerJoin(roles, eq(roles.id, adminRoles.roleId))
    .leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
    .leftJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(eq(adminRoles.adminId, adminId));
  return {
    roles: [...new Set(rows.map((r) => r.role))],
    permissions: [...new Set(rows.map((r) => r.permission).filter((p): p is string => Boolean(p)))],
  };
}

/** Validates a session token, extends its idle window and returns the admin. */
export async function validateSession(
  db: Database,
  token: string,
  config: SessionConfig,
): Promise<(AdminSessionInfo & { sessionId: string }) | null> {
  if (!token || token.length > 100) return null;
  const id = hashToken(token);
  const now = new Date();
  const [row] = await db
    .select({ session: adminSessions, admin: admins })
    .from(adminSessions)
    .innerJoin(admins, eq(admins.id, adminSessions.adminId))
    .where(
      and(eq(adminSessions.id, id), gt(adminSessions.idleExpiresAt, now), gt(adminSessions.absoluteExpiresAt, now)),
    )
    .limit(1);
  if (!row || !row.admin.isActive) return null;

  // Sessions issued before a password change are invalid.
  if (row.admin.passwordChangedAt && row.admin.passwordChangedAt > row.session.createdAt) {
    await db.delete(adminSessions).where(eq(adminSessions.id, id));
    return null;
  }

  // Throttle writes: only extend idle expiry once a minute.
  if (now.getTime() - row.session.lastSeenAt.getTime() > 60_000) {
    await db
      .update(adminSessions)
      .set({ lastSeenAt: now, idleExpiresAt: new Date(now.getTime() + config.idleMinutes * 60_000) })
      .where(eq(adminSessions.id, id));
  }
  const access = await loadAdminAccess(db, row.admin.id);
  return {
    sessionId: id,
    id: row.admin.id,
    email: row.admin.email,
    name: row.admin.name,
    roles: access.roles,
    permissions: access.permissions,
    csrfToken: row.session.csrfToken,
  };
}

export async function destroySession(db: Database, token: string): Promise<void> {
  await db.delete(adminSessions).where(eq(adminSessions.id, hashToken(token)));
}

export async function destroyAdminSessions(db: Database, adminId: string): Promise<void> {
  await db.delete(adminSessions).where(eq(adminSessions.adminId, adminId));
}

export async function purgeExpiredSessions(db: Database): Promise<void> {
  const now = new Date();
  await db
    .delete(adminSessions)
    .where(or(lt(adminSessions.idleExpiresAt, now), lt(adminSessions.absoluteExpiresAt, now)));
}
