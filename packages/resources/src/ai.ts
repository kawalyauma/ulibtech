import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { eq } from '@edushare/database';
import { resourceFiles, resources } from '@edushare/database/schema';
import { loadVocabulary } from '@edushare/search';
import { ledgerlyCompleteJson, ledgerlyConfigured } from './ai-ledgerly';
import { recordAudit } from './audit';
import { applyAiAutopilot, recordAutopilotSkip } from './autopilot';
import type { ServiceContext } from './context';

/**
 * Optional AI enrichment: a title, summary, card description, search keywords, classification
 * and publishing-quality checks. Off unless AI_ENRICH_ENABLED=true and either a Ledgerly AI
 * server (LEDGERLY_AI_URL + LEDGERLY_AI_API_KEY) or Anthropic credentials are configured.
 * Suggestions are stored for admin review; only zip imports with AI_AUTOPILOT=true are applied
 * and published automatically (see autopilot.ts).
 */
export function aiTransport(): 'ledgerly' | 'anthropic' | null {
  if (process.env.AI_ENRICH_ENABLED !== 'true') return null;
  if (ledgerlyConfigured()) return 'ledgerly';
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) return 'anthropic';
  return null;
}

export function aiEnabled(): boolean {
  return aiTransport() !== null;
}

const MODEL = process.env.AI_MODEL || 'claude-opus-5';
/** The prompt includes at most this much extracted text; the model is told it is an excerpt. */
const MAX_CHARS = Number(process.env.AI_MAX_CHARS ?? 40_000);

export interface AiQuality {
  isEducational: boolean;
  safeForAds: boolean;
  containsPersonalData: boolean;
  /** Commercially published book/workbook (publisher, ISBN): copyright needs a human check. */
  commercialPublication: boolean;
  notes: string | null;
}

