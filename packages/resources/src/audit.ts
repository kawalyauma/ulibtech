import { auditLogs } from '@edushare/database/schema';
import type { Actor, ServiceContext } from './context';

export async function recordAudit(
  ctx: Pick<ServiceContext, 'db'>,
  actor: Actor | null,
  entry: {
    action: string;
    entityType: string;
    entityId?: string | null;
    entityLabel?: string | null;
    changes?: Record<string, unknown> | null;
  },
): Promise<void> {
  await ctx.db.insert(auditLogs).values({
    adminId: actor?.id || null,
    adminName: actor?.name ?? 'system',
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    entityLabel: entry.entityLabel?.slice(0, 300) ?? null,
    changes: entry.changes ?? null,
    ipAddress: actor?.ip ?? null,
  });
}

/** Returns only the fields whose values changed, as { field: { from, to } }. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(after)) {
    if (v === undefined) continue;
    const prev = before[k];
    const same = JSON.stringify(prev ?? null) === JSON.stringify(v ?? null);
    if (!same) out[k] = { from: prev ?? null, to: v ?? null };
  }
  return out;
}
