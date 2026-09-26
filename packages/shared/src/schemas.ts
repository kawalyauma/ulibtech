import { z } from 'zod';
import { RESOURCE_STATUSES, SHARE_CHANNELS, ANALYTICS_EVENT_TYPES } from './constants';

const emptyToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);
const optionalId = z.preprocess(emptyToUndefined, z.uuid().optional());
const optionalNullableId = z.preprocess(
  (v) => (v === '' ? null : v),
  z.uuid().nullable().optional(),
);
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? v.trim() : v),
    z.string().max(max).nullable().optional(),
  );
const stringList = z
  .preprocess(
    (v) => {
      if (typeof v === 'string') {
        return v
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }
      return v;
    },
    z.array(z.string().trim().min(1).max(60)).max(40),
  )
  .optional();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});
export type PaginationInput = z.infer<typeof paginationSchema>;

export const RESOURCE_SORTS = [
  'relevance',
  'newest',
  'oldest',
  'popular',
  'downloads',
  'trending_today',
  'trending_week',
  'title',
] as const;
export type ResourceSort = (typeof RESOURCE_SORTS)[number];

/** Filters shared by listing, landing pages and search. Values are slugs. */
export const resourceFilterSchema = z.object({
  class: z.preprocess(emptyToUndefined, z.string().max(40).optional()),
  subject: z.preprocess(emptyToUndefined, z.string().max(80).optional()),
  type: z.preprocess(emptyToUndefined, z.string().max(80).optional()),
  year: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1990).max(2100).optional()),
  term: z.preprocess(emptyToUndefined, z.string().max(40).optional()),
  fileType: z.preprocess(emptyToUndefined, z.string().max(10).optional()),
  topic: z.preprocess(emptyToUndefined, z.string().max(120).optional()),
  curriculum: z.preprocess(emptyToUndefined, z.string().max(80).optional()),
  level: z.preprocess(emptyToUndefined, z.string().max(40).optional()),
  collection: z.preprocess(emptyToUndefined, z.string().max(120).optional()),
  featured: z.preprocess(
    (v) => (v === 'true' ? true : v === 'false' ? false : emptyToUndefined(v)),
    z.boolean().optional(),
  ),
});
export type ResourceFilters = z.infer<typeof resourceFilterSchema>;

export const listResourcesQuerySchema = resourceFilterSchema.extend(paginationSchema.shape).extend({
  sort: z.enum(RESOURCE_SORTS).default('newest'),
  exclude: z.preprocess(emptyToUndefined, z.uuid().optional()),
});
export type ListResourcesQuery = z.infer<typeof listResourcesQuerySchema>;

export const searchQuerySchema = resourceFilterSchema.extend(paginationSchema.shape).extend({
  q: z.preprocess(
    (v) => (typeof v === 'string' ? v.slice(0, 200) : v),
    z.string().trim().default(''),
  ),
  sort: z.enum(RESOURCE_SORTS).default('relevance'),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;

export const suggestQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(15).default(8),
});

export const loginSchema = z.object({
  email: z
    .email()
    .max(200)
    .transform((e) => e.toLowerCase()),
  password: z.string().min(1).max(200),
});

export const passwordSchema = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(200)
  .refine((p) => /[a-z]/i.test(p) && /\d/.test(p), 'Include letters and numbers');

export const resourceMetadataSchema = z.object({
  title: z.string().trim().min(3, 'Title is too short').max(200),
  slug: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .max(120)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens')
      .optional(),
  ),
  description: optionalText(10_000),
  shortDescription: optionalText(300),
  classId: optionalNullableId,
  subjectId: optionalNullableId,
  resourceTypeId: optionalNullableId,
  academicYearId: optionalNullableId,
  termId: optionalNullableId,
  topicId: optionalNullableId,
  subtopicId: optionalNullableId,
  curriculumId: optionalNullableId,
  topic: optionalText(160),
  subtopic: optionalText(160),
  author: optionalText(160),
  publisher: optionalText(160),
  keywords: stringList,
  tags: stringList,
  featured: z.preprocess((v) => v === 'true' || v === true, z.boolean()).optional(),
  seoTitle: optionalText(70),
  seoDescription: optionalText(170),
  canonicalUrl: z.preprocess(emptyToUndefined, z.url().max(500).nullable().optional()),
  status: z.enum(['draft', 'review', 'published']).optional(),
});
export type ResourceMetadataInput = z.infer<typeof resourceMetadataSchema>;

export const resourceUpdateSchema = resourceMetadataSchema.partial();
export type ResourceUpdateInput = z.infer<typeof resourceUpdateSchema>;

export const adminResourceListSchema = paginationSchema.extend({
  q: z.string().trim().max(200).optional(),
  status: z.preprocess(emptyToUndefined, z.enum(RESOURCE_STATUSES).optional()),
  classId: optionalId,
  subjectId: optionalId,
  resourceTypeId: optionalId,
  sort: z.enum(['newest', 'updated', 'title', 'downloads', 'views']).default('updated'),
});

