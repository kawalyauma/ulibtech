import { z } from 'zod';

const bool = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SITE_NAME: z.string().default('EduShare Uganda'),
  PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),
  ADMIN_SITE_URL: z.url().default('http://localhost:3001'),
  API_INTERNAL_URL: z.url().default('http://localhost:4000'),
  WEB_INTERNAL_URL: z.url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1).default('postgres://edushare:edushare@localhost:5432/edushare'),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),
  API_PORT: z.coerce.number().int().default(4000),
  ADMIN_ALLOWED_ORIGINS: z.string().default('http://localhost:3001'),
  COOKIE_SECURE: bool,
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).default(120),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).default(12),
  ANALYTICS_SALT: z.string().min(8).default('dev-analytics-salt'),
  REVALIDATE_SECRET: z.string().min(8).default('dev-revalidate-secret'),
  STORAGE_DRIVER: z.enum(['local']).default('local'),
  STORAGE_ROOT: z.string().default('./storage'),
  STORAGE_ACCEL_REDIRECT: bool,
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(2048).default(100),
  SEARCH_PROVIDER: z.enum(['postgres']).default('postgres'),
  TRUST_PROXY: bool,
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

/** Parses and caches server environment variables. Throws with a readable message on error. */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}
