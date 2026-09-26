/**
 * Creates (or updates the password of) a super administrator.
 * Usage: pnpm admin:create [email] [name]   (password from SEED_ADMIN_PASSWORD or prompt)
 */
import { createInterface } from 'node:readline/promises';
import { eq } from '@edushare/database';
import { createDb } from '@edushare/database';
import { adminRoles, admins, roles } from '@edushare/database/schema';
import { hashPassword } from '@edushare/auth';
import { passwordSchema } from '@edushare/shared';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const email = (process.argv[2] ?? process.env.SEED_ADMIN_EMAIL ?? '').toLowerCase();
  const name = process.argv[3] ?? process.env.SEED_ADMIN_NAME ?? 'Administrator';
  let password = process.env.SEED_ADMIN_PASSWORD ?? '';
  if (!email) throw new Error('Provide an email: pnpm admin:create you@example.com "Your Name"');
  if (!password) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    password = await rl.question('Password: ');
    rl.close();
  }
  const valid = passwordSchema.safeParse(password);
  if (!valid.success) throw new Error(valid.error.issues[0]?.message ?? 'Weak password');

  const { db, sql } = createDb(url, { max: 1 });
  try {
    const role = await db.query.roles.findFirst({ where: eq(roles.key, 'super_admin') });
    if (!role) throw new Error('Roles missing: run `pnpm db:seed` first');
    const passwordHash = await hashPassword(password);
    const existing = await db.query.admins.findFirst({ where: eq(admins.email, email) });
    let id: string;
    if (existing) {
      await db.update(admins).set({ passwordHash, name, isActive: true, passwordChangedAt: new Date() }).where(eq(admins.id, existing.id));
      id = existing.id;
      console.log(`Updated administrator ${email}`);
    } else {
      const [row] = await db.insert(admins).values({ email, name, passwordHash }).returning({ id: admins.id });
      id = row!.id;
      console.log(`Created administrator ${email}`);
    }
    await db.insert(adminRoles).values({ adminId: id, roleId: role.id }).onConflictDoNothing();
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  console.error((err as Error).message);
  process.exit(1);
});
