'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import {
  Archive,
  ExternalLink,
  EyeOff,
  Globe,
  ImageUp,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
} from 'lucide-react';
import { formatDate, formatFileSize, formatNumber } from '@edushare/shared';
import {
  AdminTableSkeleton,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
} from '@edushare/ui';
import { api, ApiRequestError, errorMessage } from '@/lib/api';
import type { AdminResource } from '@/lib/types';
import { PageHeader } from '@/components/shell';
import { ResourceFields, toPayload, type ResourceFormValues } from '@/components/resource-fields';
import { ProcessingBadge, StatusBadge } from '@/components/status-badge';
import { ErrorState, siteUrl } from '@/components/report';
import { BarChart } from '@/components/bar-chart';
import { useSession } from '@/components/providers';
import { SuggestionsPanel } from '@/components/suggestions-panel';

function toForm(r: AdminResource): ResourceFormValues {
  return {
    title: r.title,
    slug: r.slug,
    description: r.description ?? '',
    shortDescription: r.shortDescription ?? '',
    classId: r.ids.classId ?? '',
    subjectId: r.ids.subjectId ?? '',
    resourceTypeId: r.ids.resourceTypeId ?? '',
    academicYearId: r.ids.academicYearId ?? '',
    termId: r.ids.termId ?? '',
    topicId: r.ids.topicId ?? '',
    subtopicId: r.ids.subtopicId ?? '',
    curriculumId: r.ids.curriculumId ?? '',
    topic: r.topicText ?? '',
    subtopic: r.subtopicText ?? '',
    tags: r.tags.map((t) => t.name).join(', '),
    keywords: r.keywords.join(', '),
    author: r.author ?? '',
    publisher: r.publisher ?? '',
    featured: r.featured,
    seoTitle: r.seoTitle ?? '',
    seoDescription: r.seoDescription ?? '',
    canonicalUrl: r.canonicalUrl ?? '',
  };
}

