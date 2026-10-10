import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { z } from 'zod';
import { sql } from '@edushare/database';
import { createResourceFromUpload, type Actor } from '@edushare/resources';
import { AppError, resourceMetadataSchema } from '@edushare/shared';
import { fieldsToObject, parseMultipart } from '../lib/upload';
import { parse, type AppEnv } from '../lib/http';
import { limiter } from '../middleware/rate-limit';
import type { Services } from '../services';

const DEFAULT_TEXT_CHARS = 200_000;
const MAX_TEXT_CHARS = 1_000_000;
const PUBLISHER_EMAIL = 'ledgerly-ai@integrations.notesug.com';
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

  // Catalogue search for trusted partners. Unlike the public API it can include drafts (uploaded but not yet
  // reviewed), so Ledgerly AI can ground schemes in the whole collection; drafts are never shown publicly.
  app.get('/resources', async (c) => {
    const q = c.req.query();
    const drafts = q.includeDrafts === '1';
    const like = q.q ? `%${q.q.replace(/[%_]/g, '')}%` : null;
    const rows = await services.ctx.db.execute<Record<string, unknown>>(sql`
      SELECT r.slug, r.title, r.status, rt.slug AS type, cl.slug AS class, su.slug AS subject, te.slug AS term,
             f.page_count AS "pageCount", length(f.extracted_text) AS chars, f.sha256
        FROM resources r
        JOIN resource_files f ON f.id = r.file_id
        LEFT JOIN resource_types rt ON rt.id = r.resource_type_id
        LEFT JOIN classes cl ON cl.id = r.class_id
        LEFT JOIN subjects su ON su.id = r.subject_id
        LEFT JOIN terms te ON te.id = r.term_id
       WHERE f.is_missing = false AND length(f.extracted_text) > 500
         AND (r.status = 'published' OR (${drafts} AND r.status IN ('draft', 'review')))
         AND (${q.class ?? null}::text IS NULL OR cl.slug = ${q.class ?? null})
         AND (${q.subject ?? null}::text IS NULL OR su.slug = ${q.subject ?? null})
         AND (${q.type ?? null}::text IS NULL OR rt.slug = ${q.type ?? null})
         AND (${q.term ?? null}::text IS NULL OR te.slug = ${q.term ?? null} OR te.slug IS NULL)
         AND (${like}::text IS NULL OR r.title ILIKE ${like})
       ORDER BY (r.status = 'published') DESC, length(f.extracted_text) DESC
       LIMIT ${Math.min(100, Math.max(1, Number(q.limit ?? 30) || 30))}`);
    return c.json({ items: rows });
  });

  // Full extracted text of a published resource, for grounding AI-generated schemes and lesson plans.
  // Long books are read in windows: ?offset=0&limit=200000, then continue from nextOffset.
  app.get('/resources/:slug/text', async (c) => {
    const slug = c.req.param('slug');
    const offset = Math.max(0, Math.floor(Number(c.req.query('offset') ?? 0)) || 0);
    const limit = Math.min(MAX_TEXT_CHARS, Math.max(1000, Math.floor(Number(c.req.query('limit') ?? DEFAULT_TEXT_CHARS)) || DEFAULT_TEXT_CHARS));
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
       WHERE r.slug = ${slug} AND (r.status = 'published' OR (${c.req.query('includeDrafts') === '1'} AND r.status IN ('draft', 'review'))) AND f.is_missing = false
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
      text: text.slice(offset, offset + limit),
      offset,
      totalChars: text.length,
      nextOffset: offset + limit < text.length ? offset + limit : null,
      truncated: offset + limit < text.length,
    });
  });

  // Publishing from Ledgerly AI (schemes of work, lesson notes, lesson plans). Resources are filed under a
  // dedicated service account that cannot sign in, go through the normal processing and security scan,
  // and are published automatically once processing completes.
  let publisher: Actor | null = null;
  const publisherActor = async (): Promise<Actor> => {
    if (publisher) return publisher;
    const [row] = await services.ctx.db.execute<{ id: string }>(sql`
      INSERT INTO admins (email, name, password_hash, is_active)
      VALUES (${PUBLISHER_EMAIL}, 'Ledgerly AI', ${'!disabled:' + randomBytes(16).toString('hex')}, false)
      ON CONFLICT (email) DO UPDATE SET name = admins.name
      RETURNING id`);
    publisher = { id: row!.id, name: 'Ledgerly AI', permissions: ['resources.create', 'resources.publish'] };
    return publisher;
  };
  const lookup = async (table: 'classes' | 'subjects' | 'resource_types' | 'terms', slug?: string) => {
    if (!slug) return undefined;
    const [row] = await services.ctx.db.execute<{ id: string }>(sql`SELECT id FROM ${sql.raw(table)} WHERE slug = ${slug} LIMIT 1`);
    if (!row) throw AppError.badRequest(`Unknown ${table.replace('_', ' ')}: ${slug}`);
    return row.id;
  };
  const publishFields = z.object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().max(10_000).optional(),
    shortDescription: z.string().trim().max(300).optional(),
    classSlug: z.string().max(60).optional(),
    subjectSlug: z.string().max(80).optional(),
    typeSlug: z.string().max(60).optional(),
    termSlug: z.string().max(40).optional(),
    topic: z.string().max(160).optional(),
    author: z.string().max(160).optional(),
    keywords: z.string().max(1000).optional(),
  });
  app.post('/resources', async (c) => {
    const maxBytes = services.env.MAX_UPLOAD_MB * 1024 * 1024;
    const { fields, files } = await parseMultipart(c, services.ctx.storage, { maxFileBytes: maxBytes, maxFiles: 1 });
    const file = files[0];
    if (!file) throw AppError.badRequest('Attach the document as "file".');
    try {
      const f = parse(publishFields, fieldsToObject(fields));
      const input = parse(resourceMetadataSchema, {
        title: f.title,
        description: f.description,
        shortDescription: f.shortDescription,
        classId: await lookup('classes', f.classSlug),
        subjectId: await lookup('subjects', f.subjectSlug),
        resourceTypeId: await lookup('resource_types', f.typeSlug),
        termId: await lookup('terms', f.termSlug),
        topic: f.topic,
        author: f.author ?? 'Ledgerly AI',
        keywords: f.keywords,
        status: 'published',
      });
      const result = await createResourceFromUpload(services.ctx, await publisherActor(), file, input);
      return c.json(result, 201);
    } catch (err) {
      await services.ctx.storage.delete(file.tempKey).catch(() => undefined);
      throw err;
    }
  });

  // Status of a resource this integration published (processing → published).
  app.get('/resources/:slug/status', async (c) => {
    const [row] = await services.ctx.db.execute<{ slug: string; status: string; title: string }>(sql`
      SELECT r.slug, r.status, r.title FROM resources r JOIN admins a ON a.id = r.created_by_id
       WHERE r.slug = ${c.req.param('slug')} AND a.email = ${PUBLISHER_EMAIL} LIMIT 1`);
    if (!row) throw AppError.notFound('Resource');
    return c.json(row);
  });

  return app;
}
