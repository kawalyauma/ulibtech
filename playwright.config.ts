import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run the whole stack on dedicated ports against the `edushare_test`
 * database (reset in global setup) so they never touch development data.
 */
const P = { api: 4100, web: 3100, admin: 3101 };
const env = {
  NODE_ENV: 'development',
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ?? 'postgres://edushare:edushare@localhost:5432/edushare_test',
  REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/14',
  STORAGE_ROOT: process.env.E2E_STORAGE_ROOT ?? `${process.cwd()}/test-results/storage`,
  API_PORT: String(P.api),
  API_INTERNAL_URL: `http://localhost:${P.api}`,
  WEB_INTERNAL_URL: `http://localhost:${P.web}`,
  PUBLIC_SITE_URL: `http://localhost:${P.web}`,
  ADMIN_SITE_URL: `http://localhost:${P.admin}`,
  ADMIN_ALLOWED_ORIGINS: `http://localhost:${P.admin}`,
  NEXT_PUBLIC_SITE_URL: `http://localhost:${P.web}`,
  REVALIDATE_SECRET: 'e2e-revalidate-secret',
  ANALYTICS_SALT: 'e2e-analytics-salt',
  RATE_LIMIT_DISABLED: 'true',
  NEXT_DIST_DIR: '.next-e2e',
  NEXT_TELEMETRY_DISABLED: '1',
};

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: `http://localhost:${P.web}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Pixel 7'],
  },
  webServer: [
    {
      command: 'pnpm --filter @edushare/api exec tsx src/index.ts',
      url: `http://localhost:${P.api}/health`,
      env,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @edushare/worker exec tsx src/index.ts',
      env,
      reuseExistingServer: false,
      wait: { stdout: /worker\] started/ },
      timeout: 60_000,
    },
    {
      command: `pnpm --filter @edushare/web exec next dev -p ${P.web}`,
      url: `http://localhost:${P.web}/robots.txt`,
      env,
      reuseExistingServer: false,
      timeout: 180_000,
    },
    {
      command: `pnpm --filter @edushare/admin exec next dev -p ${P.admin}`,
      url: `http://localhost:${P.admin}/login`,
      env,
      reuseExistingServer: false,
      timeout: 180_000,
    },
  ],
});

export const E2E_PORTS = P;
export const E2E_ENV = env;
