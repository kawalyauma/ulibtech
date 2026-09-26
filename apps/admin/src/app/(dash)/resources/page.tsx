'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';
import { formatNumber } from '@edushare/shared';
import {
  AdminTableSkeleton,
  Button,
  Checkbox,
  Input,
  NativeSelect,
  Table,
  TBody,
  THead,
  Td,
  Th,
  Tr,
} from '@edushare/ui';
import { api, errorMessage } from '@/lib/api';
import type { AdminResourceRow, Paginated } from '@/lib/types';
import { useTaxonomyOptions } from '@/lib/taxonomy';
import { PageHeader } from '@/components/shell';
import { ProcessingBadge, StatusBadge } from '@/components/status-badge';
import { ErrorState } from '@/components/report';
import { useSession } from '@/components/providers';

export default function ResourcesPage() {
  const qc = useQueryClient();
  const { can } = useSession();
  const { data: tax } = useTaxonomyOptions();
  const [filters, setFilters] = useState({
    q: '',
    status: '',
    classId: '',
    subjectId: '',
    resourceTypeId: '',
    sort: 'updated',
    page: 1,
  });
  const [selected, setSelected] = useState<string[]>([]);
  const qs = new URLSearchParams(
    Object.entries(filters)
      .filter(([, v]) => v !== '' && v !== undefined)
      .map(([k, v]) => [k, String(v)]),
  );
  const list = useQuery({
    queryKey: ['resources', qs.toString()],
    queryFn: () => api.get<Paginated<AdminResourceRow>>(`/resources?${qs.toString()}&pageSize=25`),
    placeholderData: keepPreviousData,
    refetchInterval: (q) =>
      q.state.data?.items.some(
        (r) => r.processingStatus === 'pending' || r.processingStatus === 'processing',
      )
        ? 4000
        : false,
  });
  const bulk = useMutation({
    mutationFn: (action: string) =>
      api.post<{ results: { ok: boolean; error?: string }[] }>('/resources/bulk', {
        ids: selected,
        action,
      }),
    onSuccess: (res) => {
      const failed = res.results.filter((r) => !r.ok);
      if (failed.length) toast.error(`${failed.length} failed: ${failed[0]?.error}`);
      else toast.success('Done');
      setSelected([]);
      void qc.invalidateQueries({ queryKey: ['resources'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const set = (k: keyof typeof filters, v: string | number) =>
    setFilters((f) => ({ ...f, [k]: v, page: k === 'page' ? Number(v) : 1 }));
  const items = list.data?.items ?? [];
  const allSelected = items.length > 0 && items.every((i) => selected.includes(i.id));

  return (
    <>
      <PageHeader
        title="Resources"
        description={list.data ? `${formatNumber(list.data.total)} resources` : undefined}
        actions={
          can('resources.create') ? (
            <>
              <Button variant="outline" asChild>
                <Link href="/uploads">Bulk upload</Link>
              </Button>
              <Button asChild>
                <Link href="/resources/new">
                  <Upload className="size-4" aria-hidden="true" /> Upload
                </Link>
              </Button>
            </>
          ) : null
        }
      />
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <Input
          placeholder="Search title, slug or file name"
          value={filters.q}
          onChange={(e) => set('q', e.target.value)}
          className="lg:col-span-2"
          aria-label="Search resources"
        />
        <NativeSelect
          value={filters.status}
          onChange={(e) => set('status', e.target.value)}
          aria-label="Status"
        >
          <option value="">All statuses</option>
          {['draft', 'review', 'published', 'unpublished', 'archived'].map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={filters.classId}
          onChange={(e) => set('classId', e.target.value)}
          aria-label="Class"
        >
          <option value="">All classes</option>
          {tax.classes.map((c) => (
            <option key={c.id} value={c.id}>
              {String(c.name)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={filters.subjectId}
          onChange={(e) => set('subjectId', e.target.value)}
          aria-label="Subject"
        >
          <option value="">All subjects</option>
          {tax.subjects.map((c) => (
            <option key={c.id} value={c.id}>
              {String(c.name)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          value={filters.sort}
          onChange={(e) => set('sort', e.target.value)}
          aria-label="Sort"
        >
          <option value="updated">Recently updated</option>
          <option value="newest">Newest</option>
          <option value="title">Title</option>
          <option value="downloads">Most downloaded</option>
          <option value="views">Most viewed</option>
        </NativeSelect>
      </div>

      {selected.length ? (
        <div className="bg-card mb-3 flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
          <span className="px-2">{selected.length} selected</span>
          {can('resources.publish') ? (
            <>
              <Button size="sm" onClick={() => bulk.mutate('publish')}>
                Publish
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulk.mutate('unpublish')}>
                Unpublish
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulk.mutate('archive')}>
                Archive
              </Button>
            </>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => bulk.mutate('feature')}>
            Feature
          </Button>
          {can('resources.delete') ? (
            <Button
              size="sm"
              variant="destructive"
              onClick={() =>
                confirm(`Delete ${selected.length} resources permanently?`) && bulk.mutate('delete')
              }
            >
              Delete
            </Button>
          ) : null}
        </div>
      ) : null}

      {list.isLoading ? <AdminTableSkeleton columns={7} /> : null}
      {list.error ? (
        <ErrorState message={errorMessage(list.error)} retry={() => list.refetch()} />
      ) : null}
      {list.data ? (
        <div className="bg-card overflow-hidden rounded-xl border">
          <Table>
            <THead>
              <Tr>
                <Th className="w-8">
                  <Checkbox
                    aria-label="Select all"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? [] : items.map((i) => i.id))}
                  />
                </Th>
                <Th>Title</Th>
                <Th>Classification</Th>
                <Th>Status</Th>
                <Th className="text-right">Views</Th>
                <Th className="text-right">Downloads</Th>
                <Th>Updated</Th>
              </Tr>
            </THead>
            <TBody>
              {items.map((r) => (
                <Tr key={r.id}>
                  <Td>
                    <Checkbox
                      aria-label={`Select ${r.title}`}
                      checked={selected.includes(r.id)}
                      onChange={() =>
                        setSelected((s) =>
                          s.includes(r.id) ? s.filter((x) => x !== r.id) : [...s, r.id],
                        )
                      }
                    />
                  </Td>
                  <Td className="max-w-md">
                    <Link href={`/resources/${r.id}`} className="font-medium hover:underline">
                      {r.title}
                    </Link>
                    <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-1.5 text-xs">
                      {r.fileExtension ? (
                        <span className="uppercase">{r.fileExtension}</span>
                      ) : null}
                      <ProcessingBadge status={r.processingStatus} scan={r.scanStatus} />
                      {r.featured ? <span>★ Featured</span> : null}
                    </div>
                  </Td>
                  <Td className="text-muted-foreground text-xs">
                    {[r.className, r.subjectName, r.resourceTypeName, r.year]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </Td>
                  <Td>
                    <StatusBadge status={r.status} />
                  </Td>
                  <Td className="text-right tabular-nums">{formatNumber(r.viewCount)}</Td>
                  <Td className="text-right tabular-nums">{formatNumber(r.downloadCount)}</Td>
                  <Td className="text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(r.updatedAt).toLocaleDateString('en-GB')}
                  </Td>
                </Tr>
              ))}
              {items.length === 0 ? (
                <Tr>
                  <Td colSpan={7} className="text-muted-foreground py-10 text-center">
                    No resources match these filters.
                  </Td>
                </Tr>
              ) : null}
            </TBody>
          </Table>
          {list.data.totalPages > 1 ? (
            <div className="flex items-center justify-between border-t p-3 text-sm">
              <span>
                Page {list.data.page} of {list.data.totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={filters.page <= 1}
                  onClick={() => set('page', filters.page - 1)}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={filters.page >= list.data.totalPages}
                  onClick={() => set('page', filters.page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
