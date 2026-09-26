'use client';

import { useQueries } from '@tanstack/react-query';
import { api } from './api';
import type { TaxonomyRow } from './types';

const ENTITIES = [
  'classes',
  'subjects',
  'resource-types',
  'academic-years',
  'terms',
  'topics',
  'subtopics',
  'curricula',
  'levels',
] as const;
export type Entity = (typeof ENTITIES)[number];

export function useTaxonomyOptions() {
  const results = useQueries({
    queries: ENTITIES.map((e) => ({
      queryKey: ['taxonomy', e],
      queryFn: () => api.get<{ items: TaxonomyRow[] }>(`/taxonomy/${e}`),
      staleTime: 5 * 60_000,
    })),
  });
  const data = Object.fromEntries(
    ENTITIES.map((e, i) => [e, results[i]?.data?.items ?? []]),
  ) as Record<Entity, TaxonomyRow[]>;
  return { data, loading: results.some((r) => r.isLoading) };
}

export function labelOf(row: TaxonomyRow): string {
  if (row.year) return String(row.year);
  return String(row.short_name ?? row.plural_name ?? row.name ?? row.slug ?? '');
}
