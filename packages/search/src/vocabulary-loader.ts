import { asc, eq, type Database } from '@edushare/database';
import {
  academicYears,
  classSubjects,
  classes,
  curricula,
  resourceTypes,
  schoolLevels,
  subjects,
  terms,
  topics,
} from '@edushare/database/schema';
import type { Vocabulary, VocabEntry } from './vocabulary';

const TTL_MS = 60_000;
let cached: { at: number; value: Promise<Vocabulary> } | undefined;

export function invalidateVocabulary(): void {
  cached = undefined;
}

/** Loads taxonomy used for query understanding. Cached in-process for one minute. */
export function loadVocabulary(db: Database): Promise<Vocabulary> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const value = (async (): Promise<Vocabulary> => {
    const [cls, subs, types, trms, lvls, yrs, curs, tps, cs] = await Promise.all([
      db.select().from(classes).orderBy(asc(classes.sortOrder)),
      db.select().from(subjects).orderBy(asc(subjects.sortOrder)),
      db.select().from(resourceTypes).orderBy(asc(resourceTypes.sortOrder)),
      db.select().from(terms).orderBy(asc(terms.number)),
      db.select().from(schoolLevels).orderBy(asc(schoolLevels.sortOrder)),
      db.select().from(academicYears).orderBy(asc(academicYears.year)),
      db.select().from(curricula),
      db
        .select({
          id: topics.id,
          slug: topics.slug,
          name: topics.name,
          subjectId: topics.subjectId,
        })
        .from(topics),
      db
        .select({ classSlug: classes.slug, subjectSlug: subjects.slug })
        .from(classSubjects)
        .innerJoin(classes, eq(classes.id, classSubjects.classId))
        .innerJoin(subjects, eq(subjects.id, classSubjects.subjectId)),
    ]);
    const entry = (
      id: string,
      slug: string,
      name: string,
      label: string,
      phrases: (string | null | undefined)[],
    ): VocabEntry => ({
      id,
      slug,
      name,
      label,
      phrases: [...new Set(phrases.filter((p): p is string => Boolean(p && p.trim())))],
    });
    const classSubjectsMap: Record<string, string[]> = {};
    for (const row of cs) (classSubjectsMap[row.classSlug] ??= []).push(row.subjectSlug);
    return {
      classes: cls.map((c) => ({
        ...entry(c.id, c.slug, c.name, c.shortName ?? c.name, [
          c.slug,
          c.name,
          c.shortName,
          ...c.aliases,
        ]),
        parentId: c.levelId,
      })),
      subjects: subs.map((s) =>
        entry(s.id, s.slug, s.name, s.name, [
          s.name,
          s.slug.replace(/-/g, ' '),
          s.shortName,
          ...s.aliases,
        ]),
      ),
      types: types.map((t) =>
        entry(t.id, t.slug, t.name, t.pluralName, [
          t.name,
          t.pluralName,
          t.slug.replace(/-/g, ' '),
          ...t.aliases,
        ]),
      ),
      terms: trms.map((t) =>
        entry(t.id, t.slug, t.name, t.name, [t.name, t.slug.replace(/-/g, ' ')]),
      ),
      levels: lvls.map((l) => entry(l.id, l.slug, l.name, l.name, [l.name])),
      years: yrs.map((y) => ({ id: y.id, year: y.year })),
      curricula: curs.map((c) => entry(c.id, c.slug, c.name, c.name, [c.name])),
      topics: tps.map((t) => ({
        ...entry(t.id, t.slug, t.name, t.name, [t.name]),
        parentId: t.subjectId,
      })),
      classSubjects: classSubjectsMap,
    };
  })();
  cached = { at: Date.now(), value };
  value.catch(() => {
    cached = undefined;
  });
  return value;
}
