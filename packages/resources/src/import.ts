import ExcelJS from 'exceljs';
import { eq } from '@edushare/database';
import { resources } from '@edushare/database/schema';
import {
  buildPhraseIndex,
  expandNumberWords,
  loadVocabulary,
  normalizeQuery,
  type Vocabulary,
} from '@edushare/search';
import { AppError, resourceMetadataSchema, type ResourceMetadataInput } from '@edushare/shared';

/** Columns understood by the metadata import (case-insensitive, spaces/underscores ignored). */
export const IMPORT_COLUMNS = [
  'file_name',
  'slug',
  'title',
  'description',
  'short_description',
  'class',
  'subject',
  'type',
  'year',
  'term',
  'topic',
  'subtopic',
  'curriculum',
  'tags',
  'keywords',
  'author',
  'publisher',
  'featured',
  'status',
  'seo_title',
  'seo_description',
] as const;
type Column = (typeof IMPORT_COLUMNS)[number];

export const IMPORT_TEMPLATE_CSV =
  IMPORT_COLUMNS.join(',') +
  '\n' +
  'P7 SST Mock 2026.pdf,,P7 Social Studies Mock Examination 2026,Mock examination for P7 candidates.,,P7,Social Studies,Mock Paper,2026,Term 2,,,,PLE; revision,,,,no,draft,,\n' +
  ',p6-science-notes-term-1,,,Updated short description,,,,,,Photosynthesis,,,,,,,yes,,,\n';

export type ImportRow = Partial<Record<Column, string>>;

export interface ResolvedImportRow {
  row: number;
  fileName: string | null;
  slug: string | null;
  existingId: string | null;
  metadata: Partial<ResourceMetadataInput>;
  labels: Record<string, string>;
  errors: string[];
  warnings: string[];
}

const HEADER_ALIASES: Record<string, Column> = {
  file: 'file_name',
  filename: 'file_name',
  name: 'title',
  class_name: 'class',
  level_class: 'class',
  resource_type: 'type',
  resourcetype: 'type',
  academic_year: 'year',
  shortdescription: 'short_description',
  summary: 'short_description',
};

function headerKey(h: string): Column | null {
  const k = h
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if ((IMPORT_COLUMNS as readonly string[]).includes(k)) return k as Column;
  return HEADER_ALIASES[k] ?? HEADER_ALIASES[k.replace(/_/g, '')] ?? null;
}

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, CRLF, BOM). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const s = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]!;
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

async function readXlsx(buffer: Buffer): Promise<string[][]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = wb.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (r) => {
    const values = (r.values as ExcelJS.CellValue[]).slice(1).map((v) => {
      if (v === null || v === undefined) return '';
      if (v instanceof Date) return String(v.getFullYear());
      if (typeof v === 'object' && 'text' in v) return String(v.text);
      if (typeof v === 'object' && 'result' in v) return String(v.result ?? '');
      if (typeof v === 'object' && 'richText' in v) return v.richText.map((t) => t.text).join('');
      return String(v);
    });
    rows.push(values);
  });
  return rows;
}

/** Parses a CSV or XLSX metadata sheet into row objects keyed by known columns. */
export async function parseImportSheet(buffer: Buffer, fileName: string): Promise<ImportRow[]> {
  const isXlsx = /\.xlsx$/i.test(fileName) || buffer.subarray(0, 2).toString() === 'PK';
  const grid = isXlsx ? await readXlsx(buffer) : parseCsv(buffer.toString('utf8'));
  if (grid.length < 2)
    throw AppError.badRequest('The spreadsheet needs a header row and at least one data row.');
  const headers = grid[0]!.map(headerKey);
  if (!headers.includes('file_name') && !headers.includes('slug')) {
    throw AppError.badRequest('Add a "file_name" column (or "slug" to update existing resources).');
  }
  if (grid.length > 1001) throw AppError.badRequest('Import at most 1000 rows at a time.');
  return grid.slice(1).map((cells) => {
    const row: ImportRow = {};
    headers.forEach((h, i) => {
      const v = cells[i]?.trim();
      if (h && v) row[h] = v;
    });
    return row;
  });
}

function lookup(v: Vocabulary, kind: 'class' | 'subject' | 'type' | 'term', value: string) {
  const index = buildPhraseIndex(v);
  const norm = expandNumberWords(normalizeQuery(value));
  const bySlug = { class: v.classes, subject: v.subjects, type: v.types, term: v.terms }[kind].find(
    (e) => e.slug === value.toLowerCase(),
  );
  if (bySlug) return bySlug;
  const hit = index.get(norm);
  return hit && hit.kind === kind ? hit.entry : undefined;
}

