/**
 * The upload → process → publish → preview → download flow on S3-compatible storage.
 * Skipped unless S3_TEST_ENDPOINT is set.
 */
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootTestApp, makePdf } from './setup';

const endpoint = process.env.S3_TEST_ENDPOINT;
const run = endpoint ? describe : describe.skip;

run('S3 storage end-to-end', () => {
  let t: Awaited<ReturnType<typeof bootTestApp>>;
  const bucket = process.env.S3_TEST_BUCKET ?? 'edushare-test';

  beforeAll(async () => {
    const creds = {
      accessKeyId: process.env.S3_TEST_KEY ?? 'edushare',
      secretAccessKey: process.env.S3_TEST_SECRET ?? 'edushare-secret',
    };
    await new S3Client({ endpoint, region: 'us-east-1', forcePathStyle: true, credentials: creds })
      .send(new CreateBucketCommand({ Bucket: bucket }))
      .catch(() => undefined); // may already exist
    Object.assign(process.env, {
      STORAGE_DRIVER: 's3',
      S3_BUCKET: bucket,
      S3_ENDPOINT: endpoint,
      S3_REGION: 'us-east-1',
      S3_FORCE_PATH_STYLE: 'true',
      S3_ACCESS_KEY_ID: creds.accessKeyId,
      S3_SECRET_ACCESS_KEY: creds.secretAccessKey,
      S3_PRESIGNED_DOWNLOADS: 'true',
    });
    t = await bootTestApp();
  });
  afterAll(async () => t?.close());

  it('stores, processes and serves files from the bucket', async () => {
    const fd = new FormData();
    fd.set('metadata', JSON.stringify({ title: 'P4 English Holiday Package 2026' }));
    fd.set(
      'file',
      new Blob([new Uint8Array(await makePdf(['Holiday work: comprehension and grammar.'], 2))]),
      'holiday.pdf',
    );
    const res = await t.app.request('/api/admin/resources', t.admin({ method: 'POST', body: fd }));
    expect(res.status).toBe(201);
    const { resource } = (await res.json()) as { resource: { id: string; slug: string } };

    const detail = (await (
      await t.app.request(`/api/admin/resources/${resource.id}`, t.admin())
    ).json()) as {
      processing: { status: string };
      fileDetail: { pageCount: number };
      thumbnail: { src: string } | null;
      class: { slug: string } | null;
    };
    expect(detail.processing.status).toBe('ready');
    expect(detail.fileDetail.pageCount).toBe(2);
    expect(detail.class?.slug).toBe('p4'); // auto-classified from the title
    const thumb = await t.app.request(detail.thumbnail!.src);
    expect(thumb.headers.get('content-type')).toBe('image/webp');

    await t.app.request(`/api/admin/resources/${resource.id}/publish`, t.admin({ method: 'POST' }));
    const preview = await t.app.request(`/api/files/${resource.slug}/preview`, {
      headers: { range: 'bytes=0-4' },
    });
    expect(preview.status).toBe(206);
    expect(await preview.text()).toBe('%PDF-');

    // Downloads are tracked, then redirected to a short-lived signed URL.
    const dl = await t.app.request(`/api/download/${resource.slug}`, {
      headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 13) Mobile Safari' },
    });
    expect(dl.status).toBe(302);
    const signed = await fetch(dl.headers.get('location')!);
    expect((await signed.arrayBuffer()).byteLength).toBeGreaterThan(500);
    const pub = (await (await t.app.request(`/api/resources/${resource.slug}`)).json()) as {
      resource: { downloadCount: number };
    };
    expect(pub.resource.downloadCount).toBe(1);
  });
});
