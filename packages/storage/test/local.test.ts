import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalFilesystemStorageProvider, assertValidKey, buildKey, StorageKeyError } from '../src';

let root: string;
let storage: LocalFilesystemStorageProvider;

async function toBuffer(stream: Readable) {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c as Buffer));
  return Buffer.concat(chunks);
}

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'edushare-storage-'));
  storage = new LocalFilesystemStorageProvider({ root, accelPrefix: '/_protected' });
});
afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe('storage keys', () => {
  it('rejects traversal and absolute keys', () => {
    for (const bad of ['../etc/passwd', '/etc/passwd', 'resources/../../x', 'resources/./a', 'unknown/a.pdf', 'resources\\a', 'resources/a b.pdf']) {
      expect(() => assertValidKey(bad)).toThrow(StorageKeyError);
    }
  });
  it('builds date partitioned keys', () => {
    const key = buildKey('resources', 'PDF', new Date('2026-09-26T00:00:00Z'));
    expect(key).toMatch(/^resources\/2026\/09\/[0-9a-f-]{36}\.pdf$/);
    expect(() => assertValidKey(key)).not.toThrow();
  });
});

describe('LocalFilesystemStorageProvider', () => {
  it('uploads, reads ranges, moves and deletes', async () => {
    const key = 'temporary/test/a.txt';
    const meta = await storage.upload(key, Buffer.from('hello world'));
    expect(meta.size).toBe(11);
    expect(await storage.exists(key)).toBe(true);

    const opened = await storage.open(key, { start: 6, end: 100 });
    expect(opened.range).toEqual({ start: 6, end: 10 });
    expect((await toBuffer(opened.stream)).toString()).toBe('world');

    await storage.move(key, 'resources/test/b.txt');
    expect(await storage.exists(key)).toBe(false);
    expect((await storage.read('resources/test/b.txt')).toString()).toBe('hello world');
    expect(storage.accelRedirectPath('resources/test/b.txt')).toBe('/_protected/resources/test/b.txt');

    await storage.delete('resources/test/b.txt');
    expect(await storage.getMetadata('resources/test/b.txt')).toBeNull();
  });

  it('accepts streams and refuses overwrite when asked', async () => {
    await storage.upload('private/x.bin', Readable.from([Buffer.from('abc')]));
    await expect(storage.upload('private/x.bin', Buffer.from('z'), { noOverwrite: true })).rejects.toThrow();
  });
});
