/** Filter keys accepted by the public search/listing API. */
export const FILTER_KEYS = ['class', 'subject', 'type', 'year', 'term', 'fileType', 'topic', 'curriculum', 'level', 'collection', 'featured'] as const;
export type FilterKey = (typeof FILTER_KEYS)[number];

export type RawSearchParams = Record<string, string | string[] | undefined>;

export function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Normalises Next.js searchParams into a URLSearchParams for the API. */
export function toApiParams(sp: RawSearchParams, extra: Record<string, string> = {}): URLSearchParams {
  const out = new URLSearchParams();
  const q = first(sp.q);
  if (q) out.set('q', q.slice(0, 200));
  for (const key of FILTER_KEYS) {
    const v = first(sp[key]);
    if (v) out.set(key, v.slice(0, 120));
  }
  const page = Number(first(sp.page));
  if (Number.isInteger(page) && page > 1 && page <= 1000) out.set('page', String(page));
  const sort = first(sp.sort);
  if (sort) out.set('sort', sort);
  for (const [k, v] of Object.entries(extra)) out.set(k, v);
  return out;
}

export function withParam(base: URLSearchParams, key: string, value: string | null): string {
  const next = new URLSearchParams(base);
  if (value === null) next.delete(key);
  else next.set(key, value);
  if (key !== 'page') next.delete('page');
  const s = next.toString();
  return s ? `?${s}` : '';
}
