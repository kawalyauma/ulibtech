import { sql, type Database } from '@edushare/database';
import type { DuplicateCandidate, ResourceStatus } from '@edushare/shared';

export interface DuplicateCheckInput {
  sha256?: string | null;
  sizeBytes?: number | null;
  title?: string | null;
  classId?: string | null;
  subjectId?: string | null;
  academicYearId?: string | null;
  excludeResourceId?: string | null;
}

/** Finds potential duplicates. Never deletes anything — administrators decide. */
export async function findDuplicates(
  db: Database,
  input: DuplicateCheckInput,
): Promise<DuplicateCandidate[]> {
  const conds = [];
  if (input.sha256) conds.push(sql`f.sha256 = ${input.sha256}`);
  if (input.title) {
    conds.push(sql`(similarity(lower(r.title), lower(${input.title})) > 0.55
      ${input.classId ? sql`AND r.class_id IS NOT DISTINCT FROM ${input.classId}::uuid` : sql``}
      ${input.subjectId ? sql`AND r.subject_id IS NOT DISTINCT FROM ${input.subjectId}::uuid` : sql``})`);
  }
  if (input.sizeBytes && input.classId && input.subjectId) {
    conds.push(
      sql`(f.size_bytes = ${input.sizeBytes} AND r.class_id = ${input.classId} AND r.subject_id = ${input.subjectId})`,
    );
  }
  if (!conds.length) return [];
  const rows = await db.execute<{
    id: string;
    title: string;
    slug: string;
    status: ResourceStatus;
    same_hash: boolean;
    title_sim: number;
    same_size: boolean;
    same_class: boolean;
    same_subject: boolean;
    same_year: boolean;
  }>(sql`
    SELECT DISTINCT ON (r.id) r.id, r.title, r.slug, r.status,
      ${input.sha256 ? sql`bool_or(f.sha256 = ${input.sha256}) OVER (PARTITION BY r.id)` : sql`false`} AS same_hash,
      ${input.title ? sql`similarity(lower(r.title), lower(${input.title}))` : sql`0`}::float AS title_sim,
      ${input.sizeBytes ? sql`coalesce(f.size_bytes = ${input.sizeBytes}, false)` : sql`false`} AS same_size,
      ${input.classId ? sql`r.class_id IS NOT DISTINCT FROM ${input.classId}::uuid` : sql`false`} AS same_class,
      ${input.subjectId ? sql`r.subject_id IS NOT DISTINCT FROM ${input.subjectId}::uuid` : sql`false`} AS same_subject,
      ${input.academicYearId ? sql`r.academic_year_id IS NOT DISTINCT FROM ${input.academicYearId}::uuid` : sql`false`} AS same_year
    FROM resources r
    LEFT JOIN resource_files f ON f.resource_id = r.id
    WHERE (${sql.join(conds, sql` OR `)}) ${input.excludeResourceId ? sql`AND r.id <> ${input.excludeResourceId}` : sql``}
    ORDER BY r.id
    LIMIT 10`);
  return rows.map((r) => {
    const reasons: string[] = [];
    if (r.same_hash) reasons.push('Identical file already uploaded');
    if (r.title_sim > 0.55) reasons.push(`Similar title (${Math.round(r.title_sim * 100)}% match)`);
    if (r.same_size) reasons.push('Same file size');
    if (r.same_class && r.same_subject) reasons.push('Same class and subject');
    if (r.same_year) reasons.push('Same academic year');
    return { id: r.id, title: r.title, slug: r.slug, status: r.status, reasons };
  });
}
