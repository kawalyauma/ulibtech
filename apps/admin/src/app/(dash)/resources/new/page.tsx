'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { FileUp, Loader2 } from 'lucide-react';
import { formatFileSize, titleFromFileName, type DuplicateCandidate } from '@edushare/shared';
import { Button, Card, NativeSelect, Label } from '@edushare/ui';
import { api, ApiRequestError, errorMessage } from '@/lib/api';
import { PageHeader } from '@/components/shell';
import { ResourceFields, toPayload, type ResourceFormValues } from '@/components/resource-fields';
import { useSession } from '@/components/providers';

const ACCEPT = '.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.odt,.jpg,.jpeg,.png,.webp,.txt';
const MAX_MB = Number(process.env.NEXT_PUBLIC_MAX_UPLOAD_MB ?? 100);

const schema = z
  .object({
    title: z.string().trim().min(3, 'Title is too short').max(200),
    slug: z
      .string()
      .regex(/^$|^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens')
      .optional(),
    seoTitle: z.string().max(70).optional(),
    seoDescription: z.string().max(170).optional(),
    shortDescription: z.string().max(300).optional(),
    canonicalUrl: z.union([z.literal(''), z.url()]).optional(),
  })
  .passthrough();

export default function NewResourcePage() {
  const router = useRouter();
  const { can } = useSession();
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const [fileError, setFileError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const form = useForm<ResourceFormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: { title: '', status: 'draft' },
  });

  const onFile = async (f: File | null) => {
    setFileError(null);
    setFile(f);
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) setFileError(`This file is larger than ${MAX_MB} MB.`);
    if (!form.getValues('title'))
      form.setValue('title', titleFromFileName(f.name), { shouldValidate: true });
    // Early duplicate warning by title.
    const res = await api
      .post<{ items: DuplicateCandidate[] }>('/resources/duplicates', {
        title: form.getValues('title'),
        sizeBytes: f.size,
      })
      .catch(() => null);
    setDuplicates(res?.items ?? []);
  };

  const onSubmit = form.handleSubmit(async (values) => {
    if (!file) {
      setFileError('Choose a file to upload.');
      return;
    }
    setServerErrors({});
    const payload = toPayload(values);
    const fd = new FormData();
    fd.set('metadata', JSON.stringify({ ...payload, status: values.status }));
    fd.set('file', file, file.name);
    setProgress(0);
    try {
      const res = await api.upload<{
        resource: { id: string };
        duplicates: DuplicateCandidate[];
        publishRequested: boolean;
      }>('/resources', fd, setProgress);
      toast.success(
        res.publishRequested
          ? 'Uploaded. It will be published as soon as processing finishes.'
          : 'Uploaded. Processing has started.',
      );
      if (res.duplicates.length)
        toast.warning(`Possible duplicate of “${res.duplicates[0]!.title}”`);
      router.push(`/resources/${res.resource.id}`);
    } catch (err) {
      setProgress(null);
      if (err instanceof ApiRequestError && err.fields) setServerErrors(err.fields);
      if (
        err instanceof ApiRequestError &&
        (err.code === 'UNSUPPORTED_MEDIA_TYPE' || err.code === 'PAYLOAD_TOO_LARGE')
      )
        setFileError(err.message);
      toast.error(errorMessage(err));
    }
  });

  return (
    <>
      <PageHeader
        title="Upload resource"
        description="Files are checked by signature, stored, then processed in the background (text extraction, thumbnail, search index)."
      />
      <form
        onSubmit={onSubmit}
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
        noValidate
      >
        <Card className="p-5">
          <ResourceFields form={form} serverErrors={serverErrors} />
        </Card>
        <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <Card className="flex flex-col gap-3 p-5">
            <Label htmlFor="file">File</Label>
            <label
              htmlFor="file"
              className="hover:border-primary flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void onFile(e.dataTransfer.files[0] ?? null);
              }}
            >
              <FileUp className="text-muted-foreground size-8" aria-hidden="true" />
              {file ? (
                <span className="font-medium break-all">
                  {file.name}{' '}
                  <span className="text-muted-foreground">({formatFileSize(file.size)})</span>
                </span>
              ) : (
                <span>
                  Drop a file here or <span className="text-primary underline">browse</span>
                </span>
              )}
              <span className="text-muted-foreground text-xs">
                PDF, Word, PowerPoint, Excel, images · max {MAX_MB} MB
              </span>
            </label>
            <input
              id="file"
              name="file"
              type="file"
              accept={ACCEPT}
              className="sr-only"
              onChange={(e) => void onFile(e.target.files?.[0] ?? null)}
            />
            {fileError ? (
              <p role="alert" className="text-destructive text-sm">
                {fileError}
              </p>
            ) : null}
            {duplicates.length ? (
              <div className="border-warning/50 bg-warning/10 rounded-md border p-3 text-xs">
                <p className="font-semibold">Possible duplicates</p>
                <ul className="mt-1 list-disc pl-4">
                  {duplicates.slice(0, 3).map((d) => (
                    <li key={d.id}>
                      <a
                        href={`/resources/${d.id}`}
                        className="underline"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {d.title}
                      </a>{' '}
                      – {d.reasons.join(', ')}
                    </li>
                  ))}
                </ul>
                <p className="text-muted-foreground mt-1">
                  You can still upload; nothing is removed automatically.
                </p>
              </div>
            ) : null}
            <Label htmlFor="status">After upload</Label>
            <NativeSelect id="status" {...form.register('status')}>
              <option value="draft">Save as draft</option>
              <option value="review">Mark for review</option>
              {can('resources.publish') ? (
                <option value="published">Publish when processing completes</option>
              ) : null}
            </NativeSelect>
            {progress !== null ? (
              <div className="flex flex-col gap-1" aria-live="polite">
                <div className="bg-muted h-2 overflow-hidden rounded-full">
                  <div
                    className="bg-primary h-full transition-[width]"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
                <span className="text-muted-foreground text-xs">
                  {progress < 1
                    ? `Uploading… ${Math.round(progress * 100)}%`
                    : 'Validating and saving…'}
                </span>
              </div>
            ) : null}
            <Button
              type="submit"
              size="lg"
              disabled={form.formState.isSubmitting || Boolean(fileError && file)}
            >
              {form.formState.isSubmitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}
              Upload resource
            </Button>
          </Card>
        </div>
      </form>
    </>
  );
}
