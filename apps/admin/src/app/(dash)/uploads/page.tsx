'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Loader2, X } from 'lucide-react';
import { formatFileSize, titleFromFileName } from '@edushare/shared';
import { Button, Card, Input, Label } from '@edushare/ui';
import { api, errorMessage } from '@/lib/api';
import { PageHeader } from '@/components/shell';
import { ResourceFields, toPayload, type ResourceFormValues } from '@/components/resource-fields';

type Result = {
  fileName: string;
  ok: boolean;
  resource?: { id: string; title: string };
  duplicates?: { title: string }[];
  error?: string;
};

export default function BulkUploadPage() {
  const [files, setFiles] = useState<{ file: File; title: string }[]>([]);
  const [progress, setProgress] = useState<number | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const form = useForm<ResourceFormValues>({ defaultValues: { title: 'bulk' } });

  const add = (list: FileList | null) => {
    if (!list) return;
    setFiles((prev) =>
      [
        ...prev,
        ...Array.from(list).map((file) => ({ file, title: titleFromFileName(file.name) })),
      ].slice(0, 50),
    );
  };

  const submit = form.handleSubmit(async (values) => {
    if (!files.length) return toast.error('Add at least one file');
    const { title: _t, slug: _s, ...common } = toPayload(values);
    const fd = new FormData();
    fd.set(
      'metadata',
      JSON.stringify({
        ...common,
        titles: Object.fromEntries(files.map((f) => [f.file.name, f.title])),
      }),
    );
    for (const f of files) fd.append('files', f.file, f.file.name);
    setProgress(0);
    try {
      const res = await api.upload<{ results: Result[] }>(
        '/resources/bulk-upload',
        fd,
        setProgress,
      );
      setResults(res.results);
      setFiles([]);
      const ok = res.results.filter((r) => r.ok).length;
      toast.success(`${ok} of ${res.results.length} files uploaded as drafts`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setProgress(null);
    }
  });

  return (
    <>
      <PageHeader
        title="Bulk upload"
        description="Upload up to 50 files with shared classification. Each becomes a draft you can review and publish."
      />
      <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="p-5">
          <p className="text-muted-foreground mb-4 text-sm">
            These values apply to every file in this batch.
          </p>
          <ResourceFields form={form} omit={['title', 'slug']} />
        </Card>
        <div className="flex flex-col gap-4">
          <Card className="flex flex-col gap-3 p-5">
            <Label htmlFor="files">Files</Label>
            <input
              id="files"
              type="file"
              multiple
              onChange={(e) => add(e.target.files)}
              className="text-sm"
            />
            <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto">
              {files.map((f, i) => (
                <li
                  key={`${f.file.name}-${i}`}
                  className="flex flex-col gap-1 rounded-md border p-2"
                >
                  <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
                    <span className="truncate">
                      {f.file.name} · {formatFileSize(f.file.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}
                      aria-label={`Remove ${f.file.name}`}
                    >
                      <X className="size-4" aria-hidden="true" />
                    </button>
                  </div>
                  <Input
                    value={f.title}
                    aria-label={`Title for ${f.file.name}`}
                    onChange={(e) =>
                      setFiles((all) =>
                        all.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)),
                      )
                    }
                  />
                </li>
              ))}
            </ul>
            {progress !== null ? (
              <p className="text-sm" aria-live="polite">
                Uploading… {Math.round(progress * 100)}%
              </p>
            ) : null}
            <Button type="submit" disabled={progress !== null || !files.length}>
              {progress !== null ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}{' '}
              Upload {files.length || ''} files
            </Button>
          </Card>
          {results ? (
            <Card className="p-5 text-sm">
              <p className="mb-2 font-semibold">Results</p>
              <ul className="flex flex-col gap-1.5">
                {results.map((r) => (
                  <li key={r.fileName}>
                    {r.ok && r.resource ? (
                      <Link href={`/resources/${r.resource.id}`} className="text-primary underline">
                        {r.resource.title}
                      </Link>
                    ) : (
                      <span className="text-destructive">
                        {r.fileName}: {r.error}
                      </span>
                    )}
                    {r.duplicates?.length ? (
                      <span className="text-accent-foreground ml-1 text-xs">
                        (possible duplicate)
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </form>
    </>
  );
}
