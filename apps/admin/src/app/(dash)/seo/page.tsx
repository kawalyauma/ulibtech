'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Button,
  Card,
  Checkbox,
  Input,
  Label,
  Table,
  TBody,
  THead,
  Td,
  Th,
  Tr,
  Textarea,
} from '@edushare/ui';
import { api, errorMessage } from '@/lib/api';
import { PageHeader } from '@/components/shell';

interface SeoRow {
  id: string;
  path: string;
  title: string | null;
  description: string | null;
  intro: string | null;
  noindex: boolean;
}
interface Preview {
  landing: { title: string; description: string; intro: string; heading: string };
  total: number;
}

export default function SeoPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['seo'], queryFn: () => api.get<{ items: SeoRow[] }>('/seo') });
  const [path, setPath] = useState('/p7/past-papers');
  const [form, setForm] = useState({ title: '', description: '', intro: '', noindex: false });
  const preview = useMutation({
    mutationFn: (p: string) => api.get<Preview>(`/seo/preview?path=${encodeURIComponent(p)}`),
    onSuccess: (p, requested) => {
      const existing = list.data?.items.find((i) => i.path === requested);
      setForm({
        title: existing?.title ?? '',
        description: existing?.description ?? '',
        intro: existing?.intro ?? '',
        noindex: existing?.noindex ?? false,
      });
      toast.success(`${p.landing.heading}: ${p.total} resources`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const save = useMutation({
    mutationFn: () =>
      api.put('/seo', {
        path,
        title: form.title || null,
        description: form.description || null,
        intro: form.intro || null,
        noindex: form.noindex,
      }),
    onSuccess: () => {
      toast.success('SEO saved; the page will refresh shortly.');
      void qc.invalidateQueries({ queryKey: ['seo'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/seo/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['seo'] }),
  });
  const refresh = useMutation({
    mutationFn: () => api.post('/system/refresh-sitemap'),
    onSuccess: () => toast.success('Sitemap refresh queued'),
  });
  const suggestions = useQuery({
    queryKey: ['seo-suggestions'],
    queryFn: () =>
      api.get<{
        items: {
          path: string;
          heading: string;
          resources: number;
          searches: number;
          hasOverride: boolean;
          reason: string;
        }[];
      }>('/seo/suggestions'),
  });
  const auto = preview.data?.landing;
  return (
    <>
      <PageHeader
        title="SEO"
        description="Landing pages are generated automatically. Override titles, descriptions and intro text for important pages."
        actions={
          <Button variant="outline" onClick={() => refresh.mutate()}>
            Refresh sitemap
          </Button>
        }
      />
      <Card className="mb-6 flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="path">Landing page path</Label>
          <div className="flex gap-2">
            <Input
              id="path"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/p6/science/notes"
            />
            <Button variant="outline" onClick={() => preview.mutate(path)}>
              Load
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            Examples: /past-papers, /p7/past-papers, /p6/science, /s4/chemistry/past-papers/2026,
            /classes/p5, /subjects/english
          </p>
        </div>
        {auto ? (
          <>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="t">Title</Label>
              <Input
                id="t"
                maxLength={70}
                value={form.title}
                placeholder={auto.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="d">Meta description</Label>
              <Textarea
                id="d"
                maxLength={170}
                rows={2}
                value={form.description}
                placeholder={auto.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="i">Intro text</Label>
              <Textarea
                id="i"
                rows={4}
                value={form.intro}
                placeholder={auto.intro}
                onChange={(e) => setForm({ ...form, intro: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.noindex}
                onChange={(e) => setForm({ ...form, noindex: e.target.checked })}
              />{' '}
              Hide from search engines (noindex)
            </label>
            <div className="flex justify-end">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                Save overrides
              </Button>
            </div>
          </>
        ) : null}
      </Card>
      {suggestions.data?.items.length ? (
        <Card className="mb-6 overflow-hidden">
          <p className="border-b px-4 py-3 text-sm font-semibold">
            Pages worth writing custom text for (by search demand and content)
          </p>
          <Table>
            <THead>
              <Tr>
                <Th>Page</Th>
                <Th>Why</Th>
                <Th className="text-right">Resources</Th>
                <Th />
              </Tr>
            </THead>
            <TBody>
              {suggestions.data.items.slice(0, 15).map((sug) => (
                <Tr key={sug.path}>
                  <Td>
                    <span className="font-medium">{sug.heading}</span>{' '}
                    <span className="text-muted-foreground font-mono text-xs">{sug.path}</span>
                  </Td>
                  <Td className="text-muted-foreground text-xs">
                    {sug.hasOverride ? 'Customised ✓' : sug.reason}
                  </Td>
                  <Td className="text-right tabular-nums">{sug.resources}</Td>
                  <Td className="text-right">
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => {
                        setPath(sug.path);
                        preview.mutate(sug.path);
                      }}
                    >
                      Write SEO text
                    </Button>
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : null}
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <Tr>
              <Th>Path</Th>
              <Th>Title</Th>
              <Th>Noindex</Th>
              <Th />
            </Tr>
          </THead>
          <TBody>
            {list.data?.items.map((r) => (
              <Tr key={r.id}>
                <Td className="font-mono text-xs">{r.path}</Td>
                <Td>{r.title ?? <span className="text-muted-foreground">auto</span>}</Td>
                <Td>{r.noindex ? 'Yes' : 'No'}</Td>
                <Td className="text-right">
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      setPath(r.path);
                      preview.mutate(r.path);
                    }}
                  >
                    Edit
                  </Button>
                  <Button size="xs" variant="ghost" onClick={() => remove.mutate(r.id)}>
                    Reset
                  </Button>
                </Td>
              </Tr>
            ))}
            {list.data?.items.length === 0 ? (
              <Tr>
                <Td colSpan={4} className="text-muted-foreground py-6 text-center">
                  No overrides yet — all landing pages use generated SEO text.
                </Td>
              </Tr>
            ) : null}
          </TBody>
        </Table>
      </Card>
    </>
  );
}
