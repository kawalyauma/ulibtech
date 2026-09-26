/** Production entrypoint: apply migrations then seed default data (idempotent). */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDb, seedDatabase } from '@edushare/database';

const here = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const folder =
    process.env.MIGRATIONS_DIR ?? path.resolve(here, '../../../packages/database/drizzle');
  const { db, sql } = createDb(url, { max: 1 });
  try {
    await migrate(db, { migrationsFolder: folder });
    console.log('Migrations applied');
    if (process.env.SKIP_SEED !== 'true') {
      await seedDatabase(db);
      console.log('Seed applied');
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
