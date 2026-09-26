import { buildSitemapIndex } from '@edushare/seo';
import { getSitemapIndex } from '@/lib/api';
import { SITE_URL } from '@/lib/config';

export const revalidate = 3600;

/** Sitemap index pointing at per-type sitemaps (resources are paginated). */
export async function GET() {
  const data = await getSitemapIndex().catch(() => null);
  const items = data?.items ?? [{ name: 'static', lastmod: null }];
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
