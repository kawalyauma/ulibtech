import 'server-only';
import type { Paginated, ResourceCard } from '@edushare/shared';
import { apiFetch } from './api';

export type ListingSort = 'trending_today' | 'trending_week' | 'downloads' | 'newest' | 'popular';

/** Sorted, filterable listings used by /trending, /popular and /new. */
export function getListing(
  sort: ListingSort,
  params: { page?: number; class?: string; subject?: string; type?: string } = {},
) {
  const qs = new URLSearchParams({ sort, pageSize: '24', page: String(params.page ?? 1) });
  for (const k of ['class', 'subject', 'type'] as const) if (params[k]) qs.set(k, params[k]!);
  return apiFetch<Paginated<ResourceCard>>(`/api/resources?${qs.toString()}`, {
    revalidate: 300,
    tags: ['resources'],
  });
}
