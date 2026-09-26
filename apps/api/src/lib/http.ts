import type { Context } from 'hono';
import type { HttpBindings } from '@hono/node-server';
import { AppError, type ErrorCode } from '@edushare/shared';
import type { z } from 'zod';
import type { AdminSessionInfo } from '@edushare/shared';

export interface AppVariables {
  requestId: string;
  admin?: AdminSessionInfo & { sessionId: string };
}

export type AppEnv = { Bindings: HttpBindings; Variables: AppVariables };
export type AppContext = Context<AppEnv>;

/** Parses input with a Zod schema, throwing a 422 with field errors on failure. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.message;
    }
    throw new AppError('VALIDATION_ERROR', 'Some fields are invalid', { fields });
  }
  return result.data;
}

export async function jsonBody(c: AppContext): Promise<unknown> {
  const type = c.req.header('content-type') ?? '';
  if (!type.includes('application/json')) throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'Expected application/json');
  try {
    return await c.req.json();
  } catch {
    throw new AppError('BAD_REQUEST', 'Malformed JSON body');
  }
}

export function query(c: AppContext): Record<string, string> {
  return c.req.query();
}

export function errorResponse(c: AppContext, code: ErrorCode, message: string, status: number, details?: unknown) {
  return c.json({ error: { code, message, ...(details ? { details } : {}) } }, status as 400);
}

/** Client IP; honours proxy headers only when TRUST_PROXY is enabled (behind Nginx). */
export function clientIp(c: AppContext): string | null {
  if (process.env.TRUST_PROXY === 'true') {
    const real = c.req.header('x-real-ip');
    if (real) return real.trim();
    const fwd = c.req.header('x-forwarded-for');
    if (fwd) return fwd.split(',')[0]!.trim();
  }
  const addr = c.env?.incoming?.socket?.remoteAddress ?? null;
  return addr?.replace(/^::ffff:/, '') ?? null;
}

export const CACHE_PUBLIC_SHORT = 'public, max-age=60, s-maxage=300, stale-while-revalidate=600';
export const CACHE_PUBLIC_LONG = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';
export const CACHE_NONE = 'no-store';
