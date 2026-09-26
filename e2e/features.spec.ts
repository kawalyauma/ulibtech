import fs from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const ADMIN = 'http://localhost:3101';
const FIXTURE = path.resolve('e2e/fixtures/P6 Social Studies Term 2 Examination 2026.pdf');

test.describe.serial('spreadsheet import, trending pages and 410', () => {
  test('admin imports resources from a CSV sheet and they are published automatically', async ({
    page,
  }) => {
    const dir = await fs.mkdtemp('test-results/import-');
    const pdf = path.join(dir, 'p7-sst-mock.pdf');
    await fs.copyFile(FIXTURE, pdf);
    const csv = path.join(dir, 'import.csv');
    await fs.writeFile(
      csv,
      'file_name,title,class,subject,type,year,term,tags,status\np7-sst-mock.pdf,P7 SST Mock Examination 2026,P7,SST,Mock Paper,2026,Term 2,PLE,published\n',
    );

    await page.goto(`${ADMIN}/uploads/import`);
    await page.getByLabel('Email').fill('admin@example.com');
    await page.getByLabel('Password').fill('ChangeMe!2026');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(`${ADMIN}/uploads/import`);

    await page.setInputFiles('#sheet', csv);
    await expect(page.getByText('P7 · Social Studies · Mock Papers · 2026 · Term 2')).toBeVisible();
    await page.setInputFiles('#files', pdf);
    await page.getByRole('button', { name: /3\. Import/ }).click();
    await expect(page.getByRole('link', { name: 'created' })).toBeVisible();

    // The worker scans, processes and then publishes it (status "published" in the sheet).
    await expect
      .poll(
        async () =>
          (await page.request.get('/api/resources/p7-sst-mock-examination-2026')).status(),
        { timeout: 60_000 },
      )
      .toBe(200);
  });

  test('visitors find it on /new, /popular and via search', async ({ page }) => {
    await page.goto('/new');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recently added');
    await expect(
      page.getByRole('link', { name: /P7 SST Mock Examination 2026/ }).first(),
    ).toBeVisible();
    await page.goto('/popular?class=p7');
    await expect(
      page.getByRole('link', { name: /P7 SST Mock Examination 2026/ }).first(),
    ).toBeVisible();
    await page.goto('/trending/week');
    await expect(page.getByRole('link', { name: 'This week' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await page.goto('/search?q=p7%20sst%20mock');
    await expect(
      page.getByRole('link', { name: 'P7 SST Mock Examination 2026', exact: true }),
    ).toBeVisible();
  });

  test('unknown pages are real 404s', async ({ page }) => {
    expect((await page.request.get('/resources/does-not-exist')).status()).toBe(404);
    expect((await page.request.get('/p6/not-a-subject')).status()).toBe(404);
  });
});
