import { inArray, type Database } from '@edushare/database';
import { resources } from '@edushare/database/schema';
import type { ResourceDetailRow, ResourceWithRelations } from './mappers';

export const resourceColumns = { searchVector: false, contentVector: false, searchText: false } as const;
const fileColumns = { extractedText: false } as const;

export const cardRelations = {
  class: { with: { level: true } },
  subject: true,
  resourceType: true,
  academicYear: true,
  term: true,
  file: { columns: fileColumns },
  thumbnail: true,
} as const;

export const detailRelations = {
  ...cardRelations,
  topic: true,
  subtopic: true,
  curriculum: true,
  tags: { with: { tag: true } },
} as const;

/** Loads resources by id preserving the given order. */
export async function loadCardsByIds(db: Database, ids: string[]): Promise<ResourceWithRelations[]> {
  if (ids.length === 0) return [];
  const rows = (await db.query.resources.findMany({
    where: inArray(resources.id, ids),
    columns: resourceColumns,
    with: cardRelations,
  })) as ResourceWithRelations[];
  const pos = new Map(ids.map((id, i) => [id, i]));
  return rows.sort((a, b) => (pos.get(a.id) ?? 0) - (pos.get(b.id) ?? 0));
}

export async function loadDetail(db: Database, where: { id?: string; slug?: string }): Promise<ResourceDetailRow | null> {
  const row = await db.query.resources.findFirst({
    where: (r, { eq }) => (where.id ? eq(r.id, where.id) : eq(r.slug, where.slug ?? '')),
    columns: resourceColumns,
    with: detailRelations,
  });
  return (row as ResourceDetailRow | undefined) ?? null;
}
