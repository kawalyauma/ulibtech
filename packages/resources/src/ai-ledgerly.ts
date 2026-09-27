/**
 * Transport for AI enrichment through a self-hosted Ledgerly server, which runs the request on
 * its own Codex / Claude Code workers. Configure LEDGERLY_AI_URL and LEDGERLY_AI_API_KEY (an
 * API key with the `ai:write` scope).
 */
export function ledgerlyConfigured(): boolean {
  return Boolean(process.env.LEDGERLY_AI_URL && process.env.LEDGERLY_AI_API_KEY);
}

export interface LedgerlyCompletion {
  json: Record<string, unknown>;
  provider: string;
  durationMs: number;
}

export async function ledgerlyCompleteJson(
  system: string,
  prompt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<LedgerlyCompletion> {
  const base = (process.env.LEDGERLY_AI_URL ?? '').replace(/\/$/, '');
  const res = await fetchImpl(`${base}/api/v1/ledgerly-ai/integrations/complete`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.LEDGERLY_AI_API_KEY ?? '',
    },
    body: JSON.stringify({ system, prompt, responseFormat: 'json' }),
    // Provider jobs start a fresh worker container, so allow several minutes.
    signal: AbortSignal.timeout(Number(process.env.LEDGERLY_AI_TIMEOUT_MS ?? 360_000)),
  });
  const body = (await res.json().catch(() => null)) as {
    data?: { json?: Record<string, unknown> | null; provider?: string; durationMs?: number };
    error?: { code?: string; message?: string };
  } | null;
  if (!res.ok || !body?.data?.json) {
    const reason = body?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(`Ledgerly AI request failed: ${reason}`);
  }
  return {
    json: body.data.json,
    provider: body.data.provider ?? 'ledgerly',
    durationMs: body.data.durationMs ?? 0,
  };
}