export const bulkActionSchema = z.object({
  ids: z.array(z.uuid()).min(1).max(200),
  action: z.enum(['publish', 'unpublish', 'archive', 'delete', 'feature', 'unfeature']),
});

export const shareEventSchema = z.object({
  channel: z.enum(SHARE_CHANNELS),
});

export const trackEventSchema = z.object({
  type: z.enum(ANALYTICS_EVENT_TYPES),
  resourceId: z.uuid().optional(),
  slug: z.string().max(160).optional(),
  props: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
});

// ---------- Taxonomy ----------
const slugField = z.preprocess(
  emptyToUndefined,
  z
    .string()
    .trim()
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens')
    .optional(),
);

export const schoolLevelInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slugField,
  sortOrder: z.coerce.number().int().default(0),
});

export const classInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
  shortName: optionalText(20),
  slug: slugField,
  levelId: z.uuid(),
  description: optionalText(2000),
  sortOrder: z.coerce.number().int().default(0),
  subjectIds: z.array(z.uuid()).optional(),
});

export const subjectInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  slug: slugField,
  shortName: optionalText(20),
  aliases: stringList,
  description: optionalText(2000),
  sortOrder: z.coerce.number().int().default(0),
});

export const resourceTypeInputSchema = z.object({
  name: z.string().trim().min(2).max(80),
  pluralName: z.string().trim().min(2).max(80),
  slug: slugField,
  aliases: stringList,
  description: optionalText(2000),
  sortOrder: z.coerce.number().int().default(0),
  showInNav: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
});

export const academicYearInputSchema = z.object({
  year: z.coerce.number().int().min(1990).max(2100),
  label: optionalText(40),
});

export const termInputSchema = z.object({
  name: z.string().trim().min(2).max(40),
  slug: slugField,
  number: z.coerce.number().int().min(1).max(6),
});

export const curriculumInputSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugField,
  description: optionalText(2000),
});

export const topicInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: slugField,
  subjectId: optionalNullableId,
  classId: optionalNullableId,
  description: optionalText(2000),
});

export const subtopicInputSchema = z.object({
  name: z.string().trim().min(2).max(160),
  slug: slugField,
  topicId: z.uuid(),
});

export const tagInputSchema = z.object({
  name: z.string().trim().min(1).max(60),
  slug: slugField,
});

export const collectionInputSchema = z.object({
  title: z.string().trim().min(3).max(160),
  slug: slugField,
  description: optionalText(4000),
  featured: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
  isPublished: z.preprocess((v) => v === 'true' || v === true, z.boolean()).default(false),
  resourceIds: z.array(z.uuid()).max(500).optional(),
  seoTitle: optionalText(70),
  seoDescription: optionalText(170),
});

export const seoMetadataInputSchema = z.object({
  path: z
    .string()
    .trim()
    .max(300)
    .regex(/^\/[a-z0-9\-/]*$/, 'Path must start with / and use lowercase slugs'),
  title: optionalText(70),
  description: optionalText(170),
  intro: optionalText(4000),
  noindex: z.boolean().default(false),
});

export const adminCreateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z
    .email()
    .max(200)
    .transform((e) => e.toLowerCase()),
  password: passwordSchema,
  roleKeys: z.array(z.string().max(60)).min(1),
});

export const adminUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  isActive: z.boolean().optional(),
  roleKeys: z.array(z.string().max(60)).min(1).optional(),
  password: passwordSchema.optional(),
});

export const homepageSettingsSchema = z.object({
  heroTitle: z.string().trim().max(120),
  heroSubtitle: z.string().trim().max(300),
  searchPlaceholder: z.string().trim().max(120),
  announcement: z
    .object({
      enabled: z.boolean(),
      message: z.string().trim().max(300),
      href: z.string().trim().max(300).optional().nullable(),
    })
    .nullable()
    .optional(),
  featuredSubjectIds: z.array(z.uuid()).max(24).default([]),
  featuredCollectionIds: z.array(z.uuid()).max(12).default([]),
  sections: z
    .array(
      z.object({
        key: z.enum([
          'featured',
          'recent',
          'popular',
          'trending',
          'past-papers',
          'schemes-of-work',
          'lesson-plans',
          'notes',
          'collections',
        ]),
        enabled: z.boolean(),
        title: z.string().trim().max(80).optional(),
      }),
    )
    .max(20),
});
export type HomepageSettings = z.infer<typeof homepageSettingsSchema>;

export const siteSettingsSchema = z.object({
  siteName: z.string().trim().min(2).max(80),
  tagline: z.string().trim().max(160),
  description: z.string().trim().max(300),
  contactEmail: z.email().max(200).optional().nullable(),
  whatsappNumber: z.string().trim().max(30).optional().nullable(),
  footerNote: z.string().trim().max(300).optional().nullable(),
});
export type SiteSettings = z.infer<typeof siteSettingsSchema>;
