/**
 * Integration tests for the second feature set: auto-classification, spreadsheet import,
 * Office previews, AI suggestions, reports, and HTTP 410 for unpublished resources.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootTestApp, makePdf } from './setup';

let t: Awaited<ReturnType<typeof bootTestApp>>;
let officePdf: string;

async function makeDocx(text: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

const upload = async (file: Buffer, name: string, meta: Record<string, unknown>) => {
  const fd = new FormData();
  fd.set('metadata', JSON.stringify(meta));
  fd.set('file', new Blob([new Uint8Array(file)]), name);
  const res = await t.app.request('/api/admin/resources', t.admin({ method: 'POST', body: fd }));
  return {
    status: res.status,
    body: (await res.json()) as {
      resource: { id: string; slug: string };
      error?: { message: string };
    },
  };
};
const get = async <T>(url: string, init?: RequestInit) =>
  (await (await t.app.request(url, init)).json()) as T;

beforeAll(async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'edushare-office-pdf-'));
  officePdf = path.join(dir, 'rendition.pdf');
  await fs.writeFile(officePdf, await makePdf(['Scheme of work rendered by LibreOffice'], 2));
  // Stand-in for LibreOffice: returns a fresh copy of a PDF rendition.
  t = await bootTestApp({
    convertToPdf: async () => {
      const out = path.join(dir, `${Date.now()}-${Math.random()}.pdf`);
      await fs.copyFile(officePdf, out);
      return out;
    },
  });
});
afterAll(async () => t?.close());

describe('auto-classification', () => {
  it('suggests classification from a title', async () => {
    const res = await get<{ labels: Record<string, string> }>(
      '/api/admin/resources/classify',
      t.admin({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: 'P7 SST Mock Examination Term II 2026' }),
      }),
    );
    expect(res.labels).toMatchObject({
      classId: 'P7',
      subjectId: 'Social Studies',
      resourceTypeId: 'Mock Paper',
      termId: 'Term 2',
      academicYearId: '2026',
    });
  });

  it('fills empty fields from the document header during processing', async () => {
    const pdf = await makePdf([
      'PRIMARY SIX END OF TERM II EXAMINATION 2026',
      'SCIENCE',
      'Explain the process of photosynthesis.',
    ]);
    const { body } = await upload(pdf, 'exam.pdf', { title: 'Science exam' });
    const r = await get<{
      class: { slug: string };
      term: { slug: string };
      academicYear: { year: number };
      topic: { name: string } | null;
      resourceType: { slug: string };
    }>(`/api/admin/resources/${body.resource.id}`, t.admin());
    expect(r.class.slug).toBe('p6');
    expect(r.term.slug).toBe('term-2');
    expect(r.academicYear.year).toBe(2026);
    expect(r.resourceType.slug).toBe('past-papers');
    expect(r.topic?.name).toBe('Photosynthesis');
  });
});

describe('Office documents', () => {
  it('stores a PDF rendition, serves it as the preview and uses its page count', async () => {
    const { status, body } = await upload(
      await makeDocx('P5 Mathematics scheme of work fractions'),
      'P5 Maths Scheme.docx',
      { title: 'P5 Mathematics Scheme of Work Term 1' },
    );
    expect(status).toBe(201);
    await t.app.request(
      `/api/admin/resources/${body.resource.id}/publish`,
      t.admin({ method: 'POST' }),
    );
    const pub = await get<{
      resource: { fileDetail: { previewable: string; pageCount: number; extension: string } };
    }>(`/api/resources/${body.resource.slug}`);
    expect(pub.resource.fileDetail).toMatchObject({
      previewable: 'pdf',
      pageCount: 2,
      extension: 'docx',
    });
    const preview = await t.app.request(`/api/files/${body.resource.slug}/preview`);
    expect(preview.status).toBe(200);
    expect(preview.headers.get('content-type')).toBe('application/pdf');
    // The download is still the original Word file.
    const dl = await t.app.request(`/api/download/${body.resource.slug}`, {
      headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/120' },
    });
    expect(dl.headers.get('content-type')).toContain('wordprocessingml');
  });
});

describe('spreadsheet import', () => {
  const csv = [
    'file_name,title,class,subject,type,year,term,tags,status',
    'p7-sst.pdf,P7 SST Revision Questions,Primary 7,SST,Revision Material,2026,Term 3,PLE; revision,draft',
    'missing.pdf,Missing file,P7,English,Notes,2026,,,',
    'bad.pdf,Bad row,P9,Alchemy,Notes,2031,,,',
  ].join('\n');

  it('validates rows and resolves friendly names', async () => {
    const fd = new FormData();
    fd.set('sheet', new Blob([csv]), 'import.csv');
    const res = await get<{
      rows: { row: number; errors: string[]; labels: Record<string, string> }[];
      valid: number;
      invalid: number;
    }>('/api/admin/resources/import/validate', t.admin({ method: 'POST', body: fd }));
    expect(res.valid).toBe(2);
    expect(res.invalid).toBe(1);
    expect(res.rows[0]!.labels).toMatchObject({
      class: 'P7',
      subject: 'Social Studies',
      type: 'Revision Materials',
      term: 'Term 3',
    });
    expect(res.rows[2]!.errors.join(' ')).toMatch(
      /Unknown class "P9".*Unknown subject "Alchemy".*Unknown year "2031"/,
    );
  });

  it('imports matched files and reports the rest', async () => {
    const fd = new FormData();
    fd.set('sheet', new Blob([csv]), 'import.csv');
    fd.append('files', new Blob([new Uint8Array(await makePdf(['P7 revision']))]), 'P7-SST.pdf');
    fd.append('files', new Blob([new Uint8Array(await makePdf(['extra']))]), 'extra.pdf');
    const res = await get<{
      results: { row: number; ok: boolean; action: string; id?: string; error?: string }[];
      unmatchedFiles: string[];
    }>('/api/admin/resources/import', t.admin({ method: 'POST', body: fd }));
    expect(res.results.map((r) => r.action)).toEqual(['created', 'skipped', 'skipped']);
    expect(res.results[1]!.error).toContain('was not included');
    expect(res.unmatchedFiles).toEqual(['extra.pdf']);
    const r = await get<{
      tags: { name: string }[];
      class: { slug: string };
      subject: { slug: string };
    }>(`/api/admin/resources/${res.results[0]!.id}`, t.admin());
    expect(r.class.slug).toBe('p7');
    expect(r.subject.slug).toBe('social-studies');
    expect(r.tags.map((x) => x.name).sort()).toEqual(['PLE', 'revision']);
  });

  it('serves a CSV template', async () => {
    const res = await t.app.request('/api/admin/resources/import/template', t.admin());
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(await res.text()).toMatch(/^file_name,slug,title/);
  });
});

describe('AI suggestions (mocked Claude client)', () => {
  it('stores suggestions and applies selected fields', async () => {
    const { body } = await upload(
      await makePdf(
        Array.from(
          { length: 12 },
          (_, i) => `Lesson ${i + 1}: the water cycle, evaporation and rain.`,
        ),
      ),
      'water.pdf',
      { title: 'Water cycle notes' },
    );
    const client = {
      parse: async () => ({
        stop_reason: 'end_turn',
        model: 'claude-opus-5',
        parsed_output: {
          shortDescription: 'Notes explaining evaporation, condensation and precipitation.',
          description: 'Primary Five science notes on the water cycle.',
          keywords: ['water cycle', 'evaporation'],
          classSlug: 'p5',
          subjectSlug: 'science',
          typeSlug: 'notes',
          year: null,
          termSlug: null,
          topic: 'Weather and Climate',
        },
      }),
    };
    const suggestion = await t.enrichResource(t.services.ctx, body.resource.id, {
      client: client as never,
    });
    expect(suggestion?.ids.classId).toBeTruthy();
    const applied = await get<{
      class: { slug: string };
      shortDescription: string;
      keywords: string[];
    }>(
      `/api/admin/resources/${body.resource.id}/suggestions/apply`,
      t.admin({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: 'ai', fields: ['classId', 'shortDescription', 'keywords'] }),
      }),
    );
    expect(applied.class.slug).toBe('p5');
    expect(applied.shortDescription).toContain('evaporation');
    expect(applied.keywords).toContain('water cycle');
  });

  it('refuses to run when AI is not configured', async () => {
    const res = await t.app.request(
      '/api/admin/resources/00000000-0000-0000-0000-000000000000/enrich',
      t.admin({ method: 'POST' }),
    );
    expect(res.status).toBe(400);
  });
});

describe('reports and status', () => {
  it('exports no-result searches as CSV and lists SEO suggestions', async () => {
    await t.app.request(
      '/api/events',
      t.json({
        type: 'search_no_result',
        props: { q: '=HYPERLINK("x") senior 3 agric project', results: 0 },
      }),
    );
    const csv = await (
      await t.app.request('/api/admin/reports/no-results?days=7&format=csv', t.admin())
    ).text();
    expect(csv.split('\n')[0]).toBe('query,searches,visitors,last_searched');
    expect(csv).toContain('s3 agric project');
    const seo = await get<{ items: { path: string; hasOverride: boolean }[] }>(
      '/api/admin/seo/suggestions',
      t.admin(),
    );
    expect(seo.items.map((i) => i.path)).toContain('/p5/mathematics/schemes-of-work');
    const features = await get<{ search: string; ai: boolean }>(
      '/api/admin/system/features',
      t.admin(),
    );
    expect(features).toMatchObject({ search: 'postgres', ai: false });
  });

  it('reports gone status for unpublished resources', async () => {
    const { body } = await upload(await makePdf(['x']), 'x.pdf', { title: 'Temporary resource' });
    await t.app.request(
      `/api/admin/resources/${body.resource.id}/publish`,
      t.admin({ method: 'POST' }),
    );
    expect(
      (await get<{ status: string }>(`/api/resources/${body.resource.slug}/status`)).status,
    ).toBe('published');
    await t.app.request(
      `/api/admin/resources/${body.resource.id}/unpublish`,
      t.admin({ method: 'POST' }),
    );
    expect(
      (await get<{ status: string }>(`/api/resources/${body.resource.slug}/status`)).status,
    ).toBe('gone');
    expect((await get<{ status: string }>('/api/resources/nope/status')).status).toBe('missing');
  });
});
