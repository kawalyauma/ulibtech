import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { admins } from './auth';
import { id, timestamps, tsvector } from './columns';
import { processingStatusEnum, resourceStatusEnum, scanStatusEnum } from './enums';
import {
  academicYears,
  classes,
  curricula,
  resourceTypes,
  subjects,
  subtopics,
  tags,
  terms,
  topics,
} from './taxonomy';

export interface ThumbnailVariantRecord {
  width: number;
  height: number;
  format: 'webp' | 'avif' | 'png';
  key: string;
}

export const mediaAssets = pgTable('media_assets', {
  id: id(),
  kind: varchar('kind', { length: 30 }).notNull(), // thumbnail | cover | og
  /** true when generated automatically from the resource file */
  generated: boolean('generated').notNull().default(true),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  variants: jsonb('variants').$type<ThumbnailVariantRecord[]>().notNull().default([]),
  alt: varchar('alt', { length: 300 }),
  ...timestamps,
});

export const resources = pgTable(
  'resources',
  {
    id: id(),
    title: varchar('title', { length: 200 }).notNull(),
    slug: varchar('slug', { length: 140 }).notNull(),
    description: text('description'),
    shortDescription: varchar('short_description', { length: 300 }),

    classId: uuid('class_id').references(() => classes.id, { onDelete: 'set null' }),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    resourceTypeId: uuid('resource_type_id').references(() => resourceTypes.id, {
      onDelete: 'set null',
    }),
    academicYearId: uuid('academic_year_id').references(() => academicYears.id, {
      onDelete: 'set null',
    }),
    termId: uuid('term_id').references(() => terms.id, { onDelete: 'set null' }),
    topicId: uuid('topic_id').references(() => topics.id, { onDelete: 'set null' }),
    subtopicId: uuid('subtopic_id').references(() => subtopics.id, { onDelete: 'set null' }),
    curriculumId: uuid('curriculum_id').references(() => curricula.id, { onDelete: 'set null' }),

    /** Free-text topic/subtopic for resources without a managed topic record. */
    topicText: varchar('topic_text', { length: 160 }),
    subtopicText: varchar('subtopic_text', { length: 160 }),
    country: varchar('country', { length: 2 }).notNull().default('UG'),

    author: varchar('author', { length: 160 }),
    publisher: varchar('publisher', { length: 160 }),
    keywords: text('keywords').array().notNull().default([]),

    fileId: uuid('file_id').references((): AnyPgColumn => resourceFiles.id, {
      onDelete: 'set null',
    }),
    thumbnailId: uuid('thumbnail_id').references(() => mediaAssets.id, { onDelete: 'set null' }),

    status: resourceStatusEnum('status').notNull().default('draft'),
    featured: boolean('featured').notNull().default(false),
    /** Classification/summary suggestions from rules and (optionally) AI, for admin review. */
    suggestions: jsonb('suggestions').$type<Record<string, unknown>>(),
    /** Publish automatically once background processing (incl. security scan) succeeds. */
    publishWhenReady: boolean('publish_when_ready').notNull().default(false),

    viewCount: integer('view_count').notNull().default(0),
    downloadCount: integer('download_count').notNull().default(0),
    shareCount: integer('share_count').notNull().default(0),
    trendingDay: doublePrecision('trending_day').notNull().default(0),
    trendingWeek: doublePrecision('trending_week').notNull().default(0),
    popularity: doublePrecision('popularity').notNull().default(0),

    seoTitle: varchar('seo_title', { length: 70 }),
    seoDescription: varchar('seo_description', { length: 170 }),
    canonicalUrl: varchar('canonical_url', { length: 500 }),

    /** Weighted full-text document maintained by the search provider. */
    searchVector: tsvector('search_vector'),
    /** Extracted document text, indexed separately so it can be down-weighted. */
    contentVector: tsvector('content_vector'),
    /** Compact lowercase text (title + taxonomy) used for trigram matching. */
    searchText: text('search_text'),
    indexedAt: timestamp('indexed_at', { withTimezone: true }),

    createdById: uuid('created_by_id').references(() => admins.id, { onDelete: 'set null' }),
    updatedById: uuid('updated_by_id').references(() => admins.id, { onDelete: 'set null' }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('resources_slug_uq').on(t.slug),
    index('resources_status_published_idx').on(t.status, t.publishedAt.desc()),
    index('resources_class_subject_type_idx').on(t.classId, t.subjectId, t.resourceTypeId),
    index('resources_subject_idx').on(t.subjectId),
    index('resources_type_idx').on(t.resourceTypeId),
    index('resources_year_idx').on(t.academicYearId),
    index('resources_topic_idx').on(t.topicId),
    index('resources_trending_week_idx').on(t.trendingWeek.desc()),
    index('resources_downloads_idx').on(t.downloadCount.desc()),
    index('resources_search_vector_idx').using('gin', t.searchVector),
    index('resources_content_vector_idx').using('gin', t.contentVector),
    index('resources_search_text_trgm_idx').using('gin', sql`${t.searchText} gin_trgm_ops`),
    index('resources_title_trgm_idx').using('gin', sql`lower(${t.title}) gin_trgm_ops`),
    index('resources_featured_idx')
      .on(t.featured)
      .where(sql`${t.featured} = true`),
  ],
);

export const resourceFiles = pgTable(
  'resource_files',
  {
    id: id(),
    resourceId: uuid('resource_id').references((): AnyPgColumn => resources.id, {
      onDelete: 'cascade',
    }),
    storageKey: varchar('storage_key', { length: 400 }).notNull().unique(),
    originalName: varchar('original_name', { length: 255 }).notNull(),
    kind: varchar('kind', { length: 10 }).notNull(), // pdf, docx, ...
    mimeType: varchar('mime_type', { length: 150 }).notNull(),
    extension: varchar('extension', { length: 10 }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    sha256: varchar('sha256', { length: 64 }).notNull(),
    pageCount: integer('page_count'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    extractedText: text('extracted_text'),
    /** PDF rendition of Office documents (storage key), used for previews and thumbnails. */
    previewKey: varchar('preview_key', { length: 400 }),
    /** True when the extracted text came from OCR. */
    ocrApplied: boolean('ocr_applied').notNull().default(false),
    processingStatus: processingStatusEnum('processing_status').notNull().default('pending'),
    processingError: text('processing_error'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    scanStatus: scanStatusEnum('scan_status').notNull().default('pending'),
    isMissing: boolean('is_missing').notNull().default(false),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    uploadedById: uuid('uploaded_by_id').references(() => admins.id, { onDelete: 'set null' }),
    ...timestamps,
  },
  (t) => [
    index('resource_files_resource_idx').on(t.resourceId),
    index('resource_files_sha_idx').on(t.sha256),
  ],
);

export const resourceVersions = pgTable(
  'resource_versions',
  {
    id: id(),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => resourceFiles.id, { onDelete: 'cascade' }),
    notes: varchar('notes', { length: 500 }),
    createdById: uuid('created_by_id').references(() => admins.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('resource_versions_uq').on(t.resourceId, t.versionNumber)],
);

export const resourceTags = pgTable(
  'resource_tags',
  {
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.resourceId, t.tagId] }),
    index('resource_tags_tag_idx').on(t.tagId),
  ],
);

export const collections = pgTable('collections', {
  id: id(),
  title: varchar('title', { length: 160 }).notNull(),
  slug: varchar('slug', { length: 160 }).notNull().unique(),
  description: text('description'),
  featured: boolean('featured').notNull().default(false),
  isPublished: boolean('is_published').notNull().default(false),
  coverId: uuid('cover_id').references(() => mediaAssets.id, { onDelete: 'set null' }),
  seoTitle: varchar('seo_title', { length: 70 }),
  seoDescription: varchar('seo_description', { length: 170 }),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});

export const collectionResources = pgTable(
  'collection_resources',
  {
    collectionId: uuid('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.resourceId] })],
);

/** Old slugs kept after a rename so shared links and search results keep working. */
export const resourceRedirects = pgTable('resource_redirects', {
  oldSlug: varchar('old_slug', { length: 140 }).primaryKey(),
  resourceId: uuid('resource_id')
    .notNull()
    .references(() => resources.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
