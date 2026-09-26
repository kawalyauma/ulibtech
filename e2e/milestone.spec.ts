import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const ADMIN = 'http://localhost:3101';
const FIXTURE = path.resolve('e2e/fixtures/P6 Social Studies Term 2 Examination 2026.pdf');
const TITLE = 'P6 Social Studies Term 2 Examination 2026';
const SLUG = 'p6-social-studies-term-2-examination-2026';

async function login(page: Page) {
  await page.goto(`${ADMIN}/resources/new`);
  await page.getByLabel('Email').fill('admin@example.com');
  await page.getByLabel('Password').fill('ChangeMe!2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL(`${ADMIN}/resources/new`);
}

async function pick(page: Page, label: string, option: string) {
  const select = page.getByLabel(label, { exact: true });
  await expect(select.locator('option', { hasText: option }).first()).toBeAttached();
  const value = await select.locator('option', { hasText: option }).first().getAttribute('value');
  await select.selectOption(value!);
}

async function counts(page: Page) {
  const res = await page.request.get(`/api/resources/${SLUG}`);
  return (
    (await res.json()) as {
      resource: { viewCount: number; downloadCount: number; shareCount: number };
    }
  ).resource;
}

test.describe
  .serial('milestone: upload → publish → search → preview → download → share → analytics', () => {
  let adminUrl = '';

  test('admin rejects wrong password', async ({ page }) => {
    await page.goto(`${ADMIN}/login`);
    await page.getByLabel('Email').fill('admin@example.com');
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Incorrect email or password.')).toBeVisible();
  });

  test('admin uploads and classifies a resource', async ({ page }) => {
    await login(page);
    await page.setInputFiles('#file', FIXTURE);
    await expect(page.getByLabel('Title', { exact: true })).toHaveValue(TITLE);
    await pick(page, 'Class', 'Primary 6');
    await pick(page, 'Subject', 'Social Studies');
    await pick(page, 'Resource type', 'Past Paper');
    await pick(page, 'Year', '2026');
    await pick(page, 'Term', 'Term 2');
    await page
      .getByLabel('Description', { exact: true })
      .fill('End of term two Social Studies examination for Primary Six.');
    await page.getByRole('button', { name: 'Upload resource' }).click();
    await page.waitForURL(/\/resources\/[0-9a-f-]{36}$/);
    adminUrl = page.url();
    await expect(page.getByText('Processed')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Draft', { exact: true })).toBeVisible();
  });

  test('admin publishes the resource', async ({ page }) => {
    await login(page);
    await page.goto(adminUrl);
    await page.getByTestId('publish').click();
    await expect(page.getByText('Published', { exact: true }).first()).toBeVisible();
  });

  test('visitor searches "P6 SST past paper" and filters', async ({ page }) => {
    await page.goto('/');
    const box = page.getByRole('combobox', { name: 'Search resources' }).first();
    await box.fill('P6 SST past paper');
    await box.press('Enter');
    await page.waitForURL(/\/search\?q=/);
    await expect(page.getByRole('link', { name: TITLE, exact: true })).toBeVisible();
    await expect(page.getByText(/1 result for/)).toBeVisible();

    await page.goto(
      '/search?class=p6&subject=social-studies&type=past-papers&year=2026&term=term-2',
    );
    await expect(page.getByRole('link', { name: TITLE, exact: true })).toBeVisible();
    await page.goto('/search?class=p7');
    await expect(page.getByText(/No resources match these filters|No results/)).toBeVisible();
  });

  test('visitor opens the resource, previews, downloads free and shares', async ({
    page,
    context,
  }) => {
    await page.goto('/search?q=P6%20SST%20past%20paper');
    await page.getByRole('link', { name: TITLE, exact: true }).click();
    await page.waitForURL(`**/resources/${SLUG}`);
    await expect(page.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();

    // SEO essentials
    await expect(page).toHaveTitle(/P6 Social Studies Term 2 Examination 2026/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `http://localhost:3100/resources/${SLUG}`,
    );
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      'content',
      /Free download/,
    );
    await expect(page.locator('meta[property="og:image"]').first()).toHaveAttribute(
      'content',
      /opengraph-image/,
    );
    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(ld.some((j) => j.includes('LearningResource'))).toBe(true);
    expect(ld.some((j) => j.includes('BreadcrumbList'))).toBe(true);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toContainText(
      'Social Studies',
    );

    // Preview (PDF.js)
    await page.getByRole('button', { name: /Preview/ }).click();
    await expect(page.getByText('Page 1 of 3')).toBeVisible();
    await expect(page.locator('[data-testid=pdf-preview] canvas')).toBeVisible();

    // Download without any account
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('download-button').first().click(),
    ]);
    expect(download.suggestedFilename()).toBe(`${TITLE}.pdf`);

    // Share to WhatsApp opens wa.me with the page link (external site stubbed out)
    await context.route('https://wa.me/**', (route) => route.fulfill({ status: 200, body: 'ok' }));
    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      page.locator('[data-share=whatsapp]').click(),
    ]);
    await popup.waitForURL(/wa\.me/);
    expect(decodeURIComponent(popup.url())).toContain(`/resources/${SLUG}`);
    await popup.close();

    await expect
      .poll(async () => counts(page), { timeout: 15_000 })
      .toMatchObject({ viewCount: 1, downloadCount: 1, shareCount: 1 });
  });

  test('landing page, sitemap and robots include the resource', async ({ page }) => {
    await page.goto('/p6/social-studies/past-papers');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'P6 Social Studies Past Papers',
    );
    await expect(page.getByRole('link', { name: new RegExp(TITLE) }).first()).toBeVisible();
    const sitemap = await (await page.request.get('/sitemaps/resources-1.xml')).text();
    expect(sitemap).toContain(`/resources/${SLUG}`);
    const robots = await (await page.request.get('/robots.txt')).text();
    expect(robots).toContain('Sitemap: http://localhost:3100/sitemap.xml');
  });

  test('admin dashboard shows the recorded analytics', async ({ page }) => {
    await login(page);
    await page.goto(ADMIN);
    await expect(page.getByText('Downloads today').locator('..')).toContainText('1');
    await expect(page.getByText('Most downloaded (30 days)').locator('../..')).toContainText(TITLE);
  });

  test('admin unpublishes and deletes', async ({ page }) => {
    await login(page);
    await page.goto(adminUrl);
    await page.getByTestId('unpublish').click();
    await expect(page.getByText('Unpublished', { exact: true }).first()).toBeVisible();
    await expect
      .poll(async () => (await page.request.get(`/api/resources/${SLUG}`)).status())
      .toBe(410);
    await page.goto(`/resources/${SLUG}`);
    await expect(page.getByRole('heading', { name: 'Resource unavailable' })).toBeVisible();

    await page.goto(adminUrl);
    page.once('dialog', (d) => void d.accept());
    await page.getByTestId('delete').click();
    await page.waitForURL(`${ADMIN}/resources`);
    await expect
      .poll(async () => (await page.request.get(`/api/resources/${SLUG}`)).status())
      .toBe(404);
  });
});
