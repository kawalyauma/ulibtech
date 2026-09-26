import { asc, eq, getTableName, sql, type Database } from '@edushare/database';
import {
  academicYears,
  classSubjects,
  classes,
  curricula,
  resourceTypes,
  schoolLevels,
  subjects,
  subtopics,
  tags,
  terms,
  topics,
} from '@edushare/database/schema';
import {
  AppError,
  academicYearInputSchema,
  classInputSchema,
  curriculumInputSchema,
  resourceTypeInputSchema,
  schoolLevelInputSchema,
  slugify,
  subjectInputSchema,
  subtopicInputSchema,
  tagInputSchema,
  termInputSchema,
  topicInputSchema,
} from '@edushare/shared';
import type { z } from 'zod';
import { recordAudit } from './audit';
import { PUBLIC_CACHE_NS, type Actor, type ServiceContext } from './context';
import { afterContentChange } from './admin-resources';
import { RESERVED_SLUGS } from './slugs';

// ------------------------------------------------------------------ public

export interface PublicTaxonomy {
  levels: {
    id: string;
    name: string;
    slug: string;
    classes: { id: string; name: string; shortName: string | null; slug: string; count: number }[];
  }[];
  subjects: { id: string; name: string; slug: string; shortName: string | null; count: number }[];
  types: {
    id: string;
    name: string;
    pluralName: string;
    slug: string;
    showInNav: boolean;
    count: number;
    description: string | null;
  }[];
  years: { id: string; year: number; count: number }[];
  terms: { id: string; name: string; slug: string; count: number }[];
  curricula: { id: string; name: string; slug: string; count: number }[];
}

async function countsBy(
  db: Database,
  column:
    | 'class_id'
    | 'subject_id'
    | 'resource_type_id'
    | 'academic_year_id'
    | 'term_id'
    | 'curriculum_id',
) {
  const rows = await db.execute<{ id: string; n: number }>(
    sql`SELECT ${sql.raw(column)} AS id, count(*)::int AS n FROM resources WHERE status = 'published' AND ${sql.raw(column)} IS NOT NULL GROUP BY 1`,
  );
  return new Map(rows.map((r) => [r.id, r.n]));
}

export async function getPublicTaxonomy(ctx: ServiceContext): Promise<PublicTaxonomy> {
  const load = async (): Promise<PublicTaxonomy> => {
    const [lv, cl, su, ty, yr, te, cu, cc, sc, tc, yc, trc, cuc] = await Promise.all([
      ctx.db.select().from(schoolLevels).orderBy(asc(schoolLevels.sortOrder)),
      ctx.db.select().from(classes).orderBy(asc(classes.sortOrder)),
      ctx.db.select().from(subjects).orderBy(asc(subjects.sortOrder)),
      ctx.db.select().from(resourceTypes).orderBy(asc(resourceTypes.sortOrder)),
      ctx.db.select().from(academicYears).orderBy(asc(academicYears.year)),
      ctx.db.select().from(terms).orderBy(asc(terms.number)),
      ctx.db.select().from(curricula),
      countsBy(ctx.db, 'class_id'),
      countsBy(ctx.db, 'subject_id'),
      countsBy(ctx.db, 'resource_type_id'),
      countsBy(ctx.db, 'academic_year_id'),
      countsBy(ctx.db, 'term_id'),
      countsBy(ctx.db, 'curriculum_id'),
    ]);
    return {
      levels: lv.map((l) => ({
        id: l.id,
        name: l.name,
        slug: l.slug,
        classes: cl
          .filter((c) => c.levelId === l.id)
          .map((c) => ({
            id: c.id,
            name: c.name,
            shortName: c.shortName,
            slug: c.slug,
            count: cc.get(c.id) ?? 0,
          })),
      })),
      subjects: su.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
        shortName: s.shortName,
        count: sc.get(s.id) ?? 0,
      })),
      types: ty.map((t) => ({
        id: t.id,
        name: t.name,
        pluralName: t.pluralName,
        slug: t.slug,
        showInNav: t.showInNav,
        count: tc.get(t.id) ?? 0,
        description: t.description,
      })),
      years: yr.map((y) => ({ id: y.id, year: y.year, count: yc.get(y.id) ?? 0 })).reverse(),
      terms: te.map((t) => ({ id: t.id, name: t.name, slug: t.slug, count: trc.get(t.id) ?? 0 })),
      curricula: cu.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        count: cuc.get(c.id) ?? 0,
      })),
    };
  };
  return ctx.cache ? ctx.cache.wrap(PUBLIC_CACHE_NS, 'taxonomy', 300, load) : load();
}

