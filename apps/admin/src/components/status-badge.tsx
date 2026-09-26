import { Badge } from '@edushare/ui';

const STATUS: Record<
  string,
  { label: string; variant: 'success' | 'muted' | 'warning' | 'destructive' | 'outline' }
> = {
  published: { label: 'Published', variant: 'success' },
  draft: { label: 'Draft', variant: 'muted' },
  review: { label: 'In review', variant: 'warning' },
  unpublished: { label: 'Unpublished', variant: 'outline' },
  archived: { label: 'Archived', variant: 'outline' },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, variant: 'outline' as const };
  return <Badge variant={s.variant}>{s.label}</Badge>;
}

export function ProcessingBadge({ status, scan }: { status: string | null; scan?: string | null }) {
  if (scan === 'infected') return <Badge variant="destructive">Blocked by scan</Badge>;
  if (!status) return null;
  if (status === 'ready') return <Badge variant="success">Processed</Badge>;
  if (status === 'failed') return <Badge variant="destructive">Processing failed</Badge>;
  return <Badge variant="warning">{status === 'processing' ? 'Processing…' : 'Queued'}</Badge>;
}
