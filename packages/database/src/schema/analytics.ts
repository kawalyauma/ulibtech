import { sql } from 'drizzle-orm';
import {
  bigserial,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
  varchar,
  boolean,
  text,
  inet,
} from 'drizzle-orm/pg-core';
import { admins } from './auth';
import { shareChannelEnum } from './enums';
import { resources } from './resources';

const eventColumns = {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  /** Daily-rotating salted hash; never a raw IP address. */
  visitorHash: varchar('visitor_hash', { length: 64 }),
  referrerHost: varchar('referrer_host', { length: 200 }),
  deviceType: varchar('device_type', { length: 12 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
};

export const resourceViews = pgTable(
  'resource_views',
  {
    ...eventColumns,
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
  },
  (t) => [
    index('resource_views_resource_created_idx').on(t.resourceId, t.createdAt),
    index('resource_views_created_idx').on(t.createdAt),
  ],
);

export const resourceDownloads = pgTable(
  'resource_downloads',
  {
    ...eventColumns,
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    fileId: uuid('file_id'),
  },
  (t) => [
    index('resource_downloads_resource_created_idx').on(t.resourceId, t.createdAt),
    index('resource_downloads_created_idx').on(t.createdAt),
  ],
);

export const resourceShares = pgTable(
  'resource_shares',
  {
    ...eventColumns,
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    channel: shareChannelEnum('channel').notNull(),
  },
  (t) => [
    index('resource_shares_resource_created_idx').on(t.resourceId, t.createdAt),
    index('resource_shares_created_idx').on(t.createdAt),
  ],
);

export const searchQueries = pgTable(
  'search_queries',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    query: varchar('query', { length: 200 }).notNull(),
    normalized: varchar('normalized', { length: 200 }).notNull(),
    resultsCount: integer('results_count').notNull(),
    filters: jsonb('filters').$type<Record<string, unknown>>().notNull().default({}),
    visitorHash: varchar('visitor_hash', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('search_queries_created_idx').on(t.createdAt),
    index('search_queries_normalized_idx').on(t.normalized),
    index('search_queries_normalized_trgm_idx').using('gin', sql`${t.normalized} gin_trgm_ops`),
  ],
);

/** Generic events not covered by the dedicated tables (filter_use, related_resource_click...). */
export const analyticsEvents = pgTable(
  'analytics_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    type: varchar('type', { length: 40 }).notNull(),
    resourceId: uuid('resource_id').references(() => resources.id, { onDelete: 'set null' }),
    props: jsonb('props').$type<Record<string, unknown>>().notNull().default({}),
    visitorHash: varchar('visitor_hash', { length: 64 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('analytics_events_type_created_idx').on(t.type, t.createdAt)],
);

/** Per-resource daily aggregates produced by the worker. */
export const resourceStatsDaily = pgTable(
  'resource_stats_daily',
  {
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    views: integer('views').notNull().default(0),
    downloads: integer('downloads').notNull().default(0),
    shares: integer('shares').notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.resourceId, t.day] }),
    index('resource_stats_daily_day_idx').on(t.day),
  ],
);

/** Site-wide daily metrics (views, downloads, searches, no-result searches, shares). */
export const siteStatsDaily = pgTable(
  'site_stats_daily',
  {
    day: date('day', { mode: 'string' }).notNull(),
    metric: varchar('metric', { length: 40 }).notNull(),
    value: integer('value').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.metric] })],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    adminId: uuid('admin_id').references(() => admins.id, { onDelete: 'set null' }),
    adminName: varchar('admin_name', { length: 120 }),
    action: varchar('action', { length: 60 }).notNull(),
    entityType: varchar('entity_type', { length: 40 }).notNull(),
    entityId: varchar('entity_id', { length: 64 }),
    entityLabel: varchar('entity_label', { length: 300 }),
    changes: jsonb('changes').$type<Record<string, unknown>>(),
    ipAddress: inet('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_logs_created_idx').on(t.createdAt),
    index('audit_logs_entity_idx').on(t.entityType, t.entityId),
  ],
);

export const seoMetadata = pgTable('seo_metadata', {
  id: uuid('id').primaryKey().defaultRandom(),
  path: varchar('path', { length: 300 }).notNull().unique(),
  title: varchar('title', { length: 70 }),
  description: varchar('description', { length: 170 }),
  intro: text('intro'),
  noindex: boolean('noindex').notNull().default(false),
  updatedById: uuid('updated_by_id').references(() => admins.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const siteSettings = pgTable('site_settings', {
  key: varchar('key', { length: 80 }).primaryKey(),
  value: jsonb('value').$type<unknown>().notNull(),
  updatedById: uuid('updated_by_id').references(() => admins.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
