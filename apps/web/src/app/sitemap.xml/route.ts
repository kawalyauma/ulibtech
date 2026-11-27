import { buildSitemapIndex } from '@edushare/seo';
import { getSitemapIndex } from '@/lib/api';
import { SITE_URL } from '@/lib/config';

export const revalidate = 3600;
// The API is available to the running container, not while the Docker image is being built.
// Render the index at request time so a production build cannot freeze the fallback-only sitemap.
export const dynamic = 'force-dynamic';

/** Sitemap index pointing at per-type sitemaps (resources are paginated). */
export async function GET() {
  const data = await getSitemapIndex().catch(() => null);
  if (!data) {
    return new Response('Sitemap temporarily unavailable', {
      status: 503,
      headers: { 'cache-control': 'no-store', 'retry-after': '60' },
    });
  }
  const items = data.items;
  const xml = buildSitemapIndex(
    items.map((i) => ({ loc: `${SITE_URL}/sitemaps/${i.name}.xml`, lastmod: i.lastmod })),
  );
  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