/** Subjects offered in a class, with counts of published resources for that class. */
export async function getClassSubjects(ctx: ServiceContext, classId: string) {
  return ctx.db.execute<{ id: string; name: string; slug: string; count: number }>(sql`
    SELECT s.id, s.name, s.slug, count(r.id)::int AS count
    FROM subjects s
    LEFT JOIN resources r ON r.subject_id = s.id AND r.class_id = ${classId} AND r.status = 'published'
    WHERE s.id IN (SELECT subject_id FROM class_subjects WHERE class_id = ${classId})
       OR s.id IN (SELECT subject_id FROM resources WHERE class_id = ${classId} AND status = 'published')
    GROUP BY s.id ORDER BY s.sort_order`);
}

export async function getTopicsForSubject(
  ctx: ServiceContext,
  subjectId: string | null,
  classId: string | null = null,
) {
  return ctx.db.execute<{ id: string; name: string; slug: string; count: number }>(sql`
    SELECT t.id, t.name, t.slug, count(r.id)::int AS count
    FROM topics t
    JOIN resources r ON r.topic_id = t.id AND r.status = 'published'
    WHERE ${subjectId ? sql`t.subject_id = ${subjectId}` : sql`true`} ${classId ? sql`AND r.class_id = ${classId}` : sql``}
    GROUP BY t.id ORDER BY count DESC, t.name LIMIT 50`);
}

// ------------------------------------------------------------------ admin CRUD

const ENTITIES = {
  levels: {
    table: schoolLevels,
    schema: schoolLevelInputSchema,
    label: 'school level',
    slugFrom: 'name',
    resourceColumn: null,
  },
  classes: {
    table: classes,
    schema: classInputSchema,
    label: 'class',
    slugFrom: 'shortName',
    resourceColumn: 'class_id',
  },
  subjects: {
    table: subjects,
    schema: subjectInputSchema,
    label: 'subject',
    slugFrom: 'name',
    resourceColumn: 'subject_id',
  },
  'resource-types': {
    table: resourceTypes,
    schema: resourceTypeInputSchema,
    label: 'resource type',
    slugFrom: 'pluralName',
    resourceColumn: 'resource_type_id',
  },
  'academic-years': {
    table: academicYears,
    schema: academicYearInputSchema,
    label: 'academic year',
    slugFrom: null,
    resourceColumn: 'academic_year_id',
  },
  terms: {
    table: terms,
    schema: termInputSchema,
    label: 'term',
    slugFrom: 'name',
    resourceColumn: 'term_id',
  },
  curricula: {
    table: curricula,
    schema: curriculumInputSchema,
    label: 'curriculum',
    slugFrom: 'name',
    resourceColumn: 'curriculum_id',
  },
  topics: {
    table: topics,
    schema: topicInputSchema,
    label: 'topic',
    slugFrom: 'name',
    resourceColumn: 'topic_id',
  },
  subtopics: {
    table: subtopics,
    schema: subtopicInputSchema,
    label: 'subtopic',
    slugFrom: 'name',
    resourceColumn: 'subtopic_id',
  },
  tags: {
    table: tags,
    schema: tagInputSchema,
    label: 'tag',
    slugFrom: 'name',
    resourceColumn: null,
  },
} as const;

