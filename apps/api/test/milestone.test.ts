/**
 * End-to-end API test of the first milestone:
 * admin login → upload → processing → publish → search → resource page → preview →
 * free download → share → analytics → sitemap → unpublish → delete.
 * Requires PostgreSQL and Redis (uses the `edushare_test` database and Redis DB 15).
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';

const TEST_DB =
  process.env.TEST_DATABASE_URL ?? 'postgres://edushare:edushare@localhost:5432/edushare_test';
const UA = 'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 Mobile Safari/537.36';
const ADMIN = { email: 'admin@example.com', password: 'Correct-horse-42', name: 'Sarah Admin' };

let storageRoot: string;
let app: { request: (input: string, init?: RequestInit) => Response | Promise<Response> };
let cleanup: () => Promise<void>;
let cookie = '';
let csrf = '';
let pdf: Buffer;

async function makePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 3; i++) {
    doc
      .addPage([595, 842])
      .drawText(
        `Primary Six Social Studies Term II 2026. Name the largest lake in Uganda. Page ${i + 1}`,
        { x: 40, y: 780, size: 12, font },
      );
  }
  return Buffer.from(await doc.save());
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', 'user-agent': UA },
  body: JSON.stringify(body),
});
const admin = (init: RequestInit = {}): RequestInit => ({
  ...init,
  headers: {
    ...(init.headers as Record<string, string>),
    cookie,
    'x-csrf-token': csrf,
    origin: 'http://localhost:3001',
    'user-agent': UA,
  },
});

beforeAll(async () => {
  storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'edushare-api-test-'));
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DB,
    REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15',
    STORAGE_ROOT: storageRoot,
    ADMIN_ALLOWED_ORIGINS: 'http://localhost:3001',
    PUBLIC_SITE_URL: 'http://localhost:3000',
  });
  const { resetTestDatabase } = await import('../../../scripts/reset-test-db');
  await resetTestDatabase(TEST_DB, ADMIN);

  const { getRedis, closeRedis } = await import('@edushare/cache');
  await getRedis().flushdb();
  const { closeDb } = await import('@edushare/database');
  const { processFile } = await import('@edushare/resources');
  const { createServices } = await import('../src/services');
  const { createApp } = await import('../src/app');

  // Run background jobs inline so the test is deterministic.
  const services = createServices({
    enqueue: async (name, data) => {
      if (name === 'process-file')
        await processFile(services.ctx, (data as { fileId: string }).fileId);
      return true;
    },
  });
  app = createApp(services);
  pdf = await makePdf();
  cleanup = async () => {
    await closeRedis();
    await closeDb();
  };
});

afterAll(async () => {
  await cleanup?.();
  await fs.rm(storageRoot, { recursive: true, force: true });
});

describe('first milestone flow', () => {
  let resourceId = '';
  const slug = 'p6-social-studies-term-2-examination-2026';
  const ids: Record<string, string> = {};

  it('rejects bad credentials and logs in', async () => {
    const bad = await app.request(
      '/api/admin/auth/login',
      json({ email: ADMIN.email, password: 'nope' }),
    );
    expect(bad.status).toBe(401);
    const res = await app.request(
      '/api/admin/auth/login',
      json({ email: ADMIN.email, password: ADMIN.password }),
    );
    expect(res.status).toBe(200);
    cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]!;
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    csrf = ((await res.json()) as { admin: { csrfToken: string } }).admin.csrfToken;
    expect(csrf).toBeTruthy();
  });

  it('protects admin endpoints', async () => {
    expect((await app.request('/api/admin/resources')).status).toBe(401);
    const noCsrf = await app.request('/api/admin/resources/bulk', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: '{}',
    });
    expect(noCsrf.status).toBe(403);
  });

  it('loads taxonomy', async () => {
    const tax = (await (await app.request('/api/taxonomy')).json()) as {
      levels: { classes: { id: string; slug: string }[] }[];
      subjects: { id: string; slug: string }[];
      types: { id: string; slug: string }[];
      years: { id: string; year: number }[];
      terms: { id: string; slug: string }[];
    };
    ids.classId = tax.levels.flatMap((l) => l.classes).find((c) => c.slug === 'p6')!.id;
    ids.subjectId = tax.subjects.find((s) => s.slug === 'social-studies')!.id;
    ids.resourceTypeId = tax.types.find((t) => t.slug === 'past-papers')!.id;
    ids.academicYearId = tax.years.find((y) => y.year === 2026)!.id;
    ids.termId = tax.terms.find((t) => t.slug === 'term-2')!.id;
  });

  it('rejects files whose content does not match the extension', async () => {
    const fd = new FormData();
    fd.set('title', 'Fake PDF');
    fd.set('file', new Blob([Buffer.from('MZ\x90\x00 this is not a pdf')]), 'fake.pdf');
    const res = await app.request('/api/admin/resources', admin({ method: 'POST', body: fd }));
    expect(res.status).toBe(415);
  });

  it('uploads and processes a PDF', async () => {
    const fd = new FormData();
    fd.set(
      'metadata',
      JSON.stringify({
        title: 'P6 Social Studies Term 2 Examination 2026',
        description: 'End of term two examination.',
        tags: ['PLE', 'revision'],
        ...ids,
      }),
    );
    fd.set(
      'file',
      new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }),
      'P6 Social Studies Term 2 Examination 2026.pdf',
    );
    const res = await app.request('/api/admin/resources', admin({ method: 'POST', body: fd }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { resource: { id: string; slug: string; status: string } };
    resourceId = body.resource.id;
    expect(body.resource.slug).toBe(slug);
    expect(body.resource.status).toBe('draft');

    const detail = (await (
      await app.request(`/api/admin/resources/${resourceId}`, admin())
    ).json()) as {
      processing: { status: string; scanStatus: string };
      fileDetail: { pageCount: number };
      thumbnail: { variants: unknown[] } | null;
    };
    expect(detail.processing.status).toBe('ready');
    expect(detail.processing.scanStatus).toBe('skipped');
    expect(detail.fileDetail.pageCount).toBe(3);
    expect(detail.thumbnail?.variants.length).toBe(4);
  });

  it('keeps drafts private', async () => {
    expect((await app.request(`/api/resources/${slug}`)).status).toBe(404);
    const dl = await app.request(`/api/download/${slug}`);
    expect(dl.status).toBe(302);
    const search = (await (await app.request('/api/search?q=P6%20SST%20past%20paper')).json()) as {
      total: number;
    };
    expect(search.total).toBe(0);
  });

  it('publishes', async () => {
    const res = await app.request(
      `/api/admin/resources/${resourceId}/publish`,
      admin({ method: 'POST' }),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as { status: string }).status).toBe('published');
  });

  it('finds the resource by search, filters and landing page', async () => {
    for (const q of [
      'P6 SST past paper',
      'p6 social studies exam',
      'largest lake uganda',
      'p6 socail studies',
    ]) {
      const res = (await (await app.request(`/api/search?q=${encodeURIComponent(q)}`)).json()) as {
        total: number;
        items: { slug: string }[];
      };
      expect(res.total, q).toBeGreaterThan(0);
      expect(res.items[0]!.slug, q).toBe(slug);
    }
    const filtered = (await (
      await app.request(
        '/api/search?class=p6&subject=social-studies&type=past-papers&year=2026&term=term-2',
      )
    ).json()) as { total: number };
    expect(filtered.total).toBe(1);
    const other = (await (await app.request('/api/search?class=p7')).json()) as { total: number };
    expect(other.total).toBe(0);
    const landing = (await (
      await app.request('/api/landing?path=/p6/social-studies/past-papers')
    ).json()) as { landing: { title: string }; resources: { total: number } };
    expect(landing.resources.total).toBe(1);
    expect(landing.landing.title).toContain('P6 Social Studies Past Papers');
    const suggest = (await (await app.request('/api/search/suggest?q=p6%20so')).json()) as {
      items: { text: string }[];
    };
    expect(suggest.items.map((s) => s.text)).toContain('P6 Social Studies Past Papers');
  });

  it('serves the public resource and a range-capable preview', async () => {
    const res = (await (await app.request(`/api/resources/${slug}`)).json()) as {
      resource: { title: string; fileDetail: { previewable: string } };
    };
    expect(res.resource.title).toBe('P6 Social Studies Term 2 Examination 2026');
    expect(res.resource.fileDetail.previewable).toBe('pdf');
    const preview = await app.request(`/api/files/${slug}/preview`, {
      headers: { range: 'bytes=0-99' },
    });
    expect(preview.status).toBe(206);
    expect(preview.headers.get('content-range')).toMatch(/^bytes 0-99\//);
  });

  it('downloads for free and records one view, one download and one share', async () => {
    const dl = await app.request(`/api/download/${slug}`, { headers: { 'user-agent': UA } });
    expect(dl.status).toBe(200);
    expect(dl.headers.get('content-disposition')).toMatch(
      /^attachment; filename="P6 Social Studies Term 2 Examination 2026.pdf"/,
    );
    const bytes = Buffer.from(await dl.arrayBuffer());
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');

    // A repeated download from the same visitor within minutes is not double counted.
    await (
      await app.request(`/api/download/${slug}`, { headers: { 'user-agent': UA } })
    ).arrayBuffer();

    expect(
      (await app.request('/api/events', json({ type: 'resource_view', resourceId }))).status,
    ).toBe(200);
    expect(
      (await app.request('/api/events', json({ type: 'resource_view', resourceId }))).status,
    ).toBe(200);
    expect(
      (await app.request(`/api/resources/${resourceId}/share`, json({ channel: 'whatsapp' })))
        .status,
    ).toBe(200);
    // Link-preview bots are not counted.
    await app.request('/api/events', {
      ...json({ type: 'resource_view', resourceId }),
      headers: { 'content-type': 'application/json', 'user-agent': 'WhatsApp/2.23' },
    });

    const r = (await (await app.request(`/api/resources/${slug}`)).json()) as {
      resource: { viewCount: number; downloadCount: number; shareCount: number };
    };
    expect(r.resource).toMatchObject({ viewCount: 1, downloadCount: 1, shareCount: 1 });

    await app.request(
      '/api/events',
      json({ type: 'search', props: { q: 'P6 SST past paper', results: 1 } }),
    );
    await app.request(
      '/api/events',
      json({ type: 'search_no_result', props: { q: 'senior 3 agriculture project', results: 0 } }),
    );
    const report = (await (
      await app.request('/api/admin/analytics/dashboard?days=7', admin())
    ).json()) as {
      today: { views: number; downloads: number; shares: number; searches: number };
      noResultSearches: { query: string }[];
    };
    expect(report.today).toMatchObject({ views: 1, downloads: 1, shares: 1, searches: 2 });
    expect(report.noResultSearches[0]?.query).toBe('s3 agriculture project');
  });

  it('includes the resource in the sitemap and related data', async () => {
    const index = (await (await app.request('/api/seo/sitemap')).json()) as {
      items: { name: string }[];
    };
    expect(index.items.map((i) => i.name)).toContain('resources-1');
    const urls = (await (await app.request('/api/seo/sitemap/resources-1')).json()) as {
      items: { loc: string }[];
    };
    expect(urls.items.map((u) => u.loc)).toContain(`/resources/${slug}`);
    const landing = (await (await app.request('/api/seo/sitemap/landing')).json()) as {
      items: { loc: string }[];
    };
    expect(landing.items.map((u) => u.loc)).toContain('/p6/social-studies/past-papers');
  });

  it('unpublishes: hidden from search, page reports unavailable', async () => {
    expect(
      (await app.request(`/api/admin/resources/${resourceId}/unpublish`, admin({ method: 'POST' })))
        .status,
    ).toBe(200);
    expect((await app.request(`/api/resources/${slug}`)).status).toBe(410);
    const s = (await (await app.request('/api/search?q=P6%20SST%20past%20paper')).json()) as {
      total: number;
    };
    expect(s.total).toBe(0);
  });

  it('deletes and records an audit trail', async () => {
    expect(
      (await app.request(`/api/admin/resources/${resourceId}`, admin({ method: 'DELETE' }))).status,
    ).toBe(200);
    expect((await app.request(`/api/resources/${slug}`)).status).toBe(404);
    const audit = (await (
      await app.request('/api/admin/audit?entityType=resource', admin())
    ).json()) as { items: { action: string; adminName: string }[] };
    const actions = audit.items.map((a) => a.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'resource.upload',
        'resource.publish',
        'resource.unpublish',
        'resource.delete',
      ]),
    );
    expect(audit.items.find((a) => a.action === 'resource.publish')?.adminName).toBe('Sarah Admin');
  });
});
