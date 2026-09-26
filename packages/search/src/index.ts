import type { Database } from '@edushare/database';
import type { Cache } from '@edushare/cache';
import { PostgresSearchProvider } from './postgres';
import type { SearchProvider } from './types';

export * from './types';
export * from './text';
export * from './vocabulary';
export { loadVocabulary, invalidateVocabulary } from './vocabulary-loader';
export { buildTsquery, termToTsquery } from './tsquery';
export { PostgresSearchProvider } from './postgres';

/** Factory: picks the configured provider. Add Meilisearch/OpenSearch here later. */
export function createSearchProvider(db: Database, cache?: Cache): SearchProvider {
  const name = process.env.SEARCH_PROVIDER ?? 'postgres';
  switch (name) {
    case 'postgres':
      return new PostgresSearchProvider(db, { cache });
    default:
      throw new Error(`Unsupported SEARCH_PROVIDER: ${name}`);
  }
}
