/**
 * Zip import end to end: upload → unpack (skipping junk and duplicates, classifying from
 * folder names) → processing → AI enrichment → autopilot publish or hold for review.
 */
import JSZip from 'jszip';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootTestApp, makePdf } from './setup';

let t: Awaited<ReturnType<typeof bootTestApp>>;

const LONG = Array.from(
  { length: 12 },
  (_, i) =>
    `Line ${i + 1}: the water cycle moves water through evaporation, condensation and precipitation.`,
);
const DESCRIPTION = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');

const fakeClient = (quality: {
  isEducational: boolean;
  safeForAds: boolean;
  containsPersonalData: boolean;
  isCommercialPublication?: boolean;
}) => ({
  parse: async () => ({
    stop_reason: 'end_turn',
    model: 'test-model',
    parsed_output: {
      title: 'P6 Science Water Cycle Past Paper',
      shortDescription: 'A Primary Six science past paper on the water cycle.',
      description: DESCRIPTION,
      keywords: ['water cycle', 'p6 science'],
      classSlug: null,
      subjectSlug: null,
      typeSlug: null,
      year: null,
      termSlug: null,
      topic: null,
      qualityNotes: null,
      ...quality,
    },
  }),
});

interface Detail {
  batch: { status: string; total: number; created: number; skipped: number; failed: number };
  resources: {
    path: string;
    status: string;
    reason?: string;
    resourceId?: string;
    resource: { id: string; status: string; title: string; reasons: string[] | null } | null;
  }[];
}

async function importZip(zip: JSZip, name: string) {
  const fd = new FormData();
  fd.set('zip', new Blob([new Uint8Array(await zip.generateAsync({ type: 'nodebuffer' }))]), name);
  const res = await t.app.request(
    '/api/admin/resources/zip-import',
    t.admin({ method: 'POST', body: fd }),
  );
  expect(res.status).toBe(202);
  const { batch } = (await res.json()) as { batch: { id: string } };
  const job = t.queued.findLast((j) => j.name === 'import-zip')!.data as {
    batchId: string;
    tempKey: string;
    actorId: string;
    actorName: string;
  };
  const { runZipImport } = await import('@edushare/resources');
  const { getRedis } = await import('@edushare/cache');
  await runZipImport(t.services.ctx, getRedis(), {
    batchId: job.batchId,
    tempKey: job.tempKey,
    actor: { id: job.actorId, name: job.actorName, permissions: [] },
    maxFileBytes: 50 * 1024 * 1024,
  });
  return { batchId: batch.id, ...(await batchDetail(batch.id)) };
}

async function batchDetail(id: string) {
  const res = await t.app.request(`/api/admin/resources/zip-imports/${id}`, t.admin());
  return (await res.json()) as Detail;
}

beforeAll(async () => {
  process.env.AI_AUTOPILOT = 'true';
  t = await bootTestApp();
}, 120_000);
afterAll(async () => {
  delete process.env.AI_AUTOPILOT;
  await t?.close();
});