export default function EditResourcePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const { can } = useSession();
  const fileRef = useRef<HTMLInputElement>(null);
  const thumbRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState('');
  const [serverErrors, setServerErrors] = useState<Record<string, string>>({});
  const q = useQuery({
    queryKey: ['resource', id],
    queryFn: () => api.get<AdminResource>(`/resources/${id}`),
    refetchInterval: (query) => {
      const s = query.state.data?.processing?.status;
      return s === 'pending' || s === 'processing' ? 2500 : false;
    },
  });
  const form = useForm<ResourceFormValues>({ defaultValues: { title: '' } });
  const loadedAt = useRef<string | null>(null);
  useEffect(() => {
    // Reset the form only when the saved record changes (not on processing polls).
    if (q.data && loadedAt.current !== q.data.updatedAt) {
      loadedAt.current = q.data.updatedAt;
      form.reset(toForm(q.data));
    }
  }, [q.data, form]);

  const refresh = (data: AdminResource) => {
    qc.setQueryData(['resource', id], data);
    void qc.invalidateQueries({ queryKey: ['resources'] });
  };
  const onError = (e: unknown) => {
    if (e instanceof ApiRequestError && e.fields) setServerErrors(e.fields);
    toast.error(errorMessage(e));
  };

  const save = useMutation({
    mutationFn: (v: ResourceFormValues) =>
      api.patch<AdminResource>(`/resources/${id}`, toPayload(v)),
    onSuccess: (d) => {
      setServerErrors({});
      refresh(d);
      toast.success('Changes saved');
    },
    onError,
  });
  const status = useMutation({
    mutationFn: (action: 'publish' | 'unpublish' | 'archive') =>
      api.post<AdminResource>(`/resources/${id}/${action}`),
    onSuccess: (d) => {
      refresh(d);
      toast.success(`Resource ${d.status}`);
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: () => api.delete(`/resources/${id}`),
    onSuccess: () => {
      toast.success('Resource deleted');
      void qc.invalidateQueries({ queryKey: ['resources'] });
      router.push('/resources');
    },
    onError,
  });
  const replace = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.set('notes', notes);
      fd.set('file', file, file.name);
      return api.upload<AdminResource>(`/resources/${id}/file`, fd);
    },
    onSuccess: (d) => {
      refresh(d);
      setNotes('');
      toast.success('New version uploaded');
    },
    onError,
  });
  const activate = useMutation({
    mutationFn: (versionId: string) =>
      api.post<AdminResource>(`/resources/${id}/versions/${versionId}/activate`),
    onSuccess: (d) => {
      refresh(d);
      toast.success('Version is now public');
    },
    onError,
  });
  const thumb = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.set('file', file, file.name);
      return api.upload<AdminResource>(`/resources/${id}/thumbnail`, fd);
    },
    onSuccess: (d) => {
      refresh(d);
      toast.success('Thumbnail updated');
    },
    onError,
  });
  const reprocess = useMutation({
    mutationFn: () => api.post(`/resources/${id}/reprocess`),
    onSuccess: () => {
      toast.success('Reprocessing queued');
      setTimeout(() => void q.refetch(), 1500);
    },
    onError,
  });

  if (q.isLoading) return <AdminTableSkeleton rows={6} columns={2} />;
  if (q.error || !q.data)
    return <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />;
  const r = q.data;
  const processing = r.processing;
  const busy = status.isPending;

  return (
    <>
      <PageHeader
        title={r.title}
        description={`/resources/${r.slug}`}
        actions={
          <>
            {r.status === 'published' ? (
              <Button variant="outline" asChild>
                <a href={`${siteUrl}/resources/${r.slug}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-4" aria-hidden="true" /> View live
                </a>
              </Button>
            ) : null}
            {can('resources.publish') && r.status !== 'published' ? (
              <Button
                onClick={() => status.mutate('publish')}
                disabled={busy}
                data-testid="publish"
              >
                {busy ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Globe className="size-4" aria-hidden="true" />
                )}{' '}
                Publish
              </Button>
            ) : null}
            {can('resources.publish') && r.status === 'published' ? (
              <Button
                variant="outline"
                onClick={() => status.mutate('unpublish')}
                disabled={busy}
                data-testid="unpublish"
              >
                <EyeOff className="size-4" aria-hidden="true" /> Unpublish
              </Button>
            ) : null}
            {can('resources.publish') && r.status !== 'archived' ? (
              <Button variant="outline" onClick={() => status.mutate('archive')} disabled={busy}>
                <Archive className="size-4" aria-hidden="true" /> Archive
              </Button>
            ) : null}
            {can('resources.delete') ? (
              <Button
                variant="destructive"
                onClick={() =>
                  confirm(
                    'Delete this resource and all its files permanently? This cannot be undone.',
                  ) && remove.mutate()
                }
                data-testid="delete"
              >
                <Trash2 className="size-4" aria-hidden="true" /> Delete
              </Button>
            ) : null}
          </>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <StatusBadge status={r.status} />
        <ProcessingBadge status={processing?.status ?? null} scan={processing?.scanStatus} />
        <span className="text-muted-foreground">
          {formatNumber(r.viewCount)} views · {formatNumber(r.downloadCount)} downloads ·{' '}
          {formatNumber(r.shareCount)} shares
        </span>
      </div>

      {processing?.error ? (
        <ErrorState message={`Processing: ${processing.error}`} retry={() => reprocess.mutate()} />
      ) : null}
      {r.duplicates.length ? (
        <div className="border-warning/50 bg-warning/10 mb-4 rounded-lg border p-4 text-sm">
          <p className="font-semibold">Possible duplicates</p>
          <ul className="mt-1 list-disc pl-5">
            {r.duplicates.map((d) => (
              <li key={d.id}>
                <a className="underline" href={`/resources/${d.id}`}>
                  {d.title}
                </a>{' '}
                <StatusBadge status={d.status} /> — {d.reasons.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="flex flex-col gap-4">
          <Card className="p-5">
            <ResourceFields form={form} serverErrors={serverErrors} />
          </Card>
          <div className="bg-muted/80 sticky bottom-0 flex justify-end gap-2 border-t py-3 backdrop-blur">
            <Button type="button" variant="outline" onClick={() => form.reset(toForm(r))}>
              Discard changes
            </Button>
            <Button type="submit" disabled={save.isPending || !can('resources.update')}>
              {save.isPending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : null}{' '}
              Save changes
            </Button>
          </div>
        </form>

        <div className="flex flex-col gap-4">
          <SuggestionsPanel resource={r} canEdit={can('resources.update')} />
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">File</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              {r.thumbnail ? (
                <img
                  src={r.thumbnail.src}
                  alt={r.thumbnail.alt}
                  className="mx-auto w-32 rounded border"
                />
              ) : null}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">Original name</dt>
                <dd className="truncate" title={processing?.originalName}>
                  {processing?.originalName}
                </dd>
                <dt className="text-muted-foreground">Type</dt>
                <dd>{r.fileDetail?.label}</dd>
                <dt className="text-muted-foreground">Size</dt>
                <dd>{formatFileSize(r.fileDetail?.sizeBytes)}</dd>
                <dt className="text-muted-foreground">Pages</dt>
                <dd>{r.fileDetail?.pageCount ?? '—'}</dd>
                <dt className="text-muted-foreground">Online preview</dt>
                <dd>
                  {r.fileDetail?.previewable
                    ? processing?.hasPreview
                      ? 'PDF rendition'
                      : 'Yes'
                    : 'No'}
                </dd>
                <dt className="text-muted-foreground">Text source</dt>
                <dd>{processing?.ocrApplied ? 'OCR (scanned)' : 'Document text'}</dd>
                <dt className="text-muted-foreground">Security scan</dt>
                <dd>{processing?.scanStatus}</dd>
                <dt className="text-muted-foreground">Processed</dt>
                <dd>{processing?.processedAt ? formatDate(processing.processedAt) : '—'}</dd>
              </dl>
              {can('resources.update') ? (
                <div className="flex flex-col gap-2 border-t pt-3">
                  <Input
                    placeholder="Version notes (optional)"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    aria-label="Version notes"
                  />
                  <input
                    ref={fileRef}
                    type="file"
                    className="sr-only"
                    onChange={(e) => e.target.files?.[0] && replace.mutate(e.target.files[0])}
                    aria-label="Replace file"
                  />
                  <Button
                    variant="outline"
                    onClick={() => fileRef.current?.click()}
                    disabled={replace.isPending}
                  >
                    {replace.isPending ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Upload className="size-4" aria-hidden="true" />
                    )}{' '}
                    Upload new version
                  </Button>
                  <input
                    ref={thumbRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(e) => e.target.files?.[0] && thumb.mutate(e.target.files[0])}
                    aria-label="Custom thumbnail"
                  />
                  <Button
                    variant="outline"
                    onClick={() => thumbRef.current?.click()}
                    disabled={thumb.isPending}
                  >
                    <ImageUp className="size-4" aria-hidden="true" /> Custom thumbnail
                  </Button>
                  <Button variant="ghost" onClick={() => reprocess.mutate()}>
                    <RefreshCw className="size-4" aria-hidden="true" /> Reprocess file
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Versions</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-2 text-sm">
                {r.versions.map((v) => (
                  <li
                    key={v.id}
                    className="flex items-start justify-between gap-2 rounded-md border p-2"
                  >
                    <div>
                      <p className="font-medium">
                        Version {v.versionNumber}{' '}
                        {v.isCurrent ? (
                          <span className="text-success text-xs">(public)</span>
                        ) : null}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {formatDate(v.createdAt)} · {v.file.originalName} ·{' '}
                        {formatFileSize(v.file.sizeBytes)}
                      </p>
                      {v.notes ? <p className="text-xs">{v.notes}</p> : null}
                    </div>
                    {!v.isCurrent && can('resources.update') ? (
                      <Button size="xs" variant="outline" onClick={() => activate.mutate(v.id)}>
                        Make public
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Downloads (30 days)</CardTitle>
            </CardHeader>
            <CardContent>
              <BarChart
                data={r.stats.map((s) => ({ day: s.day, value: s.downloads }))}
                label="downloads"
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
