/**
 * S3StorageProvider against a real S3-compatible server (MinIO, SeaweedFS…).
 * Skipped unless S3_TEST_ENDPOINT is set.
 */
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';
import { beforeAll, describe, expect, it } from 'vitest';
import { S3StorageProvider, StorageNotFoundError, withLocalCopy, readObjectHead } from '../src';
import fs from 'node:fs/promises';

const endpoint = process.env.S3_TEST_ENDPOINT;
const run = endpoint ? describe : describe.skip;

run('S3StorageProvider', () => {
  const bucket = process.env.S3_TEST_BUCKET ?? 'edushare-test';
  const opts = { bucket, endpoint, region: 'us-east-1', forcePathStyle: true, accessKeyId: process.env.S3_TEST_KEY ?? 'edushare', secretAccessKey: process.env.S3_TEST_SECRET ?? 'edushare-secret' };
  const storage = new S3StorageProvider(opts);

  beforeAll(async () => {
    const client = new S3Client({ endpoint, region: 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey } });
    await client.send(new CreateBucketCommand({ Bucket: bucket })).catch(() => undefined); // may already exist
  });

  it('uploads buffers and streams, reads ranges, moves and deletes', async () => {
    await storage.upload('temporary/a.txt', Buffer.from('hello world'), { contentType: 'text/plain' });
    await storage.upload('temporary/b.txt', Readable.from([Buffer.from('streamed body')]));
    expect((await storage.getMetadata('temporary/a.txt'))?.size).toBe(11);
    const opened = await storage.open('temporary/a.txt', { start: 6, end: 10 });
    expect(opened.size).toBe(11);
    expect(opened.range).toEqual({ start: 6, end: 10 });
    const chunks: Buffer[] = [];
    for await (const c of opened.stream) chunks.push(Buffer.from(c as Buffer));
    expect(Buffer.concat(chunks).toString()).toBe('world');
    expect((await readObjectHead(storage, 'temporary/b.txt', 8)).toString()).toBe('streamed');

    await storage.move('temporary/a.txt', 'resources/2026/09/a.txt');
    expect(await storage.exists('temporary/a.txt')).toBe(false);
    expect((await storage.read('resources/2026/09/a.txt')).toString()).toBe('hello world');
    expect((await storage.list('resources')).map((o) => o.key)).toContain('resources/2026/09/a.txt');
    const local = await withLocalCopy(storage, 'resources/2026/09/a.txt', async (p) => fs.readFile(p, 'utf8'));
    expect(local).toBe('hello world');

    const url = await storage.presignedUrl('resources/2026/09/a.txt', { fileName: 'A test.txt' });
    const res = await fetch(url);
    expect(await res.text()).toBe('hello world');
    expect(res.headers.get('content-disposition')).toContain('attachment');

    await storage.delete('resources/2026/09/a.txt');
    expect(await storage.getMetadata('resources/2026/09/a.txt')).toBeNull();
    await expect(storage.open('resources/2026/09/a.txt')).rejects.toBeInstanceOf(StorageNotFoundError);
  });

  it('still rejects unsafe keys', async () => {
    await expect(storage.upload('../etc/passwd', Buffer.from('x'))).rejects.toThrow();
  });
});
