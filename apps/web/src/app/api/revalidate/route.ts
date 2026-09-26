import { revalidatePath, revalidateTag } from 'next/cache';
import { timingSafeEqual } from 'node:crypto';
import { INTERNAL_SECRET } from '@/lib/config';

function authorised(header: string | null): boolean {
  if (!header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(INTERNAL_SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** On-demand revalidation, called by the worker after content changes. */
export async function POST(req: Request) {
  if (!authorised(req.headers.get('x-revalidate-secret'))) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { tags?: unknown; paths?: unknown };
  const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === 'string' && t.length <= 256).slice(0, 100) : [];
  const paths = Array.isArray(body.paths) ? body.paths.filter((p): p is string => typeof p === 'string' && p.startsWith('/')).slice(0, 100) : [];
  // Content was changed by an administrator: expire immediately so visitors see it at once.
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  for (const path of paths) revalidatePath(path);
  return Response.json({ revalidated: true, tags: tags.length, paths: paths.length, now: Date.now() });
}