export type TaxonomyEntity = keyof typeof ENTITIES;
export const TAXONOMY_ENTITIES = Object.keys(ENTITIES) as TaxonomyEntity[];

export function isTaxonomyEntity(v: string): v is TaxonomyEntity {
  return v in ENTITIES;
}

/** Class, subject and resource-type slugs share the URL namespace (/p6/science/past-papers). */
async function assertRouteSlugAvailable(
  db: Database,
  entity: TaxonomyEntity,
  slug: string,
  excludeId?: string,
) {
  if (!['classes', 'subjects', 'resource-types'].includes(entity)) return;
  if (RESERVED_SLUGS.has(slug))
    throw AppError.conflict(`"${slug}" is reserved. Choose another slug.`);
  const rows = await db.execute<{ id: string; kind: string }>(sql`
    SELECT id, 'class' AS kind FROM classes WHERE slug = ${slug}
    UNION ALL SELECT id, 'subject' FROM subjects WHERE slug = ${slug}
    UNION ALL SELECT id, 'resource type' FROM resource_types WHERE slug = ${slug}`);
  const clash = rows.find((r) => r.id !== excludeId);
  if (clash) throw AppError.conflict(`The slug "${slug}" is already used by a ${clash.kind}.`);
}

export async function listTaxonomy(ctx: ServiceContext, entity: TaxonomyEntity) {
  const def = ENTITIES[entity];
  const countSql = def.resourceColumn
    ? sql`(SELECT count(*)::int FROM resources r WHERE r.${sql.raw(def.resourceColumn)} = t.id)`
    : entity === 'tags'
      ? sql`(SELECT count(*)::int FROM resource_tags rt WHERE rt.tag_id = t.id)`
      : entity === 'levels'
        ? sql`(SELECT count(*)::int FROM classes c WHERE c.level_id = t.id)`
        : sql`0`;
  const tableName = sql.identifier(getTableName(def.table));
  const order =
    entity === 'academic-years'
      ? sql`t.year DESC`
      : entity === 'terms'
        ? sql`t.number`
        : ['levels', 'classes', 'subjects', 'resource-types'].includes(entity)
          ? sql`t.sort_order, t.name`
          : sql`t.name`;
  const rows = await ctx.db.execute<Record<string, unknown>>(
    sql`SELECT t.*, ${countSql} AS usage_count FROM ${tableName} t ORDER BY ${order}`,
  );
  if (entity === 'classes') {
    const cs = await ctx.db.select().from(classSubjects);
    return rows.map((r) => ({
      ...r,
      subjectIds: cs.filter((c) => c.classId === r.id).map((c) => c.subjectId),
    }));
  }
  return rows;
}

type Input<E extends TaxonomyEntity> = z.infer<(typeof ENTITIES)[E]['schema']>;

function toColumns(entity: TaxonomyEntity, input: Record<string, unknown>) {
  const { subjectIds: _s, ...rest } = input;
  return rest;
}

export async function createTaxonomy<E extends TaxonomyEntity>(
  ctx: ServiceContext,
  actor: Actor,
  entity: E,
  raw: unknown,
) {
  const def = ENTITIES[entity];
  const input = def.schema.parse(raw) as Input<E> & Record<string, unknown>;
  const values: Record<string, unknown> = toColumns(entity, input);
  if (def.slugFrom) {
    const base =
      (input.slug as string | undefined) ??
      slugify(String(input[def.slugFrom] ?? input.name ?? ''), 80);
    if (!base) throw AppError.badRequest('A slug could not be generated. Provide one.');
    values.slug = base;
    await assertRouteSlugAvailable(ctx.db, entity, base);
  }
  try {
    const [row] = await ctx.db
      .insert(def.table)
      .values(values as never)
      .returning();
    if (entity === 'classes' && Array.isArray(input.subjectIds) && row) {
      await setClassSubjects(ctx.db, (row as { id: string }).id, input.subjectIds as string[]);
    }
    await recordAudit(ctx, actor, {
      action: `${entity}.create`,
      entityType: entity,
      entityId: (row as { id: string }).id,
      entityLabel: String(input.name ?? input.year ?? ''),
      changes: values,
    });
    await afterTaxonomyChange(ctx);
    return row;
  } catch (err) {
    if ((err as { code?: string }).code === '23505')
      throw AppError.conflict(`That ${def.label} already exists.`);
    throw err;
  }
}

