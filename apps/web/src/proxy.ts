import { NextResponse, type NextRequest } from 'next/server';

const API = (process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const SECRET = process.env.REVALIDATE_SECRET ?? 'dev-revalidate-secret';
const TTL_MS = 60_000;
type ResourceStatus =
  | { status: 'published' | 'gone' | 'missing' }
  | { status: 'redirect'; slug: string };
const cache = new Map<string, { value: ResourceStatus; at: number }>();
const LEGACY_GONE_PATHS = new Set([
  '/preferences',
  '/__META_CANONICAL__',
  '/resources/umta-guide-s4-computer-840-1',
  '/resources/p7-art-1',
]);

async function statusOf(slug: string): Promise<ResourceStatus | null> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  try {
    const res = await fetch(`${API}/api/resources/${encodeURIComponent(slug)}/status`, {
      headers: { 'x-internal-secret': SECRET },
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return null;
    const value = (await res.json()) as ResourceStatus;
    if (!['published', 'gone', 'missing', 'redirect'].includes(value.status)) return null;
    if (value.status === 'redirect' && !/^[a-z0-9-]{1,140}$/.test(value.slug)) return null;
    if (cache.size > 5000) cache.clear();
    cache.set(slug, { value, at: Date.now() });
    return value;
  } catch {
    return null;
  }
}

/**
 * Preserves exact legacy resource links when the resource still exists, and serves a useful
 * HTTP 410 page for removed legacy content so search engines retire those URLs cleanly.
 */
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (LEGACY_GONE_PATHS.has(path)) {
    const slug = path.split('/').filter(Boolean).at(-1) ?? 'legacy-resource';
    return NextResponse.rewrite(new URL(`/unavailable/${slug}`, request.url), { status: 410 });
  }

  const resource = /^\/(resource|resources)\/([a-z0-9-]{1,140})$/.exec(path);
  if (!resource) return NextResponse.next();

  const slug = resource[2]!;
  const legacy = resource[1] === 'resource';
  const availability = await statusOf(slug);
  if (!availability) {
    if (!legacy) return NextResponse.next();
    return new NextResponse('Resource temporarily unavailable', {
      status: 503,
      headers: { 'cache-control': 'no-store', 'retry-after': '60' },
    });
  }

  if (availability.status === 'redirect' || (legacy && availability.status === 'published')) {
    const destination = request.nextUrl.clone();
    destination.pathname =
      '/resources/' + (availability.status === 'redirect' ? availability.slug : slug);
    return NextResponse.redirect(destination, 308);
  }

  if (availability.status === 'gone' || availability.status === 'missing') {
    const status = availability.status === 'gone' || legacy ? 410 : 404;
    return NextResponse.rewrite(new URL(`/unavailable/${slug}`, request.url), { status });
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/resource/:slug',
    '/resources/:slug',
    '/preferences',
    '/__META_CANONICAL__',
  ],
};
