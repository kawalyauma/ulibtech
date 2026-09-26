/** Drops and recreates the public schema of the test database, then migrates and seeds it. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { seedDatabase, schema } from '../packages/database/src/index';
import { hashPassword } from '../packages/auth/src/index';

const here = path.dirname(fileURLToPath(import.meta.url));

export async function resetTestDatabase(
  url: string,
  admin?: { email: string; password: string; name: string },
) {
  if (!/test/.test(url)) throw new Error(`Refusing to reset a non-test database: ${url}`);
  const sql = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await sql.unsafe(
      'DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;',
    );
    await sql.unsafe('DROP TEXT SEARCH CONFIGURATION IF EXISTS edushare');
    const db = drizzle(sql, { schema });
    await migrate(db, { migrationsFolder: path.resolve(here, '../packages/database/drizzle') });
    await seedDatabase(db);
    if (admin) {
      const [row] = await db
        .insert(schema.admins)
        .values({
          email: admin.email,
          name: admin.name,
          passwordHash: await hashPassword(admin.password),
        })
        .returning();
      const role = await db.query.roles.findFirst({
        where: (r, { eq }) => eq(r.key, 'super_admin'),
      });
      await db.insert(schema.adminRoles).values({ adminId: row!.id, roleId: role!.id });
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url =
    process.env.TEST_DATABASE_URL ?? 'postgres://edushare:edushare@localhost:5432/edushare_test';
  resetTestDatabase(url, {
    email: 'admin@example.com',
    password: 'ChangeMe!2026',
    name: 'E2E Admin',
  })
    .then(() => console.log('Test database reset'))
    .catch((e: unknown) => {
      console.error(e);
      process.exit(1);
    });
}