export async function updateTaxonomy<E extends TaxonomyEntity>(
  ctx: ServiceContext,
  actor: Actor,
  entity: E,
  id: string,
  raw: unknown,
) {
  const def = ENTITIES[entity];
  const input = (def.schema as z.ZodObject).partial().parse(raw) as Partial<Input<E>> &
    Record<string, unknown>;
  const values: Record<string, unknown> = toColumns(entity, input);
  if (typeof input.slug === 'string')
    await assertRouteSlugAvailable(ctx.db, entity, input.slug, id);
  const table = def.table as typeof classes;
  try {
    const [row] = Object.keys(values).length
      ? await ctx.db
          .update(table)
          .set(values as never)
          .where(eq(table.id, id))
          .returning()
      : await ctx.db.select().from(table).where(eq(table.id, id));
    if (!row) throw AppError.notFound(def.label);
    if (entity === 'classes' && Array.isArray(input.subjectIds))
      await setClassSubjects(ctx.db, id, input.subjectIds as string[]);
    await recordAudit(ctx, actor, {
      action: `${entity}.update`,
      entityType: entity,
      entityId: id,
      entityLabel: String((row as { name?: string }).name ?? ''),
      changes: values,
    });
    await afterTaxonomyChange(ctx);
    // Reindex resources that embed this taxonomy in their search documents.
    if (def.resourceColumn) {
      const ids = await ctx.db.execute<{ id: string }>(
        sql`SELECT id FROM resources WHERE ${sql.raw(def.resourceColumn)} = ${id}`,
      );
      for (const r of ids) await ctx.enqueue('index-resource', { resourceId: r.id });
    }
    return row;
  } catch (err) {
    if ((err as { code?: string }).code === '23505')
      throw AppError.conflict(`That ${def.label} already exists.`);
    throw err;
  }
}

export async function deleteTaxonomy(
  ctx: ServiceContext,
  actor: Actor,
  entity: TaxonomyEntity,
  id: string,
) {
  const def = ENTITIES[entity];
  if (def.resourceColumn) {
    const [used] = await ctx.db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM resources WHERE ${sql.raw(def.resourceColumn)} = ${id}`,
    );
    if ((used?.n ?? 0) > 0)
      throw AppError.conflict(
        `This ${def.label} is used by ${used!.n} resource(s). Reassign them first.`,
      );
  }
  const table = def.table as typeof classes;
  try {
    const [row] = await ctx.db.delete(table).where(eq(table.id, id)).returning();
    if (!row) throw AppError.notFound(def.label);
    await recordAudit(ctx, actor, {
      action: `${entity}.delete`,
      entityType: entity,
      entityId: id,
      entityLabel: String((row as { name?: string }).name ?? ''),
    });
    await afterTaxonomyChange(ctx);
  } catch (err) {
    if ((err as { code?: string }).code === '23503')
      throw AppError.conflict(`This ${def.label} is still in use.`);
    throw err;
  }
}

async function setClassSubjects(db: Database, classId: string, subjectIds: string[]) {
  await db.delete(classSubjects).where(eq(classSubjects.classId, classId));
  if (subjectIds.length)
    await db
      .insert(classSubjects)
      .values([...new Set(subjectIds)].map((subjectId) => ({ classId, subjectId })));
}

async function afterTaxonomyChange(ctx: ServiceContext) {
  await ctx.cache?.invalidate(PUBLIC_CACHE_NS);
  await afterContentChange(ctx, []);
}
