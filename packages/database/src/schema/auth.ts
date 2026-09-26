import { boolean, index, pgTable, primaryKey, text, timestamp, uuid, varchar, inet } from 'drizzle-orm/pg-core';
import { id, timestamps } from './columns';

export const admins = pgTable('admins', {
  id: id(),
  email: varchar('email', { length: 200 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  passwordHash: text('password_hash').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
  ...timestamps,
});

export const roles = pgTable('roles', {
  id: id(),
  key: varchar('key', { length: 60 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  description: text('description'),
  isSystem: boolean('is_system').notNull().default(false),
  ...timestamps,
});

export const permissions = pgTable('permissions', {
  id: id(),
  key: varchar('key', { length: 80 }).notNull().unique(),
  description: text('description'),
});

export const rolePermissions = pgTable(
  'role_permissions',
  {
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionId] })],
);

export const adminRoles = pgTable(
  'admin_roles',
  {
    adminId: uuid('admin_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.adminId, t.roleId] })],
);

export const adminSessions = pgTable(
  'admin_sessions',
  {
    /** SHA-256 of the opaque session token; the raw token only lives in the cookie. */
    id: varchar('id', { length: 64 }).primaryKey(),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'cascade' }),
    csrfToken: varchar('csrf_token', { length: 64 }).notNull(),
    ipAddress: inet('ip_address'),
    userAgent: varchar('user_agent', { length: 300 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    idleExpiresAt: timestamp('idle_expires_at', { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp('absolute_expires_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('admin_sessions_admin_idx').on(t.adminId)],
);
