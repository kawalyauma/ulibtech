import { NextResponse, type NextRequest } from 'next/server';

const API = (process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const SECRET = process.env.REVALIDATE_SECRET ?? 'dev-revalidate-secret';
const TTL_MS = 60_000;
const cache = new Map<string, { status: string; at: number }>();
const LEGACY_GONE_PATHS = new Set([
  '/preferences',
  '/__META_CANONICAL__',
  '/resources/umta-guide-s4-computer-840-1',
  '/resources/p7-art-1',
]);

async function statusOf(slug: string): Promise<string> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.status;
  try {
    const res = await fetch(`${API}/api/resources/${encodeURIComponent(slug)}/status`, {
      headers: { 'x-internal-secret': SECRET },
      signal: AbortSignal.timeout(1500),
    });
    const { status } = (await res.json()) as { status: string };
    if (cache.size > 5000) cache.clear();
    cache.set(slug, { status, at: Date.now() });
    return status;
  } catch {
    return 'published'; // fail open: the page itself handles missing resources
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

  const legacy = /^\/resource\/([a-z0-9-]{1,140})$/.exec(path);
  if (legacy) {
    const slug = legacy[1]!;
    if ((await statusOf(slug)) === 'published') {
      return NextResponse.redirect(new URL(`/resources/${slug}`, request.url), 308);
    }
    return NextResponse.rewrite(new URL(`/unavailable/${slug}`, request.url), { status: 410 });
  }

  const current = /^\/resources\/([a-z0-9-]{1,140})$/.exec(path);
  if (current && (await statusOf(current[1]!)) === 'gone') {
    return NextResponse.rewrite(new URL(`/unavailable/${current[1]}`, request.url), { status: 410 });
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