const list = (s?: string) =>
  s
    ? s
        .split(/[;,|]/)
        .map((x) => x.trim())
        .filter(Boolean)
    : undefined;
const yes = (s?: string) => (s ? /^(y|yes|true|1|x)$/i.test(s) : undefined);

/** Validates rows and resolves human-friendly values ("P6", "SST", "Past Paper") to ids. */
export async function resolveImportRows(
  ctx: { db: import('@edushare/database').Database },
  rows: ImportRow[],
): Promise<ResolvedImportRow[]> {
  const v = await loadVocabulary(ctx.db);
  const out: ResolvedImportRow[] = [];
  const seenFiles = new Set<string>();
  for (const [i, r] of rows.entries()) {
    const res: ResolvedImportRow = {
      row: i + 2,
      fileName: r.file_name ?? null,
      slug: r.slug ?? null,
      existingId: null,
      metadata: {},
      labels: {},
      errors: [],
      warnings: [],
    };
    const m = res.metadata;
    if (r.file_name) {
      const key = r.file_name.toLowerCase();
      if (seenFiles.has(key)) res.errors.push(`Duplicate file_name "${r.file_name}"`);
      seenFiles.add(key);
    }
    if (r.slug && !r.file_name) {
      const existing = await ctx.db.query.resources.findFirst({
        where: eq(resources.slug, r.slug),
        columns: { id: true, title: true },
      });
      if (!existing) res.errors.push(`No resource with slug "${r.slug}"`);
      else {
        res.existingId = existing.id;
        res.labels.existing = existing.title;
      }
    } else if (r.slug) m.slug = r.slug;
    if (r.title) m.title = r.title;
    if (r.description) m.description = r.description;
    if (r.short_description) m.shortDescription = r.short_description;
    for (const [col, kind, field] of [
      ['class', 'class', 'classId'],
      ['subject', 'subject', 'subjectId'],
      ['type', 'type', 'resourceTypeId'],
      ['term', 'term', 'termId'],
    ] as const) {
      const val = r[col];
      if (!val) continue;
      const e = lookup(v, kind, val);
      if (e) {
        m[field] = e.id;
        res.labels[col] = e.label;
      } else res.errors.push(`Unknown ${col} "${val}"`);
    }
    if (r.year) {
      const y = v.years.find((x) => String(x.year) === r.year!.replace(/\D/g, ''));
      if (y) {
        m.academicYearId = y.id;
        res.labels.year = String(y.year);
      } else res.errors.push(`Unknown year "${r.year}" (add it under Academic years first)`);
    }
    if (r.curriculum) {
      const c = v.curricula.find(
        (x) =>
          x.slug === r.curriculum!.toLowerCase() ||
          x.name.toLowerCase() === r.curriculum!.toLowerCase(),
      );
      if (c) m.curriculumId = c.id;
      else res.warnings.push(`Unknown curriculum "${r.curriculum}" (ignored)`);
    }
    if (r.topic) {
      const t = v.topics.find(
        (x) => x.name.toLowerCase() === r.topic!.toLowerCase() || x.slug === r.topic!.toLowerCase(),
      );
      if (t) m.topicId = t.id;
      else m.topic = r.topic;
    }
    if (r.subtopic) m.subtopic = r.subtopic;
    if (r.tags) m.tags = list(r.tags);
    if (r.keywords) m.keywords = list(r.keywords);
    if (r.author) m.author = r.author;
    if (r.publisher) m.publisher = r.publisher;
    if (r.featured) m.featured = yes(r.featured);
    if (r.seo_title) m.seoTitle = r.seo_title;
    if (r.seo_description) m.seoDescription = r.seo_description;
    if (r.status) {
      const s = r.status.toLowerCase();
      if (s === 'draft' || s === 'review' || s === 'published') m.status = s;
      else res.errors.push(`Status must be draft, review or published (got "${r.status}")`);
    }
    if (!r.file_name && !res.existingId && !res.errors.length)
      res.errors.push('Row needs a file_name or an existing slug');
    // Validate field shapes with the same schema the API uses.
    const check = resourceMetadataSchema.partial().safeParse(m);
    if (!check.success)
      for (const issue of check.error.issues)
        res.errors.push(`${issue.path.join('.')}: ${issue.message}`);
    out.push(res);
  }
  return out;
}
