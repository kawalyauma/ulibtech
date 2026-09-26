import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;
export type SqlClient = postgres.Sql;

interface DbHandle {
  db: Database;
  sql: SqlClient;
}

const globalForDb = globalThis as unknown as { __edushareDb?: DbHandle };

export function createDb(url: string, options: { max?: number } = {}): DbHandle {
  const sql = postgres(url, {
    max: options.max ?? 10,
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: true,
    onnotice: () => undefined,
  });
  const db = drizzle(sql, { schema });
  return { db, sql };
}

/** Lazily-created process-wide database connection. */
export function getDb(): DbHandle {
  if (!globalForDb.__edushareDb) {
    const url = process.env.DATABASE_URL ?? 'postgres://edushare:edushare@localhost:5432/edushare';
    globalForDb.__edushareDb = createDb(url, { max: Number(process.env.DB_POOL_MAX ?? 10) });
  }
  return globalForDb.__edushareDb;
}

export async function closeDb(): Promise<void> {
  if (globalForDb.__edushareDb) {
    await globalForDb.__edushareDb.sql.end({ timeout: 5 });
    globalForDb.__edushareDb = undefined;
  }
}
