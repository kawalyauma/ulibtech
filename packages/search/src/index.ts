import type { Database } from '@edushare/database';
import type { Cache } from '@edushare/cache';
import { PostgresSearchProvider } from './postgres';
import { MeilisearchProvider } from './meilisearch';
import type { SearchProvider } from './types';

export * from './types';
export * from './text';
export * from './vocabulary';
export { loadVocabulary, invalidateVocabulary } from './vocabulary-loader';
export { buildTsquery, termToTsquery } from './tsquery';
export { PostgresSearchProvider } from './postgres';
export { MeilisearchProvider } from './meilisearch';

/** Factory: picks the configured provider. Add Meilisearch/OpenSearch here later. */
export function createSearchProvider(db: Database, cache?: Cache): SearchProvider {
  const name = process.env.SEARCH_PROVIDER ?? 'postgres';
  switch (name) {
    case 'postgres':
      return new PostgresSearchProvider(db, { cache });
    case 'meilisearch': {
      const host = process.env.MEILI_HOST;
      if (!host) throw new Error('SEARCH_PROVIDER=meilisearch requires MEILI_HOST');
      return new MeilisearchProvider(db, {
        host,
        apiKey: process.env.MEILI_API_KEY,
        indexName: process.env.MEILI_INDEX,
        cache,
      });
    }
    default:
      throw new Error(`Unsupported SEARCH_PROVIDER: ${name}`);
  }
}
