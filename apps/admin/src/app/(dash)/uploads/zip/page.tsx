'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileArchive, Loader2, RefreshCw } from 'lucide-react';
import { Badge, Button, Card, Label, Table, TBody, THead, Td, Th, Tr } from '@edushare/ui';
import { api, ApiRequestError, errorMessage, uploadChunk } from '@/lib/api';
import { PageHeader } from '@/components/shell';
import { StatusBadge } from '@/components/status-badge';

interface Batch {
  id: string;
  fileName: string;
  status: 'queued' | 'extracting' | 'done' | 'failed';
  createdAt: string;
  createdBy: string;
  total: number;
  created: number;
  skipped: number;
  failed: number;
  error?: string;
}
interface BatchDetail {
  batch: Batch;
  resources: {
    path: string;
    status: 'created' | 'skipped' | 'failed';
    reason?: string;
    resource: {
      id: string;
      title: string;
      slug: string;
      status: string;
      reasons: string[] | null;
      checked: boolean;
    } | null;
  }[];
}

const BATCH_LABEL: Record<Batch['status'], string> = {
  queued: 'Waiting to unpack',
  extracting: 'Unpacking…',
  done: 'Unpacked',
  failed: 'Failed',
};

/** What happened to one file, in plain words. */
function Outcome({ item }: { item: BatchDetail['resources'][number] }) {
  if (item.status === 'skipped')
    return <span className="text-muted-foreground">Skipped: {item.reason}</span>;
  if (item.status === 'failed')
    return <span className="text-destructive">Failed: {item.reason}</span>;
  const r = item.resource;
  if (!r) return <span className="text-muted-foreground">Removed</span>;
  if (r.status === 'published') return <span className="text-success">Published by AI</span>;
  if (!r.checked)
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1">
        <Loader2 className="size-3 animate-spin" aria-hidden="true" /> AI is reading it…
      </span>
    );
  return (
    <span className="text-accent-foreground">
      Needs your review: {(r.reasons ?? []).join(' ') || 'held back'}
    </span>
  );
}

