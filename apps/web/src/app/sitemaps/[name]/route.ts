import { buildUrlset } from '@edushare/seo';
import { getSitemap } from '@/lib/api';
import { absoluteUrl } from '@/lib/config';

export const revalidate = 3600;

export async function GET(_req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const key = name.replace(/\.xml$/, '');
  if (!/^[a-z0-9-]{1,40}$/.test(key)) return new Response('Not found', { status: 404 });
  let data: Awaited<ReturnType<typeof getSitemap>>;
  try {
    data = await getSitemap(key);
  } catch {
    return new Response('Sitemap temporarily unavailable', {
      status: 503,
      headers: { 'cache-control': 'no-store', 'retry-after': '60' },
    });
  }
  if (!data) return new Response('Not found', { status: 404 });
  const xml = buildUrlset(
    data.items.map((u) => ({
      loc: absoluteUrl(u.loc),
      lastmod: u.lastmod,
      changefreq: u.changefreq as 'daily' | undefined,
      priority: u.priority,
      image: u.image ? absoluteUrl(u.image) : null,
    })),
  );
  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
