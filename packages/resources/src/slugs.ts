import { sql, type Database } from '@edushare/database';
import { slugify } from '@edushare/shared';

/** Top-level public routes; taxonomy slugs must not collide with these. */
export const RESERVED_SLUGS = new Set([
  'api',
  'admin',
  'media',
  'download',
  'downloads',
  'resources',
  'resource',
  'search',
  'classes',
  'class',
  'subjects',
  'subject',
  'collections',
  'collection',
  'topics',
  'topic',
  'about',
  'privacy',
  'terms-of-use',
  'contact',
  'sitemap',
  'sitemaps',
  'sitemap.xml',
  'robots.txt',
  'manifest.webmanifest',
  'offline',
  'levels',
  'years',
  '_next',
  'favicon.ico',
  'sw.js',
  'icons',
  'pdfjs',
  'og',
  'health',
  'new',
  'popular',
  'recent',
  'trending',
]);

/** Generates a unique resource slug, appending -2, -3... when needed. */
export async function uniqueResourceSlug(
  db: Database,
  base: string,
  excludeId?: string,
): Promise<string> {
  const root = slugify(base, 110) || 'resource';
  const rows = await db.execute<{ slug: string }>(sql`
    SELECT slug FROM resources WHERE (slug = ${root} OR slug LIKE ${`${root}-%`}) ${excludeId ? sql`AND id <> ${excludeId}` : sql``}
    UNION SELECT old_slug FROM resource_redirects WHERE (old_slug = ${root} OR old_slug LIKE ${`${root}-%`}) ${excludeId ? sql`AND resource_id <> ${excludeId}` : sql``}`);
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(root)) return root;
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${root}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${root}-${Date.now()}`;
}
