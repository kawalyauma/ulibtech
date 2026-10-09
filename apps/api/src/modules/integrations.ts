import { createHash, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { sql } from '@edushare/database';
import { AppError } from '@edushare/shared';
import type { AppEnv } from '../lib/http';
import { limiter } from '../middleware/rate-limit';
import type { Services } from '../services';

const MAX_TEXT_CHARS = 200_000;
const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * Server-to-server routes for trusted partners (Ledgerly's e-library and AI). Public resources only;
 * the key just stops anonymous bulk scraping of extracted text. Disabled when INTEGRATION_API_KEYS is empty.
 */
export function integrationRoutes(services: Services) {
  const app = new Hono<AppEnv>();
  const keys = services.env.INTEGRATION_API_KEYS.split(',')
    .map((key) => key.trim())
    .filter((key) => key.length >= 24)
    .map(digest);

  app.use('*', async (c, next) => {
    if (!keys.length) throw AppError.notFound('Route');
    const given = c.req.header('x-integration-key') ?? '';
    const hash = digest(given);
    if (!given || !keys.some((key) => timingSafeEqual(key, hash))) {
      throw new AppError('UNAUTHENTICATED', 'A valid integration key is required');
    }
    c.header('Cache-Control', 'no-store');
    c.header('X-Robots-Tag', 'noindex');
    return next();
  });
  app.use('*', limiter(services.redis, 'integration', 600, 60, (c) => c.req.header('x-integration-key')?.slice(0, 12) ?? 'anon'));

  // Full extracted text of a published resource, for grounding AI-generated schemes and lesson plans.
  app.get('/resources/:slug/text', async (c) => {
    const slug = c.req.param('slug');
    const [row] = await services.ctx.db.execute<{
      slug: string;
      title: string;
      type: string | null;
      class_name: string | null;
      subject: string | null;
      term: string | null;
      page_count: number | null;
      ocr_applied: boolean;
      text: string | null;
    }>(sql`
      SELECT r.slug, r.title, rt.name AS type, cl.name AS class_name, su.name AS subject, te.name AS term,
             f.page_count, f.ocr_applied, f.extracted_text AS text
        FROM resources r
        JOIN resource_files f ON f.id = r.file_id
        LEFT JOIN resource_types rt ON rt.id = r.resource_type_id
        LEFT JOIN classes cl ON cl.id = r.class_id
        LEFT JOIN subjects su ON su.id = r.subject_id
        LEFT JOIN terms te ON te.id = r.term_id
       WHERE r.slug = ${slug} AND r.status = 'published' AND f.is_missing = false
       LIMIT 1`);
    if (!row) throw AppError.notFound('Resource');
    const text = row.text ?? '';
    return c.json({
      resource: {
        slug: row.slug,
        title: row.title,
        type: row.type,
        className: row.class_name,
        subject: row.subject,
        term: row.term,
        pageCount: row.page_count,
        ocrApplied: row.ocr_applied,
      },
      text: text.slice(0, MAX_TEXT_CHARS),
      totalChars: text.length,
      truncated: text.length > MAX_TEXT_CHARS,
    });
  });

  return app;
}
