import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb } from '../src/client';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function runMigrations(url: string) {
  const { db, sql } = createDb(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: path.resolve(here, '../drizzle') });
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  runMigrations(url)
    .then(() => {
      console.log('Migrations complete');
    })
    .catch((err: unknown) => {
      console.error('Migration failed', err);
      process.exit(1);
    });
}
