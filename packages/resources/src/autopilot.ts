import { and, eq, ne } from '@edushare/database';
import { resourceFiles, resources } from '@edushare/database/schema';
import { slugify, titleFromFileName, type ResourceUpdateInput } from '@edushare/shared';
import { setResourceStatus, updateResource } from './admin-resources';
import type { AiSuggestion } from './ai';
import { recordAudit } from './audit';
import type { Actor, ServiceContext } from './context';

/**
 * Zip-import autopilot: once AI enrichment finishes, fill the resource from the suggestion and
 * publish it only when it passes quality checks aimed at ad-network review (real educational
 * content, enough original description, classified, ad-safe, no personal data, not a
 * duplicate). Anything that fails stays a draft with the reasons, for an admin to review.
 */

export interface AutopilotResult {
  published: boolean;
  reasons: string[];
  applied: string[];
}

/** Resources created by a zip import carry this marker in `suggestions.import`. */
export interface ImportMarker {
  batchId: string;
  path: string;
}

const MIN_TEXT_CHARS = 400;
const MIN_DESCRIPTION_WORDS = 40;
const AI_ACTOR: Actor = { id: '', name: 'EduShare AI', permissions: [] };

export function autopilotEnabled(): boolean {
  return process.env.AI_AUTOPILOT === 'true';
}

const wordCount = (s: string | null | undefined) =>
  (s ?? '').trim().split(/\s+/).filter(Boolean).length;

/** Pure quality gate, exported for tests. */
export function autopilotReasons(input: {
  textLength: number;
  suggestion: Pick<AiSuggestion, 'quality'>;
  description: string | null;
  classified: { classId: string | null; subjectId: string | null; resourceTypeId: string | null };
  duplicateOfPublished: boolean;
  scanStatus: string | null;
}): string[] {
  const reasons: string[] = [];
  const q = input.suggestion.quality;
  if (input.textLength < MIN_TEXT_CHARS)
    reasons.push('Too little readable text; the page would be thin content.');
  if (!q) reasons.push('The AI did not assess content quality.');
  else {
    if (!q.isEducational)
      reasons.push(`Not recognised as educational material${q.notes ? `: ${q.notes}` : '.'}`);
    if (!q.safeForAds)
      reasons.push(`May break ad content policies${q.notes ? `: ${q.notes}` : '.'}`);
    if (q.containsPersonalData)
      reasons.push('Contains personal data (names with phones, marks or IDs).');
    if (q.commercialPublication)
      reasons.push(
        'Looks like a commercially published book; confirm you have the rights before publishing (ads review rejects copyrighted copies).',
      );
  }
  if (wordCount(input.description) < MIN_DESCRIPTION_WORDS)
    reasons.push(`Description is shorter than ${MIN_DESCRIPTION_WORDS} words.`);
  if (!input.classified.subjectId && !input.classified.classId)
    reasons.push('No class or subject could be identified.');
  if (!input.classified.resourceTypeId) reasons.push('No resource type could be identified.');
  if (input.duplicateOfPublished) reasons.push('Exact duplicate of an already published file.');
  if (input.scanStatus === 'infected') reasons.push('Failed the security scan.');
  else if (input.scanStatus !== 'clean' && input.scanStatus !== 'skipped')
    reasons.push('Security scan has not finished.');
  return reasons;
}

async function importMarker(ctx: ServiceContext, resourceId: string) {
  const r = await ctx.db.query.resources.findFirst({
    where: eq(resources.id, resourceId),
    columns: { suggestions: true },
  });
  const marker = (r?.suggestions ?? {}).import as ImportMarker | undefined;
  return { marker, suggestions: r?.suggestions ?? {} };
}

async function storeOutcome(
  ctx: ServiceContext,
  resourceId: string,
  outcome: AutopilotResult,
): Promise<void> {
  const { suggestions } = await importMarker(ctx, resourceId);
  await ctx.db
    .update(resources)
    .set({
      suggestions: {
        ...suggestions,
        autopilot: { ...outcome, checkedAt: new Date().toISOString() },
      },
    })
    .where(eq(resources.id, resourceId));
}