describe('zip import', () => {
  it('rejects files that are not zips', async () => {
    const fd = new FormData();
    fd.set('zip', new Blob(['hello']), 'notes.txt');
    const res = await t.app.request(
      '/api/admin/resources/zip-import',
      t.admin({ method: 'POST', body: fd }),
    );
    expect(res.status).toBe(415);
  });

  it('imports documents, skips junk and duplicates, and classifies from folders', async () => {
    const pdf = await makePdf(LONG);
    const zip = new JSZip();
    zip.file('P6/Science/Past Papers/water cycle.pdf', pdf);
    zip.file('P6/Science/Past Papers/copy of water cycle.pdf', pdf);
    zip.file('P6/Science/.DS_Store', 'junk');
    zip.file('__MACOSX/P6/._water cycle.pdf', 'junk');
    zip.file('music/song.mp3', 'not a document');
    const d = await importZip(zip, 'term2.zip');

    expect(d.batch.status).toBe('done');
    expect(d.batch.created).toBe(1);
    expect(d.batch.failed).toBe(0);
    const reasons = d.resources.filter((r) => r.status === 'skipped').map((r) => r.reason);
    expect(reasons).toEqual(
      expect.arrayContaining([
        'already on the site (same file)',
        'system file',
        'unsupported file type (.mp3)',
      ]),
    );
    const created = d.resources.find((r) => r.status === 'created')!;
    expect(created.resource?.status).toBe('draft');

    const res = await t.app.request(`/api/admin/resources/${created.resourceId}`, t.admin());
    const resource = (await res.json()) as {
      class: { slug: string } | null;
      subject: { slug: string } | null;
      resourceType: { slug: string } | null;
    };
    expect(resource.class?.slug).toBe('p6');
    expect(resource.subject?.slug).toBe('science');
    expect(resource.resourceType?.slug).toBe('past-papers');
  });

  it('publishes an imported file when the AI checks pass', async () => {
    const zip = new JSZip();
    zip.file(
      'P6/Science/Past Papers/evaporation.pdf',
      await makePdf([...LONG, 'Evaporation paper']),
    );
    const d = await importZip(zip, 'good.zip');
    const id = d.resources.find((r) => r.status === 'created')!.resourceId!;

    await t.enrichResource(t.services.ctx, id, {
      client: fakeClient({
        isEducational: true,
        safeForAds: true,
        containsPersonalData: false,
      }) as never,
    });
    const res = await t.app.request(`/api/admin/resources/${id}`, t.admin());
    const r = (await res.json()) as { status: string; title: string; description: string };
    expect(r.status).toBe('published');
    expect(r.title).toBe('P6 Science Water Cycle Past Paper');
    expect(r.description).toBe(DESCRIPTION);
  });

  it('holds back a file with personal data and records why', async () => {
    const zip = new JSZip();
    zip.file('P6/Science/Past Papers/class list.pdf', await makePdf([...LONG, 'Class list']));
    const d = await importZip(zip, 'held.zip');
    const id = d.resources.find((r) => r.status === 'created')!.resourceId!;

    await t.enrichResource(t.services.ctx, id, {
      client: fakeClient({
        isEducational: true,
        safeForAds: true,
        containsPersonalData: true,
      }) as never,
    });
    const item = (await batchDetail(d.batchId)).resources.find((r) => r.resourceId === id)!;
    expect(item.resource?.status).toBe('draft');
    expect(item.resource?.reasons?.join(' ')).toMatch(/personal data/);
  });

  it('holds back a commercially published book (ISBN in the text)', async () => {
    const zip = new JSZip();
    zip.file(
      'P6/Science/Notes/textbook.pdf',
      await makePdf([
        ...LONG,
        'Published by Example Press. ISBN 978-0-19-912345-6. All rights reserved.',
      ]),
    );
    const d = await importZip(zip, 'book.zip');
    const id = d.resources.find((r) => r.status === 'created')!.resourceId!;
    await t.enrichResource(t.services.ctx, id, {
      client: fakeClient({
        isEducational: true,
        safeForAds: true,
        containsPersonalData: false,
      }) as never,
    });
    const item = (await batchDetail(d.batchId)).resources.find((r) => r.resourceId === id)!;
    expect(item.resource?.status).toBe('draft');
    expect(item.resource?.reasons?.join(' ')).toMatch(/commercially published/);
  });

  it('treats a re-run of a finished import as done (no duplicates, no failure)', async () => {
    const zip = new JSZip();
    zip.file('S1/Biology/Notes/cells.pdf', await makePdf([...LONG, 'Cells']));
    const d = await importZip(zip, 'rerun.zip');
    expect(d.batch.status).toBe('done');
    const job = t.queued.findLast((j) => j.name === 'import-zip')!.data as {
      batchId: string;
      tempKey: string;
      actorId: string;
      actorName: string;
    };
    const { runZipImport } = await import('@edushare/resources');
    const { getRedis } = await import('@edushare/cache');
    const again = await runZipImport(t.services.ctx, getRedis(), {
      batchId: job.batchId,
      tempKey: job.tempKey,
      actor: { id: job.actorId, name: job.actorName, permissions: [] },
      maxFileBytes: 50 * 1024 * 1024,
    });
    expect(again.status).toBe('done');
    expect(again.created).toBe(1);
    expect(again.failed).toBe(0);
  });

  it('accepts a zip uploaded in resumable chunks, including a retried chunk', async () => {
    const zip = new JSZip();
    zip.file('S2/Chemistry/Notes/atoms.pdf', await makePdf([...LONG, 'Atoms']));
    const buf = Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
    const start = await t.app.request(
      '/api/admin/resources/zip-uploads',
      t.admin({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fileName: 'chunked.zip', size: buf.length }),
      }),
    );
    expect(start.status).toBe(201);
    const { upload } = (await start.json()) as { upload: { id: string; totalChunks: number } };
    expect(upload.totalChunks).toBe(1);
    const put = (body: Uint8Array) =>
      t.app.request(
        `/api/admin/resources/zip-uploads/${upload.id}/chunks/0`,
        t.admin({
          method: 'PUT',
          headers: { 'content-type': 'application/octet-stream' },
          body,
        }),
      );
    // A truncated chunk (dropped connection) is rejected; the retry replaces it.
    expect((await put(new Uint8Array(buf.subarray(0, 100)))).status).toBe(400);
    const early = await t.app.request(
      `/api/admin/resources/zip-uploads/${upload.id}/complete`,
      t.admin({ method: 'POST' }),
    );
    expect(early.status).toBe(409);
    expect((await put(new Uint8Array(buf))).status).toBe(200);
    expect((await put(new Uint8Array(buf))).status).toBe(200);
    const done = await t.app.request(
      `/api/admin/resources/zip-uploads/${upload.id}/complete`,
      t.admin({ method: 'POST' }),
    );
    expect(done.status).toBe(202);
    const job = t.queued.findLast((j) => j.name === 'import-zip')!.data as { tempKey: string };
    const stored = await t.services.ctx.storage.read(job.tempKey);
    expect(Buffer.compare(stored, buf)).toBe(0);
  });
});
