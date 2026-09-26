import type { FacetBucket, ResourceFilters, ResourceSort, Suggestion } from '@edushare/shared';

export interface SearchRequest {
  q: string;
  filters: ResourceFilters;
  page: number;
  pageSize: number;
  sort: ResourceSort;
}

export interface ProviderHit {
  id: string;
  score: number;
  highlight: { title: string; snippet: string | null };
}

export interface Interpretation {
  class?: string;
  subject?: string;
  type?: string;
  year?: number;
  term?: string;
}

export interface ProviderSearchResult {
  hits: ProviderHit[];
  total: number;
  mode: 'all' | 'any' | 'fuzzy' | 'browse';
  normalizedQuery: string;
  didYouMean: string | null;
  interpreted: Interpretation;
  facets: Record<'class' | 'subject' | 'type' | 'year' | 'term' | 'fileType', FacetBucket[]>;
  tookMs: number;
}

/**
 * Search abstraction. The resource module only talks to this interface so that
 * PostgreSQL full-text search can be replaced by Meilisearch/OpenSearch later.
 */
export interface SearchProvider {
  readonly name: string;
  indexResource(resourceId: string): Promise<void>;
  removeResource(resourceId: string): Promise<void>;
  search(request: SearchRequest): Promise<ProviderSearchResult>;
  suggest(q: string, limit?: number): Promise<Suggestion[]>;
  rebuildIndex(): Promise<{ indexed: number }>;
}
