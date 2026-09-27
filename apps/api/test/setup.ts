import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { ProcessOptions } from '@edushare/resources';

export const TEST_DB =
  process.env.TEST_DATABASE_URL ?? 'postgres://edushare:edushare@localhost:5432/edushare_test';
export const UA =
  'Mozilla/5.0 (Linux; Android 13; SM-A135F) AppleWebKit/537.36 Mobile Safari/537.36';
export const ADMIN = {
  email: 'admin@example.com',
  password: 'Correct-horse-42',
  name: 'Sarah Admin',
};

export type TestApp = {
  request: (input: string, init?: RequestInit) => Response | Promise<Response>;
};

export async function makePdf(lines: string[], pages = 1): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let p = 0; p < pages; p++) {
    const page = doc.addPage([595, 842]);
    lines.forEach((l, i) => page.drawText(l, { x: 40, y: 780 - i * 20, size: 12, font }));
  }
  return Buffer.from(await doc.save());
}

/** Boots the API against a fresh test database with background jobs run inline. */
export async function bootTestApp(processOptions: ProcessOptions = {}) {
  const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'edushare-api-test-'));
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
  const { processFile, enrichResource } = await import('@edushare/resources');
  const { createServices } = await import('../src/services');
  const { createApp } = await import('../src/app');
  const jobs: string[] = [];
  /** Payloads of every enqueued job, for tests that run other jobs by hand. */
  const queued: { name: string; data: unknown }[] = [];
  const services = createServices({
    enqueue: async (name, data) => {
      jobs.push(name);
      queued.push({ name, data });
      if (name === 'process-file')
        await processFile(services.ctx, (data as { fileId: string }).fileId, processOptions);
      return true;
    },
  });
  const app: TestApp = createApp(services);

  const login = await app.request('/api/admin/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': UA },
    body: JSON.stringify({ email: ADMIN.email, password: ADMIN.password }),
  });
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]!;
  const csrf = ((await login.json()) as { admin: { csrfToken: string } }).admin.csrfToken;
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
  const json = (body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': UA },
    body: JSON.stringify(body),
  });

  return {
    app,
    services,
    admin,
    json,
    jobs,
    queued,
    storageRoot,
    enrichResource,
    async close() {
      await closeRedis();
      await closeDb();
      await fs.rm(storageRoot, { recursive: true, force: true });
    },
  };
}
