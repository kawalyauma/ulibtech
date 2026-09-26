'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, Trash2, X } from 'lucide-react';
import type { AdminResourceRow, Paginated, ResourceCard } from '@edushare/shared';
import {
  AdminTableSkeleton,
  Badge,
  Button,
  Card,
  Checkbox,
  Input,
  Label,
  Textarea,
} from '@edushare/ui';
import { api, errorMessage } from '@/lib/api';
import { PageHeader } from '@/components/shell';
import { useSession } from '@/components/providers';

interface Collection {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  featured: boolean;
  isPublished: boolean;
  resourceCount: number;
  resources?: ResourceCard[];
}

function Editor({ id, onClose }: { id: string | null; onClose: () => void }) {
  const qc = useQueryClient();
  const existing = useQuery({
    queryKey: ['collection', id],
    queryFn: () => api.get<Collection>(`/collections/${id}`),
    enabled: Boolean(id),
  });
  const [form, setForm] = useState<{
    title: string;
    description: string;
    featured: boolean;
    isPublished: boolean;
    items: { id: string; title: string }[];
  } | null>(null);
  const [q, setQ] = useState('');
  const current =
    form ??
    (existing.data
      ? {
          title: existing.data.title,
          description: existing.data.description ?? '',
          featured: existing.data.featured,
          isPublished: existing.data.isPublished,
          items: (existing.data.resources ?? []).map((r) => ({ id: r.id, title: r.title })),
        }
      : id
        ? null
        : { title: '', description: '', featured: false, isPublished: true, items: [] });
  const search = useQuery({
    queryKey: ['collection-search', q],
    queryFn: () =>
      api.get<Paginated<AdminResourceRow>>(
        `/resources?q=${encodeURIComponent(q)}&status=published&pageSize=8`,
      ),
    enabled: q.length > 1,
  });
  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: current!.title,
        description: current!.description || null,
        featured: current!.featured,
        isPublished: current!.isPublished,
        resourceIds: current!.items.map((i) => i.id),
      };
      return id ? api.patch(`/collections/${id}`, body) : api.post('/collections', body);
    },
    onSuccess: () => {
      toast.success('Collection saved');
      void qc.invalidateQueries({ queryKey: ['collections'] });
      onClose();
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (!current) return <AdminTableSkeleton rows={3} columns={1} />;
  const set = (patch: Partial<typeof current>) => setForm({ ...current, ...patch });
  return (
    <Card className="mb-6 flex flex-col gap-4 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="c-title">Title</Label>
          <Input
            id="c-title"
            value={current.title}
            onChange={(e) => set({ title: e.target.value })}
            placeholder="P7 UNEB Revision"
          />
        </div>
        <div className="flex items-end gap-4 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox
              checked={current.isPublished}
              onChange={(e) => set({ isPublished: e.target.checked })}
            />{' '}
            Published
          </label>
          <label className="flex items-center gap-2">
            <Checkbox
              checked={current.featured}
              onChange={(e) => set({ featured: e.target.checked })}
            />{' '}
            Featured
          </label>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="c-desc">Description</Label>
        <Textarea
          id="c-desc"
          rows={2}
          value={current.description}
          onChange={(e) => set({ description: e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="c-add">Add published resources</Label>
        <Input
          id="c-add"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by title"
        />
        {search.data?.items.length ? (
          <ul className="rounded-md border text-sm">
            {search.data.items
              .filter((r) => !current.items.some((i) => i.id === r.id))
              .map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    className="hover:bg-muted flex w-full items-center gap-2 px-3 py-2 text-left"
                    onClick={() => set({ items: [...current.items, { id: r.id, title: r.title }] })}
                  >
                    <Plus className="size-4" aria-hidden="true" /> {r.title}
                  </button>
                </li>
              ))}
          </ul>
        ) : null}
        <ol className="flex flex-col gap-1 text-sm">
          {current.items.map((i, idx) => (
            <li
              key={i.id}
              className="flex items-center justify-between rounded-md border px-3 py-1.5"
            >
              <span>
                {idx + 1}. {i.title}
              </span>
              <button
                type="button"
                aria-label={`Remove ${i.title}`}
                onClick={() => set({ items: current.items.filter((x) => x.id !== i.id) })}
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending || current.title.length < 3}>
          Save collection
        </Button>
      </div>
    </Card>
  );
}

export default function CollectionsPage() {
  const qc = useQueryClient();
  const { can } = useSession();
  const [editing, setEditing] = useState<string | null | 'new'>(null);
  const list = useQuery({
    queryKey: ['collections'],
    queryFn: () => api.get<{ items: Collection[] }>('/collections'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/collections/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['collections'] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <>
      <PageHeader
        title="Collections"
        description="Curated packs such as “Term 3 Revision Pack” or “PLE Resources”."
        actions={
          can('collections.manage') ? (
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" aria-hidden="true" /> New collection
            </Button>
          ) : null
        }
      />
      {editing ? (
        <Editor
          key={editing}
          id={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {list.isLoading ? <AdminTableSkeleton /> : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {list.data?.items.map((c) => (
          <Card key={c.id} className="flex flex-col gap-2 p-4">
            <div className="flex items-start justify-between gap-2">
              <button
                className="text-left font-semibold hover:underline"
                onClick={() => setEditing(c.id)}
              >
                {c.title}
              </button>
              {can('collections.manage') ? (
                <button
                  aria-label={`Delete ${c.title}`}
                  onClick={() => confirm('Delete this collection?') && remove.mutate(c.id)}
                >
                  <Trash2 className="text-muted-foreground size-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <p className="text-muted-foreground line-clamp-2 text-sm">{c.description}</p>
            <div className="mt-auto flex gap-2 text-xs">
              <Badge variant={c.isPublished ? 'success' : 'muted'}>
                {c.isPublished ? 'Published' : 'Hidden'}
              </Badge>
              {c.featured ? <Badge variant="warning">Featured</Badge> : null}
              <span className="text-muted-foreground">{c.resourceCount} resources</span>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
