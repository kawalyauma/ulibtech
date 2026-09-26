import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  smallint,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { id, timestamps } from './columns';

export const schoolLevels = pgTable('school_levels', {
  id: id(),
  name: varchar('name', { length: 80 }).notNull(),
  slug: varchar('slug', { length: 80 }).notNull().unique(),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});

export const classes = pgTable(
  'classes',
  {
    id: id(),
    levelId: uuid('level_id')
      .notNull()
      .references(() => schoolLevels.id, { onDelete: 'restrict' }),
    name: varchar('name', { length: 80 }).notNull(),
    shortName: varchar('short_name', { length: 20 }),
    slug: varchar('slug', { length: 40 }).notNull().unique(),
    aliases: text('aliases').array().notNull().default([]),
    description: text('description'),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [index('classes_level_idx').on(t.levelId)],
);

export const subjects = pgTable('subjects', {
  id: id(),
  name: varchar('name', { length: 80 }).notNull(),
  shortName: varchar('short_name', { length: 20 }),
  slug: varchar('slug', { length: 80 }).notNull().unique(),
  aliases: text('aliases').array().notNull().default([]),
  description: text('description'),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});

export const classSubjects = pgTable(
  'class_subjects',
  {
    classId: uuid('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.classId, t.subjectId] })],
);

export const resourceTypes = pgTable('resource_types', {
  id: id(),
  name: varchar('name', { length: 80 }).notNull(),
  pluralName: varchar('plural_name', { length: 80 }).notNull(),
  slug: varchar('slug', { length: 80 }).notNull().unique(),
  aliases: text('aliases').array().notNull().default([]),
  description: text('description'),
  showInNav: boolean('show_in_nav').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps,
});

export const academicYears = pgTable('academic_years', {
  id: id(),
  year: smallint('year').notNull().unique(),
  label: varchar('label', { length: 40 }),
  ...timestamps,
});

export const terms = pgTable('terms', {
  id: id(),
  name: varchar('name', { length: 40 }).notNull(),
  slug: varchar('slug', { length: 40 }).notNull().unique(),
  number: smallint('number').notNull(),
  ...timestamps,
});

export const curricula = pgTable('curricula', {
  id: id(),
  name: varchar('name', { length: 120 }).notNull(),
  slug: varchar('slug', { length: 80 }).notNull().unique(),
  description: text('description'),
  ...timestamps,
});

export const topics = pgTable(
  'topics',
  {
    id: id(),
    name: varchar('name', { length: 160 }).notNull(),
    slug: varchar('slug', { length: 160 }).notNull().unique(),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
    classId: uuid('class_id').references(() => classes.id, { onDelete: 'set null' }),
    description: text('description'),
    ...timestamps,
  },
  (t) => [index('topics_subject_idx').on(t.subjectId)],
);

export const subtopics = pgTable(
  'subtopics',
  {
    id: id(),
    topicId: uuid('topic_id')
      .notNull()
      .references(() => topics.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 160 }).notNull(),
    slug: varchar('slug', { length: 160 }).notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex('subtopics_topic_slug_uq').on(t.topicId, t.slug)],
);

export const tags = pgTable('tags', {
  id: id(),
  name: varchar('name', { length: 60 }).notNull(),
  slug: varchar('slug', { length: 80 }).notNull().unique(),
  ...timestamps,
});
