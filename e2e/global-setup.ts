import fs from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { resetTestDatabase } from '../scripts/reset-test-db';

export default async function globalSetup() {
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgres://edushare:edushare@localhost:5432/edushare_test';
  await resetTestDatabase(url, {
    email: 'admin@example.com',
    password: 'ChangeMe!2026',
    name: 'Sarah Admin',
  });
  await fs.rm('test-results/storage', { recursive: true, force: true });
  await fs.mkdir('test-results/storage', { recursive: true });
  try {
    execSync(`redis-cli -u ${process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/14'} FLUSHDB`, {
      stdio: 'ignore',
    });
  } catch {
    /* redis-cli not installed: stale cache keys are namespaced and harmless */
  }
  execSync('node scripts/copy-pdfjs.mjs', { stdio: 'ignore', cwd: 'apps/web' });
}
