'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Download, FileSpreadsheet, Loader2, XCircle } from 'lucide-react';
import { Button, Card, Label, Table, TBody, THead, Td, Th, Tr } from '@edushare/ui';
import { api, errorMessage } from '@/lib/api';
import { PageHeader } from '@/components/shell';

interface ResolvedRow {
  row: number;
  fileName: string | null;
  slug: string | null;
  existingId: string | null;
  metadata: { title?: string };
  labels: Record<string, string>;
  errors: string[];
  warnings: string[];
}
interface ImportResult {
  results: {
    row: number;
    ok: boolean;
    action: string;
    id?: string;
    title?: string;
    error?: string;
  }[];
  unmatchedFiles: string[];
}

export default function ImportPage() {
  const [sheet, setSheet] = useState<File | null>(null);
  const [rows, setRows] = useState<ResolvedRow[] | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<'validate' | 'import' | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);

  const validate = async (f: File) => {
    setSheet(f);
    setResult(null);
    setBusy('validate');
    try {
      const fd = new FormData();
      fd.set('sheet', f, f.name);
      const res = await api.upload<{ rows: ResolvedRow[]; valid: number; invalid: number }>(
        '/resources/import/validate',
        fd,
      );
      setRows(res.rows);
      toast[res.invalid ? 'warning' : 'success'](
        `${res.valid} valid rows, ${res.invalid} with problems`,
      );
    } catch (err) {
      toast.error(errorMessage(err));
      setRows(null);
    } finally {
      setBusy(null);
    }
  };

  const needed = new Set(
    (rows ?? [])
      .filter((r) => r.fileName && !r.errors.length)
      .map((r) => r.fileName!.toLowerCase()),
  );
  const chosen = new Set(files.map((f) => f.name.toLowerCase()));
  const missing = [...needed].filter((n) => !chosen.has(n));

  const run = async () => {
    if (!sheet) return;
    setBusy('import');
    setProgress(0);
    try {
      const fd = new FormData();
      fd.set('sheet', sheet, sheet.name);
      for (const f of files) fd.append('files', f, f.name);
      const res = await api.upload<ImportResult>('/resources/import', fd, setProgress);
      setResult(res);
      toast.success(`${res.results.filter((r) => r.ok).length} rows imported`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Import from spreadsheet"
        description="Describe many files in a CSV or Excel sheet, then upload the files together. Rows with a slug and no file name update existing resources."
        actions={
          <Button variant="outline" asChild>
            <a href="/api/admin/resources/import/template">
              <Download className="size-4" aria-hidden="true" /> Download template
            </a>
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="overflow-hidden">
          {rows ? (
            <Table>
              <THead>
                <Tr>
                  <Th>Row</Th>
                  <Th>File / slug</Th>
                  <Th>Title</Th>
                  <Th>Classification</Th>
                  <Th>Status</Th>
                </Tr>
              </THead>
              <TBody>
                {rows.map((r) => {
                  const res = result?.results.find((x) => x.row === r.row);
                  return (
                    <Tr key={r.row}>
                      <Td className="tabular-nums">{r.row}</Td>
                      <Td className="max-w-40 truncate text-xs">{r.fileName ?? r.slug}</Td>
                      <Td className="max-w-56 truncate">
                        {r.metadata.title ?? r.labels.existing ?? '—'}
                      </Td>
                      <Td className="text-muted-foreground text-xs">
                        {[
                          r.labels.class,
                          r.labels.subject,
                          r.labels.type,
                          r.labels.year,
                          r.labels.term,
                        ]
                          .filter(Boolean)
                          .join(' · ') || '—'}
                      </Td>
                      <Td className="text-xs">
                        {res ? (
                          res.ok ? (
                            <span className="text-success inline-flex items-center gap-1">
                              <CheckCircle2 className="size-4" aria-hidden="true" />
                              {res.id ? (
                                <Link href={`/resources/${res.id}`} className="underline">
                                  {res.action}
                                </Link>
                              ) : (
                                res.action
                              )}
                            </span>
                          ) : (
                            <span className="text-destructive">{res.error}</span>
                          )
                        ) : r.errors.length ? (
                          <span className="text-destructive inline-flex items-start gap-1">
                            <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{' '}
                            {r.errors.join('; ')}
                          </span>
                        ) : (
                          <span className="text-success">
                            {r.existingId
                              ? 'Will update'
                              : chosen.has((r.fileName ?? '').toLowerCase())
                                ? 'Ready'
                                : 'Needs file'}
                          </span>
                        )}
                        {r.warnings.length ? (
                          <p className="text-accent-foreground">{r.warnings.join('; ')}</p>
                        ) : null}
                      </Td>
                    </Tr>
                  );
                })}
              </TBody>
            </Table>
          ) : (
            <div className="text-muted-foreground flex flex-col items-center gap-3 p-10 text-center text-sm">
              <FileSpreadsheet className="size-10" aria-hidden="true" />
              <p>Choose a spreadsheet to preview and validate its rows.</p>
              <p className="text-xs">
                Columns: file_name, slug, title, description, short_description, class, subject,
                type, year, term, topic, subtopic, curriculum, tags, keywords, author, publisher,
                featured, status.
              </p>
            </div>
          )}
        </Card>
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3 p-5">
            <Label htmlFor="sheet">1. Metadata spreadsheet (.csv or .xlsx)</Label>
            <input
              id="sheet"
              type="file"
              accept=".csv,.xlsx,text/csv"
              className="text-sm"
              onChange={(e) => e.target.files?.[0] && void validate(e.target.files[0])}
            />
            {busy === 'validate' ? (
              <p className="text-muted-foreground text-sm">Validating…</p>
            ) : null}
          </Card>
          <Card className="flex flex-col gap-3 p-5">
            <Label htmlFor="files">2. Files named in the sheet</Label>
            <input
              id="files"
              type="file"
              multiple
              className="text-sm"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            <p className="text-muted-foreground text-xs">
              {files.length} files chosen
              {missing.length ? ` · ${missing.length} still missing` : ''}
            </p>
            {missing.length ? (
              <p className="text-destructive text-xs">
                Missing: {missing.slice(0, 5).join(', ')}
                {missing.length > 5 ? '…' : ''}
              </p>
            ) : null}
          </Card>
          {busy === 'import' ? (
            <p className="text-sm" aria-live="polite">
              {progress < 1 ? `Uploading… ${Math.round(progress * 100)}%` : 'Processing rows…'}
            </p>
          ) : null}
          <Button
            onClick={run}
            disabled={!rows || busy !== null || rows.every((r) => r.errors.length)}
          >
            {busy === 'import' ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : null}{' '}
            3. Import
          </Button>
          {result?.unmatchedFiles.length ? (
            <p className="text-muted-foreground text-xs">
              Not in the sheet (ignored): {result.unmatchedFiles.join(', ')}
            </p>
          ) : null}
        </div>
      </div>
    </>
  );
}
