import { eq } from '@edushare/database';
import { resources } from '@edushare/database/schema';
import {
  buildPhraseIndex,
  expandNumberWords,
  loadVocabulary,
  parseQuery,
  type ParsedQuery,
  type Vocabulary,
} from '@edushare/search';
import { titleFromFileName } from '@edushare/shared';
import { recordAudit } from './audit';
import type { ServiceContext } from './context';

export interface ClassificationSuggestion {
  classId?: string;
  subjectId?: string;
  resourceTypeId?: string;
  academicYearId?: string;
  termId?: string;
  topicId?: string;
  /** Which input produced each field. */
  sources: Record<string, 'title' | 'fileName' | 'text'>;
  labels: Record<string, string>;
}

const TEXT_WINDOW = 800;

function topicFor(v: Vocabulary, haystack: string, subjectId?: string) {
  const text = ` ${haystack.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  const candidates = v.topics
    .filter((t) => t.name.length >= 4)
    .filter((t) => !subjectId || !t.parentId || t.parentId === subjectId)
    .sort((a, b) => b.name.length - a.name.length);
  return candidates.find((t) =>
    text.includes(` ${t.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `),
  );
}

/**
 * Infers class, subject, resource type, year, term and topic from the title, the file name
 * and the beginning of the extracted text (exam headers such as
 * "PRIMARY SIX END OF TERM II EXAMINATION 2026 – SOCIAL STUDIES"). Earlier sources win.
 */
export async function suggestClassification(
  ctx: Pick<ServiceContext, 'db'>,
  input: { title?: string | null; fileName?: string | null; text?: string | null },
): Promise<ClassificationSuggestion> {
  const v = await loadVocabulary(ctx.db);
  const index = buildPhraseIndex(v);
  const sources: [ClassificationSuggestion['sources'][string], string][] = [];
  if (input.title) sources.push(['title', input.title]);
  if (input.fileName) sources.push(['fileName', titleFromFileName(input.fileName)]);
  if (input.text) sources.push(['text', input.text.slice(0, TEXT_WINDOW)]);

  const out: ClassificationSuggestion = { sources: {}, labels: {} };
  const take = (
    field: keyof Omit<ClassificationSuggestion, 'sources' | 'labels'>,
    id: string | undefined,
    label: string,
    src: ClassificationSuggestion['sources'][string],
  ) => {
    if (!id || out[field]) return;
    out[field] = id;
    out.sources[field] = src;
    out.labels[field] = label;
  };
  for (const [src, raw] of sources) {
    const p: ParsedQuery = parseQuery(raw, index, expandNumberWords);
    take('classId', p.entities.class?.id, p.entities.class?.label ?? '', src);
    take('subjectId', p.entities.subject?.id, p.entities.subject?.name ?? '', src);
    take('resourceTypeId', p.entities.type?.id, p.entities.type?.name ?? '', src);
    take('termId', p.entities.term?.id, p.entities.term?.name ?? '', src);
    if (p.entities.year) {
      const y = v.years.find((x) => x.year === p.entities.year);
      take('academicYearId', y?.id, String(p.entities.year), src);
    }
  }
  for (const [src, raw] of sources) {
    const t = topicFor(v, raw, out.subjectId);
    if (t) {
      take('topicId', t.id, t.name, src);
      break;
    }
  }
  return out;
}

const FIELDS = [
  'classId',
  'subjectId',
  'resourceTypeId',
  'academicYearId',
  'termId',
  'topicId',
] as const;

/** Fills only empty classification fields and stores the suggestion for admin review. */
export async function autoClassifyResource(
  ctx: ServiceContext,
  resourceId: string,
  input: { fileName?: string; text?: string },
): Promise<string[]> {
  const r = await ctx.db.query.resources.findFirst({
    where: eq(resources.id, resourceId),
    columns: {
      id: true,
      title: true,
      classId: true,
      subjectId: true,
      resourceTypeId: true,
      academicYearId: true,
      termId: true,
      topicId: true,
      suggestions: true,
    },
  });
  if (!r) return [];
  const suggestion = await suggestClassification(ctx, {
    title: r.title,
    fileName: input.fileName,
    text: input.text,
  });
  const updates: Partial<Record<(typeof FIELDS)[number], string>> = {};
  for (const f of FIELDS) {
    if (!r[f] && suggestion[f]) updates[f] = suggestion[f];
  }
  await ctx.db
    .update(resources)
    .set({ ...updates, suggestions: { ...(r.suggestions ?? {}), rules: suggestion } })
    .where(eq(resources.id, resourceId));
  const applied = Object.keys(updates);
  if (applied.length) {
    await recordAudit(ctx, null, {
      action: 'resource.auto_classified',
      entityType: 'resource',
      entityId: resourceId,
      entityLabel: r.title,
      changes: Object.fromEntries(applied.map((k) => [k, suggestion.labels[k]])),
    });
  }
  return applied;
}
