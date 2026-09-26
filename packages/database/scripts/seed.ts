import { createDb } from '../src/client';
import { seedDatabase } from '../src/seed';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}
const { db, sql } = createDb(url, { max: 1 });
seedDatabase(db)
  .then(() => console.log('Seed complete'))
  .catch((err: unknown) => {
    console.error('Seed failed', err);
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }));
