import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { eq } from '@edushare/database';
import { resourceFiles, resources } from '@edushare/database/schema';
import { loadVocabulary } from '@edushare/search';
import { recordAudit } from './audit';
import type { ServiceContext } from './context';

/**
 * Optional AI enrichment with Claude: a summary, a short card description, search keywords
 * and classification suggestions. Off unless AI_ENRICH_ENABLED=true and Anthropic
 * credentials are configured. Suggestions are stored for admin review — never auto-published.
 */
export function aiEnabled(): boolean {
  return (
    process.env.AI_ENRICH_ENABLED === 'true' &&
    Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)
  );
}

const MODEL = process.env.AI_MODEL || 'claude-opus-5';
/** The prompt includes at most this much extracted text; the model is told it is an excerpt. */
const MAX_CHARS = Number(process.env.AI_MAX_CHARS ?? 40_000);

export interface AiSuggestion {
  model: string;
  generatedAt: string;
  shortDescription: string;
  description: string;
  keywords: string[];
  classSlug: string | null;
  subjectSlug: string | null;
  typeSlug: string | null;
  year: number | null;
  termSlug: string | null;
  topic: string | null;
  /** Resolved ids for one-click apply in the admin. */
  ids: Partial<
    Record<
      'classId' | 'subjectId' | 'resourceTypeId' | 'academicYearId' | 'termId' | 'topicId',
      string
    >
  >;
}

type MessagesClient = Pick<Anthropic['beta']['messages'], 'parse'>;

export async function enrichResource(
  ctx: ServiceContext,
  resourceId: string,
  opts: { client?: MessagesClient } = {},
): Promise<AiSuggestion | null> {
  const r = await ctx.db.query.resources.findFirst({
    where: eq(resources.id, resourceId),
    columns: {
      id: true,
      title: true,
      description: true,
      shortDescription: true,
      keywords: true,
      suggestions: true,
      fileId: true,
    },
    with: { class: true, subject: true, resourceType: true },
  });
  if (!r?.fileId) return null;
  const file = await ctx.db.query.resourceFiles.findFirst({
    where: eq(resourceFiles.id, r.fileId),
    columns: { extractedText: true, originalName: true, pageCount: true },
  });
  const text = file?.extractedText ?? '';
  if (text.length < 200) {
    console.warn(`[ai] skipped ${resourceId}: only ${text.length} characters of text`);
    return null;
  }
  const v = await loadVocabulary(ctx.db);

  const nullableEnum = (values: string[]) =>
    values.length ? z.enum(values as [string, ...string[]]).nullable() : z.null();
  const Schema = z.object({
    shortDescription: z
      .string()
      .describe('One sentence (max 200 characters) for a resource card, plain English'),
    description: z
      .string()
      .describe('2–4 sentence summary of what the document contains and who it is for'),
    keywords: z
      .array(z.string())
      .describe('5–12 search keywords teachers or learners in Uganda would type'),
    classSlug: nullableEnum(v.classes.map((c) => c.slug)),
    subjectSlug: nullableEnum(v.subjects.map((s) => s.slug)),
    typeSlug: nullableEnum(v.types.map((t) => t.slug)),
    year: z.number().int().nullable(),
    termSlug: nullableEnum(v.terms.map((t) => t.slug)),
    topic: z.string().nullable().describe('Main syllabus topic, if the document focuses on one'),
  });

  const excerpt = text.slice(0, MAX_CHARS);
  const truncated = text.length > excerpt.length;
  const client = opts.client ?? new Anthropic().beta.messages;
  const response = await client.parse({
    model: MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: betaZodOutputFormat(Schema) },
    system:
      'You catalogue educational resources for a free public library serving Ugandan schools (Nursery, Primary P1–P7, Secondary S1–S6). ' +
      'Describe documents accurately and neutrally from their content. Only choose a class, subject, type, year or term when the document clearly indicates it; otherwise return null.',
    messages: [
      {
        role: 'user',
        content:
          `Title: ${r.title}\nFile name: ${file?.originalName ?? ''}\nPages: ${file?.pageCount ?? 'unknown'}\n` +
          `Current classification: ${[r.class?.name, r.subject?.name, r.resourceType?.name].filter(Boolean).join(', ') || 'none'}\n\n` +
          `Document text${truncated ? ` (first ${MAX_CHARS} of ${text.length} characters)` : ''}:\n<document>\n${excerpt}\n</document>`,
      },
    ],
  });
  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    console.warn(`[ai] no suggestion for ${resourceId}: ${response.stop_reason}`);
    return null;
  }
  const o = response.parsed_output;
  const topic = o.topic
    ? v.topics.find((t) => t.name.toLowerCase() === o.topic!.toLowerCase())
    : undefined;
  const suggestion: AiSuggestion = {
    model: response.model,
    generatedAt: new Date().toISOString(),
    shortDescription: o.shortDescription.slice(0, 300),
    description: o.description.slice(0, 4000),
    keywords: o.keywords.slice(0, 15).map((k) => k.slice(0, 60)),
    classSlug: o.classSlug,
    subjectSlug: o.subjectSlug,
    typeSlug: o.typeSlug,
    year: o.year,
    termSlug: o.termSlug,
    topic: o.topic,
    ids: {
      classId: v.classes.find((c) => c.slug === o.classSlug)?.id,
      subjectId: v.subjects.find((s) => s.slug === o.subjectSlug)?.id,
      resourceTypeId: v.types.find((t) => t.slug === o.typeSlug)?.id,
      academicYearId: v.years.find((y) => y.year === o.year)?.id,
      termId: v.terms.find((t) => t.slug === o.termSlug)?.id,
      topicId: topic?.id,
    },
  };
  // Optionally fill empty descriptions straight away (never classification or status).
  const autoFill = process.env.AI_AUTOFILL_DESCRIPTIONS === 'true';
  await ctx.db
    .update(resources)
    .set({
      suggestions: { ...(r.suggestions ?? {}), ai: suggestion },
      ...(autoFill && !r.shortDescription ? { shortDescription: suggestion.shortDescription } : {}),
      ...(autoFill && !r.description ? { description: suggestion.description } : {}),
    })
    .where(eq(resources.id, resourceId));
  await recordAudit(ctx, null, {
    action: 'resource.ai_enriched',
    entityType: 'resource',
    entityId: resourceId,
    entityLabel: r.title,
    changes: { model: response.model },
  });
  if (autoFill && (!r.shortDescription || !r.description))
    await ctx.search.indexResource(resourceId);
  return suggestion;
}