export default function ZipImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const qc = useQueryClient();

  // Both lists refresh every 10 s so unpacking and AI progress show up without reloading.
  const batchesQuery = useQuery({
    queryKey: ['zip-imports'],
    queryFn: () => api.get<{ items: Batch[] }>('/resources/zip-imports'),
    refetchInterval: 10_000,
  });
  const batches = batchesQuery.data?.items ?? [];
  const selected = chosen ?? batches[0]?.id ?? null;
  const detailQuery = useQuery({
    queryKey: ['zip-import', selected],
    queryFn: () => api.get<BatchDetail>(`/resources/zip-imports/${selected}`),
    enabled: Boolean(selected),
    refetchInterval: 10_000,
  });
  const detail = detailQuery.data ?? null;

  const [note, setNote] = useState<string | null>(null);

  // Resumable chunked upload: each 16 MB chunk is retried on its own, so a dropped
  // connection costs seconds instead of restarting a multi-GB upload.
  const upload = async () => {
    if (!file) return;
    setProgress(0);
    setNote(null);
    const leave = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', leave);
    try {
      const { upload: u } = await api.post<{
        upload: { id: string; chunkSize: number; totalChunks: number };
      }>('/resources/zip-uploads', { fileName: file.name, size: file.size });
      const inFlight = new Map<number, number>();
      let doneBytes = 0;
      const report = () =>
        setProgress((doneBytes + [...inFlight.values()].reduce((a, b) => a + b, 0)) / file.size);
      const queue = Array.from({ length: u.totalChunks }, (_, i) => i);
      const sendChunk = async (i: number) => {
        const blob = file.slice(i * u.chunkSize, Math.min(file.size, (i + 1) * u.chunkSize));
        for (let attempt = 1; ; attempt++) {
          try {
            await uploadChunk(`/resources/zip-uploads/${u.id}/chunks/${i}`, blob, (b) => {
              inFlight.set(i, b);
              report();
            });
            inFlight.delete(i);
            doneBytes += blob.size;
            report();
            return;
          } catch (err) {
            inFlight.delete(i);
            const status = err instanceof ApiRequestError ? err.status : 0;
            const retryable = status === 0 || status === 408 || status === 429 || status >= 500;
            if (!retryable || attempt >= 8) throw err;
            const wait = Math.min(60, 2 ** attempt);
            setNote(`Connection hiccup on part ${i + 1}; retrying in ${wait}s…`);
            await new Promise((r) => setTimeout(r, wait * 1000));
            setNote(null);
          }
        }
      };
      await Promise.all(
        [0, 1, 2].map(async () => {
          for (let i = queue.shift(); i !== undefined; i = queue.shift()) await sendChunk(i);
        }),
      );
      setNote('Joining the parts on the server…');
      const res = await api.post<{ batch: Batch }>(`/resources/zip-uploads/${u.id}/complete`);
      toast.success('Zip uploaded. It will be unpacked and processed in the background.');
      setFile(null);
      setChosen(res.batch.id);
      await qc.invalidateQueries({ queryKey: ['zip-imports'] });
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      window.removeEventListener('beforeunload', leave);
      setProgress(null);
      setNote(null);
    }
  };

  const rows = detail?.resources ?? [];
  const published = rows.filter((r) => r.resource?.status === 'published').length;
  const review = rows.filter(
    (r) => r.resource && r.resource.checked && r.resource.status !== 'published',
  ).length;
  const working = rows.filter((r) => r.resource && !r.resource.checked).length;

  return (
    <>
      <PageHeader
        title="Zip import"
        description="Upload one .zip of documents. Each file is scanned, read (with OCR for scans), classified and described by AI, then published automatically when it passes the quality checks. Anything that fails stays a draft with the reason."
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          {detail ? (
            <>
              <div className="flex flex-wrap items-center gap-2 border-b p-4 text-sm">
                <FileArchive className="size-4" aria-hidden="true" />
                <strong className="truncate">{detail.batch.fileName}</strong>
                <Badge variant={detail.batch.status === 'failed' ? 'destructive' : 'muted'}>
                  {BATCH_LABEL[detail.batch.status]}
                </Badge>
                <span className="text-muted-foreground">
                  {detail.batch.total} files · {published} published · {review} need review ·{' '}
                  {working} with AI · {detail.batch.skipped} skipped · {detail.batch.failed} failed
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  onClick={() => void detailQuery.refetch()}
                  aria-label="Refresh"
                >
                  <RefreshCw className="size-4" aria-hidden="true" />
                </Button>
              </div>
              {detail.batch.error ? (
                <p className="text-destructive p-4 text-sm">{detail.batch.error}</p>
              ) : null}
              <Table>
                <THead>
                  <Tr>
                    <Th>File in zip</Th>
                    <Th>Resource</Th>
                    <Th>Status</Th>
                    <Th>Outcome</Th>
                  </Tr>
                </THead>
                <TBody>
                  {rows.map((r) => (
                    <Tr key={r.path}>
                      <Td className="max-w-48 truncate text-xs" title={r.path}>
                        {r.path}
                      </Td>
                      <Td className="max-w-56 truncate">
                        {r.resource ? (
                          <Link href={`/resources/${r.resource.id}`} className="underline">
                            {r.resource.title}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </Td>
                      <Td>{r.resource ? <StatusBadge status={r.resource.status} /> : null}</Td>
                      <Td className="text-xs">
                        <Outcome item={r} />
                      </Td>
                    </Tr>
                  ))}
                </TBody>
              </Table>
            </>
          ) : (
            <div className="text-muted-foreground flex flex-col items-center gap-3 p-10 text-center text-sm">
              <FileArchive className="size-10" aria-hidden="true" />
              <p>Upload a zip to start. Its progress will show here.</p>
              <p className="text-xs">
                Tip: folders help classification, e.g.{' '}
                <code>P6/Science/Past Papers/term 2.pdf</code>.
              </p>
            </div>
          )}
        </Card>
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3 p-5">
            <Label htmlFor="zip">Zip file</Label>
            <input
              id="zip"
              type="file"
              accept=".zip,application/zip"
              className="text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-muted-foreground text-xs">
              PDF, Word, PowerPoint, Excel, ODT, text and images, in any folders (up to 4 GB).
              Folder names help classification. Duplicates of files already on the site are skipped.
            </p>
            <Button onClick={upload} disabled={!file || progress !== null}>
              {progress !== null ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Uploading{' '}
                  {Math.round(progress * 100)}%
                </>
              ) : (
                'Upload and process'
              )}
            </Button>
            {note ? (
              <p className="text-muted-foreground text-xs" aria-live="polite">
                {note}
              </p>
            ) : null}
          </Card>
          {batches.length ? (
            <Card className="flex flex-col gap-1 p-3">
              <p className="text-muted-foreground px-2 py-1 text-xs font-medium">Recent imports</p>
              {batches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setChosen(b.id)}
                  className={`hover:bg-muted rounded-md px-2 py-1.5 text-left text-sm ${
                    b.id === selected ? 'bg-muted font-medium' : ''
                  }`}
                >
                  <span className="block truncate">{b.fileName}</span>
                  <span className="text-muted-foreground text-xs">
                    {new Date(b.createdAt).toLocaleString()} · {b.created} imported
                  </span>
                </button>
              ))}
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
