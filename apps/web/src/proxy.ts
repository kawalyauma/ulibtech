import { NextResponse, type NextRequest } from 'next/server';

const API = (process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const SECRET = process.env.REVALIDATE_SECRET ?? 'dev-revalidate-secret';
const TTL_MS = 60_000;
const cache = new Map<string, { status: string; at: number }>();

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

/** Serves HTTP 410 Gone for unpublished/archived resources so search engines drop them. */
export async function proxy(request: NextRequest) {
  const m = /^\/resources\/([a-z0-9-]{1,140})$/.exec(request.nextUrl.pathname);
  if (!m) return NextResponse.next();
  if ((await statusOf(m[1]!)) === 'gone') {
    return NextResponse.rewrite(new URL(`/unavailable/${m[1]}`, request.url), { status: 410 });
  }
  return NextResponse.next();
}

export const config = { matcher: ['/resources/:slug'] };