export interface AiSuggestion {
  model: string;
  generatedAt: string;
  /** A clean, specific title (the upload title is often just the file name). */
  title: string | null;
  /** Publishing checks; absent when the model did not assess them. */
  quality: AiQuality | null;
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
    await recordAutopilotSkip(ctx, resourceId, [
      'Too little readable text to describe (blank, image-only or unreadable file).',
    ]);
    return null;
  }
  const v = await loadVocabulary(ctx.db);

  const nullableEnum = (values: string[]) =>
    values.length ? z.enum(values as [string, ...string[]]).nullable() : z.null();
  const Schema = z.object({
    title: z
      .string()
      .describe(
        'Clear, specific title (max 90 characters), e.g. "P6 Social Studies End of Term 2 Exam 2024"',
      ),
    shortDescription: z
      .string()
      .describe('One sentence (max 200 characters) for a resource card, plain English'),
    description: z
      .string()
      .describe(
        '60–120 word original summary of what the document covers, how it is organised and who it helps; no copied text',
      ),
    keywords: z
      .array(z.string())
      .describe('5–12 search keywords teachers or learners in Uganda would type'),
    classSlug: nullableEnum(v.classes.map((c) => c.slug)),
    subjectSlug: nullableEnum(v.subjects.map((s) => s.slug)),
    typeSlug: nullableEnum(v.types.map((t) => t.slug)),
    year: z.number().int().nullable(),
    termSlug: nullableEnum(v.terms.map((t) => t.slug)),
    topic: z.string().nullable().describe('Main syllabus topic, if the document focuses on one'),
    isEducational: z
      .boolean()
      .describe('True for genuine teaching/learning material (notes, exams, schemes, plans)'),
    safeForAds: z
      .boolean()
      .describe(
        'False if it contains adult, violent, hateful, shocking or otherwise ad-unsafe content',
      ),
    containsPersonalData: z
      .boolean()
      .describe(
        "True if it lists real people's personal data: learner/parent names with phone numbers, marks, IDs or addresses",
      ),
    isCommercialPublication: z
      .boolean()
      .describe(
        "True if it is a commercially published book, textbook or workbook (a named publisher such as Oxford, Longman, MK or Fountain, an ISBN, or 'All rights reserved'), not teacher-made notes or exam papers",
      ),
    qualityNotes: z.string().nullable().describe('Short reason if any check above fails'),
  });
  type Output = z.infer<typeof Schema>;

  const system =
    'You catalogue educational resources for a free public library serving Ugandan schools (Nursery, Primary P1–P7, Secondary S1–S6). ' +
    'Describe documents accurately and neutrally from their content, in your own words. Only choose a class, subject, type, year or term when the document clearly indicates it; otherwise return null.';
  const header =
    `Title: ${r.title}\nFile name: ${file?.originalName ?? ''}\nPages: ${file?.pageCount ?? 'unknown'}\n` +
    `Current classification: ${[r.class?.name, r.subject?.name, r.resourceType?.name].filter(Boolean).join(', ') || 'none'}`;

  const transport = aiTransport() ?? 'anthropic';
  let o: Partial<Output> & Pick<Output, 'shortDescription' | 'description' | 'keywords'>;
  let model: string;
  if (transport === 'ledgerly' && !opts.client) {
    // Ledgerly returns free-form JSON, so coerce anything outside the vocabulary to null.
    const limit = Math.min(MAX_CHARS, 20_000);
    const excerpt = text.slice(0, limit);
    const oneOf = (values: string[]) => `one of ${JSON.stringify(values)} or null`;
    const shape = {
      title: 'string (max 90 characters)',
      shortDescription: 'string (one sentence, max 200 characters)',
      description: 'string (60-120 words, original wording)',
      keywords: 'string[] (5-12 items)',
      classSlug: oneOf(v.classes.map((c) => c.slug)),
      subjectSlug: oneOf(v.subjects.map((s) => s.slug)),
      typeSlug: oneOf(v.types.map((t) => t.slug)),
      year: 'integer or null',
      termSlug: oneOf(v.terms.map((t) => t.slug)),
      topic: 'string or null (main syllabus topic)',
      isEducational: 'boolean',
      safeForAds: 'boolean (false for adult, violent, hateful or shocking content)',
      containsPersonalData:
        "boolean (true if it lists real learners'/parents' names with phones, marks, IDs or addresses)",
      isCommercialPublication:
        "boolean (true for a commercially published book/textbook/workbook: named publisher, ISBN or 'All rights reserved'; false for teacher-made notes and exam papers)",
      qualityNotes: 'string or null (reason if a check fails)',
    };
    const { json, provider } = await ledgerlyCompleteJson(
      system,
      `${header}\n\nReturn JSON with exactly these keys:\n${JSON.stringify(shape, null, 2)}\n\n` +
        `Document text${text.length > limit ? ` (first ${limit} of ${text.length} characters)` : ''}:\n<document>\n${excerpt}\n</document>`,
    );
    const Loose = z.object({
      title: z.string().catch(''),
      shortDescription: z.string().catch(''),
      description: z.string().catch(''),
      keywords: z.array(z.string()).catch([]),
      classSlug: z.string().nullable().catch(null),
      subjectSlug: z.string().nullable().catch(null),
      typeSlug: z.string().nullable().catch(null),
      year: z.coerce.number().int().nullable().catch(null),
      termSlug: z.string().nullable().catch(null),
      topic: z.string().nullable().catch(null),
      isEducational: z.boolean().catch(false),
      safeForAds: z.boolean().catch(false),
      containsPersonalData: z.boolean().catch(true),
      isCommercialPublication: z.boolean().catch(true),
      qualityNotes: z.string().nullable().catch(null),
    });
    const loose = Loose.parse(json);
    const pick = (value: string | null, allowed: string[]) =>
      value && allowed.includes(value) ? value : null;
    if (!loose.description || !loose.shortDescription)
      throw new Error('Ledgerly AI reply was missing the description.');
    o = {
      ...loose,
      classSlug: pick(
        loose.classSlug,
        v.classes.map((c) => c.slug),
      ),
      subjectSlug: pick(
        loose.subjectSlug,
        v.subjects.map((s) => s.slug),
      ),
      typeSlug: pick(
        loose.typeSlug,
        v.types.map((t) => t.slug),
      ),
      termSlug: pick(
        loose.termSlug,
        v.terms.map((t) => t.slug),
      ),
    };
    model = `ledgerly:${provider}`;
  } else {
    const excerpt = text.slice(0, MAX_CHARS);
    const truncated = text.length > excerpt.length;
    const client = opts.client ?? new Anthropic().beta.messages;
    const response = await client.parse({
      model: MODEL,
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: betaZodOutputFormat(Schema) },
      system,
      messages: [
        {
          role: 'user',
          content:
            `${header}\n\n` +
            `Document text${truncated ? ` (first ${MAX_CHARS} of ${text.length} characters)` : ''}:\n<document>\n${excerpt}\n</document>`,
        },
      ],
    });
    if (response.stop_reason === 'refusal' || !response.parsed_output) {
      console.warn(`[ai] no suggestion for ${resourceId}: ${response.stop_reason}`);
      return null;
    }
    o = response.parsed_output;
    model = response.model;
  }

  const topic = o.topic
    ? v.topics.find((t) => t.name.toLowerCase() === o.topic!.toLowerCase())
    : undefined;
  const assessed = typeof o.isEducational === 'boolean';
  const suggestion: AiSuggestion = {
    model,
    generatedAt: new Date().toISOString(),
    title: o.title?.trim().slice(0, 200) || null,
    quality: assessed
      ? {
          isEducational: Boolean(o.isEducational),
          safeForAds: Boolean(o.safeForAds),
          containsPersonalData: Boolean(o.containsPersonalData),
          // An ISBN in the text is a strong sign of a published book even if the model missed it.
          commercialPublication:
            Boolean(o.isCommercialPublication) || /\bISBN(?:-1[03])?[:\s]*[\d-]{10,17}/i.test(text),
          notes: o.qualityNotes ?? null,
        }
      : null,
    shortDescription: o.shortDescription.slice(0, 300),
    description: o.description.slice(0, 4000),
    keywords: o.keywords.slice(0, 15).map((k) => k.slice(0, 60)),
    classSlug: o.classSlug ?? null,
    subjectSlug: o.subjectSlug ?? null,
    typeSlug: o.typeSlug ?? null,
    year: o.year ?? null,
    termSlug: o.termSlug ?? null,
    topic: o.topic ?? null,
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
    changes: { model },
  });
  if (autoFill && (!r.shortDescription || !r.description))
    await ctx.search.indexResource(resourceId);
  await applyAiAutopilot(ctx, resourceId, suggestion, text.length);
  return suggestion;
}
