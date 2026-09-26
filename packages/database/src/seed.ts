import { sql } from 'drizzle-orm';
import { DEFAULT_ROLES, PERMISSIONS } from '@edushare/shared';
import type { Database } from './client';
import * as s from './schema';
import {
  CLASSES,
  CLASS_SUBJECTS,
  CURRICULA,
  DEFAULT_HOMEPAGE_SETTINGS,
  DEFAULT_SITE_SETTINGS,
  LEVELS,
  RESOURCE_TYPES,
  SUBJECTS,
  TERMS,
  YEARS,
} from './seed-data';

/** Idempotently seeds roles, permissions, taxonomy and default settings. */
export async function seedDatabase(db: Database): Promise<void> {
  await db.transaction(async (tx) => {
    // Permissions & roles
    for (const [key, description] of Object.entries(PERMISSIONS)) {
      await tx
        .insert(s.permissions)
        .values({ key, description })
        .onConflictDoUpdate({ target: s.permissions.key, set: { description } });
    }
    const permRows = await tx.select().from(s.permissions);
    const permByKey = new Map(permRows.map((p) => [p.key, p.id]));
    for (const [key, role] of Object.entries(DEFAULT_ROLES)) {
      const [row] = await tx
        .insert(s.roles)
        .values({ key, name: role.name, description: role.description, isSystem: true })
        .onConflictDoUpdate({
          target: s.roles.key,
          set: { name: role.name, description: role.description, isSystem: true },
        })
        .returning();
      if (!row) continue;
      await tx.delete(s.rolePermissions).where(sql`${s.rolePermissions.roleId} = ${row.id}`);
      const values = role.permissions
        .map((p) => permByKey.get(p))
        .filter((v): v is string => Boolean(v))
        .map((permissionId) => ({ roleId: row.id, permissionId }));
      if (values.length) await tx.insert(s.rolePermissions).values(values);
    }

    // Levels & classes
    const levelIds = new Map<string, string>();
    for (const level of LEVELS) {
      const [row] = await tx
        .insert(s.schoolLevels)
        .values(level)
        .onConflictDoUpdate({ target: s.schoolLevels.slug, set: { name: level.name, sortOrder: level.sortOrder } })
        .returning();
      if (row) levelIds.set(level.slug, row.id);
    }
    const classIds = new Map<string, string>();
    for (const [i, c] of CLASSES.entries()) {
      const levelId = levelIds.get(c.level);
      if (!levelId) continue;
      const [row] = await tx
        .insert(s.classes)
        .values({ name: c.name, shortName: c.shortName, slug: c.slug, levelId, aliases: c.aliases, sortOrder: i + 1 })
        .onConflictDoUpdate({
          target: s.classes.slug,
          set: { aliases: c.aliases, shortName: c.shortName, sortOrder: i + 1 },
        })
        .returning();
      if (row) classIds.set(c.slug, row.id);
    }

    const subjectIds = new Map<string, string>();
    for (const [i, subj] of SUBJECTS.entries()) {
      const [row] = await tx
        .insert(s.subjects)
        .values({ name: subj.name, slug: subj.slug, shortName: subj.shortName ?? null, aliases: subj.aliases, sortOrder: i + 1 })
        .onConflictDoUpdate({ target: s.subjects.slug, set: { aliases: subj.aliases } })
        .returning();
      if (row) subjectIds.set(subj.slug, row.id);
    }

    for (const [classSlug, subjectSlugs] of Object.entries(CLASS_SUBJECTS)) {
      const classId = classIds.get(classSlug);
      if (!classId) continue;
      const values = subjectSlugs
        .map((slug) => subjectIds.get(slug))
        .filter((v): v is string => Boolean(v))
        .map((subjectId) => ({ classId, subjectId }));
      if (values.length) await tx.insert(s.classSubjects).values(values).onConflictDoNothing();
    }

    for (const [i, t] of RESOURCE_TYPES.entries()) {
      await tx
        .insert(s.resourceTypes)
        .values({ ...t, showInNav: t.showInNav ?? false, sortOrder: i + 1 })
        .onConflictDoUpdate({ target: s.resourceTypes.slug, set: { aliases: t.aliases } });
    }
    for (const term of TERMS) {
      await tx.insert(s.terms).values(term).onConflictDoNothing();
    }
    for (const year of YEARS) {
      await tx.insert(s.academicYears).values({ year, label: String(year) }).onConflictDoNothing();
    }
    for (const c of CURRICULA) {
      await tx.insert(s.curricula).values(c).onConflictDoNothing();
    }

    await tx.insert(s.siteSettings).values({ key: 'site', value: DEFAULT_SITE_SETTINGS }).onConflictDoNothing();
    await tx.insert(s.siteSettings).values({ key: 'homepage', value: DEFAULT_HOMEPAGE_SETTINGS }).onConflictDoNothing();
  });
}