/** Records why a zip-imported resource could not go through AI at all (e.g. no text). */
export async function recordAutopilotSkip(
  ctx: ServiceContext,
  resourceId: string,
  reasons: string[],
): Promise<void> {
  if (!autopilotEnabled()) return;
  const { marker } = await importMarker(ctx, resourceId);
  if (!marker) return;
  await storeOutcome(ctx, resourceId, { published: false, reasons, applied: [] });
}

export async function applyAiAutopilot(
  ctx: ServiceContext,
  resourceId: string,
  suggestion: AiSuggestion,
  textLength: number,
): Promise<AutopilotResult | null> {
  if (!autopilotEnabled()) return null;
  const { marker } = await importMarker(ctx, resourceId);
  if (!marker) return null;

  const r = await ctx.db.query.resources.findFirst({
    where: eq(resources.id, resourceId),
    columns: {
      id: true,
      title: true,
      status: true,
      shortDescription: true,
      description: true,
      keywords: true,
      classId: true,
      subjectId: true,
      resourceTypeId: true,
      academicYearId: true,
      termId: true,
      topicId: true,
      fileId: true,
    },
    with: { file: { columns: { originalName: true, sha256: true, scanStatus: true } } },
  });
  if (!r) return null;

  // 1. Fill what is missing. Rule-based classification from folder names and exam headers
  //    wins over the AI; the AI title replaces titles that are just the file name.
  const input: ResourceUpdateInput = {};
  const applied: string[] = [];
  const autoTitle = r.file ? titleFromFileName(r.file.originalName) : r.title;
  if (suggestion.title && suggestion.title.length >= 3 && r.title === autoTitle) {
    input.title = suggestion.title;
    if (r.status !== 'published') input.slug = slugify(suggestion.title, 110) || undefined;
    applied.push('title');
  }
  if (!r.shortDescription && suggestion.shortDescription) {
    input.shortDescription = suggestion.shortDescription;
    applied.push('shortDescription');
  }
  if (!r.description && suggestion.description) {
    input.description = suggestion.description;
    applied.push('description');
  }
  if (!r.keywords?.length && suggestion.keywords.length) {
    input.keywords = suggestion.keywords;
    applied.push('keywords');
  }
  const idFields = [
    'classId',
    'subjectId',
    'resourceTypeId',
    'academicYearId',
    'termId',
    'topicId',
  ] as const;
  for (const f of idFields) {
    const id = suggestion.ids[f];
    if (!r[f] && id) {
      input[f] = id;
      applied.push(f);
    }
  }
  if (applied.length) await updateResource(ctx, AI_ACTOR, resourceId, input);

  // 2. Quality gate
  const duplicate = r.file?.sha256
    ? await ctx.db
        .select({ id: resources.id })
        .from(resources)
        .innerJoin(resourceFiles, eq(resourceFiles.id, resources.fileId))
        .where(
          and(
            eq(resourceFiles.sha256, r.file.sha256),
            eq(resources.status, 'published'),
            ne(resources.id, resourceId),
          ),
        )
        .limit(1)
    : [];
  const reasons = autopilotReasons({
    textLength,
    suggestion,
    description: input.description ?? r.description,
    classified: {
      classId: input.classId ?? r.classId,
      subjectId: input.subjectId ?? r.subjectId,
      resourceTypeId: input.resourceTypeId ?? r.resourceTypeId,
    },
    duplicateOfPublished: duplicate.length > 0,
    scanStatus: r.file?.scanStatus ?? null,
  });

  // 3. Publish, or leave as a draft with the reasons.
  let published = false;
  if (!reasons.length && r.status !== 'published') {
    try {
      await setResourceStatus(ctx, AI_ACTOR, resourceId, 'published');
      published = true;
    } catch (err) {
      reasons.push(`Publishing failed: ${(err as Error).message}`);
    }
  }
  const outcome: AutopilotResult = { published, reasons, applied };
  await storeOutcome(ctx, resourceId, outcome);
  await recordAudit(ctx, AI_ACTOR, {
    action: published ? 'resource.autopilot_published' : 'resource.autopilot_held',
    entityType: 'resource',
    entityId: resourceId,
    entityLabel: input.title ?? r.title,
    changes: { batchId: marker.batchId, applied, reasons },
  });
  return outcome;
}
