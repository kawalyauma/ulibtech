import { Readable } from 'node:stream';
import { Hono } from 'hono';
import { recordDownload } from '@edushare/analytics';
import { eq, sql } from '@edushare/database';
import { resources } from '@edushare/database/schema';
import { isPreviewable } from '@edushare/documents';
import { AppError, safeDownloadName, type AllowedFileKind } from '@edushare/shared';
import { assertValidKey, StorageNotFoundError, type ByteRange } from '@edushare/storage';
import { clientIp, type AppContext, type AppEnv } from '../lib/http';
import { parseRange } from '../lib/range';
import { visitorMeta } from '../lib/visitor';
import { limiter } from '../middleware/rate-limit';
import type { Services } from '../services';

const MEDIA_TYPES: Record<string, string> = {
  webp: 'image/webp',
  avif: 'image/avif',
  png: 'image/png',
  jpg: 'image/jpeg',
};

function contentDisposition(kind: 'attachment' | 'inline', name: string): string {
  const ascii = safeDownloadName(name);
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name.replace(/[\r\n"]/g, ''))}`;
}

async function loadFile(services: Services, slug: string) {
  const row = await services.ctx.db.query.resources.findFirst({
    where: eq(resources.slug, slug),
    columns: { id: true, slug: true, title: true, status: true, fileId: true },
    with: {
      file: {
        columns: {
          id: true,
          storageKey: true,
          mimeType: true,
          extension: true,
          kind: true,
          sizeBytes: true,
          isMissing: true,
          scanStatus: true,
          updatedAt: true,
        },
      },
    },
  });
  // Only published, scanned files are ever served publicly.
  if (
    !row ||
    row.status !== 'published' ||
    !row.file ||
    row.file.scanStatus === 'infected' ||
    row.file.scanStatus === 'pending'
  )
    return null;
  return row as typeof row & { file: NonNullable<typeof row.file> };
}

/** Streams a storage object with Range support, or delegates to Nginx via X-Accel-Redirect. */
async function sendFile(
  c: AppContext,
  services: Services,
  key: string,
  headers: Record<string, string>,
  opts: { head?: boolean } = {},
): Promise<Response> {
  const storage = services.ctx.storage;
  for (const [k, v] of Object.entries(headers)) c.header(k, v);
  c.header('Accept-Ranges', 'bytes');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Content-Security-Policy', "default-src 'none'; sandbox");

  const accel = storage.accelRedirectPath?.(key) ?? null;
  if (accel) {
    // Nginx serves the bytes (with range support) from an internal location.
    c.header('X-Accel-Redirect', accel);
    c.header('X-Accel-Buffering', 'yes');
    return c.body(null, 200);
  }

  const meta = await storage.getMetadata(key);
  if (!meta) throw new StorageNotFoundError(key);
  const range = parseRange(c.req.header('range'), meta.size);
  if (range === 'invalid') {
    c.header('Content-Range', `bytes */${meta.size}`);
    return c.body(null, 416);
  }
  const etag = `"${meta.size.toString(16)}-${meta.modifiedAt.getTime().toString(16)}"`;
  c.header('ETag', etag);
  c.header('Last-Modified', meta.modifiedAt.toUTCString());
  if (!range && c.req.header('if-none-match') === etag) return c.body(null, 304);

  if (opts.head) {
    c.header('Content-Length', String(meta.size));
    return c.body(null, 200);
  }
  const opened = await storage.open(key, range ?? undefined);
  const body = Readable.toWeb(opened.stream) as ReadableStream;
  if (opened.range) {
    const r: ByteRange = opened.range;
    c.header('Content-Range', `bytes ${r.start}-${r.end}/${opened.size}`);
    c.header('Content-Length', String(r.end - r.start + 1));
    return c.body(body, 206);
  }
  c.header('Content-Length', String(opened.size));
  return c.body(body, 200);
}

export function fileRoutes(services: Services) {
  const app = new Hono<AppEnv>();
  const site = services.env.PUBLIC_SITE_URL.replace(/\/$/, '');

  // Downloads: generous limits keyed by IP + user agent so shared school networks are not blocked.
  const perVisitor = limiter(
    services.redis,
    'download',
    60,
    600,
    (c) => `${clientIp(c)}|${c.req.header('user-agent') ?? ''}`,
  );
  const perIp = limiter(services.redis, 'download-ip', 1000, 3600);

  const download = async (c: AppContext, head: boolean) => {
    const slug = c.req.param('slug') ?? '';
    const row = await loadFile(services, slug);
    if (!row) return c.redirect(`${site}/resources/${encodeURIComponent(slug)}`, 302);
    if (row.file.isMissing)
      return c.redirect(`${site}/resources/${encodeURIComponent(slug)}?file=missing`, 302);
    const name = `${row.title}.${row.file.extension}`;
    try {
      const range = c.req.header('range');
      // Count the download once per request, ignoring HEAD and resumed (mid-file) range requests.
      const isResume = range && !/^bytes=0-/.test(range);
      if (!head && !isResume) {
        await recordDownload(
          { db: services.db, redis: services.redis },
          row.id,
          row.file.id,
          visitorMeta(c),
        ).catch((err: unknown) => {
          console.error('[download] tracking failed', (err as Error).message);
        });
      }
      return await sendFile(
        c,
        services,
        row.file.storageKey,
        {
          'Content-Type': row.file.mimeType,
          'Content-Disposition': contentDisposition('attachment', name),
          'Cache-Control': 'private, no-store',
          'X-Robots-Tag': 'noindex',
        },
        { head },
      );
    } catch (err) {
      if (err instanceof StorageNotFoundError) {
        await services.ctx.db.execute(
          sql`UPDATE resource_files SET is_missing = true, last_checked_at = now() WHERE id = ${row.file.id}`,
        );
        return c.redirect(`${site}/resources/${encodeURIComponent(slug)}?file=missing`, 302);
      }
      throw err;
    }
  };

  app.get('/api/download/:slug', perIp, perVisitor, (c) => download(c, false));
  app.on('HEAD', '/api/download/:slug', (c) => download(c, true));

  // Inline preview for PDFs and images (used by PDF.js with range requests).
  app.get('/api/files/:slug/preview', limiter(services.redis, 'preview', 600, 600), async (c) => {
    const row = await loadFile(services, c.req.param('slug'));
    if (!row || row.file.isMissing) throw AppError.notFound('File');
    if (!isPreviewable(row.file.kind as AllowedFileKind))
      throw new AppError('BAD_REQUEST', 'Preview is not available for this file type');
    try {
      return await sendFile(c, services, row.file.storageKey, {
        'Content-Type': row.file.mimeType,
        'Content-Disposition': contentDisposition('inline', `${row.title}.${row.file.extension}`),
        'Cache-Control': 'public, max-age=3600',
        'X-Robots-Tag': 'noindex',
      });
    } catch (err) {
      if (err instanceof StorageNotFoundError)
        throw new AppError('FILE_MISSING', 'The file is currently unavailable');
      throw err;
    }
  });

  // Public thumbnails. Keys are unique per file, so they can be cached immutably.
  app.get('/media/*', async (c) => {
    const key = c.req.path.replace(/^\/media\//, '');
    try {
      assertValidKey(key);
    } catch {
      throw AppError.notFound('Image');
    }
    if (!key.startsWith('thumbnails/')) throw AppError.notFound('Image');
    const ext = key.split('.').pop() ?? '';
    const type = MEDIA_TYPES[ext];
    if (!type) throw AppError.notFound('Image');
    try {
      return await sendFile(c, services, key, {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Cross-Origin-Resource-Policy': 'cross-origin',
      });
    } catch (err) {
      if (err instanceof StorageNotFoundError) throw AppError.notFound('Image');
      throw err;
    }
  });

  return app;
}
