'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { HomepageSettings } from '@edushare/shared';
import { Button, Card, Checkbox, Input, Label, Textarea } from '@edushare/ui';
import { api, errorMessage } from '@/lib/api';
import { useTaxonomyOptions } from '@/lib/taxonomy';
import { PageHeader } from '@/components/shell';

const SECTION_LABELS: Record<string, string> = {
  featured: 'Featured resources',
  recent: 'Recently added',
  popular: 'Popular downloads',
  trending: 'Trending this week',
  'past-papers': 'Past papers',
  'schemes-of-work': 'Schemes of work',
  'lesson-plans': 'Lesson plans',
  notes: 'Notes',
  collections: 'Collections',
};

function withAllSections(data: HomepageSettings): HomepageSettings {
  const keys = new Set(data.sections.map((x) => x.key));
  return {
    ...data,
    sections: [
      ...data.sections,
      ...Object.keys(SECTION_LABELS)
        .filter((k) => !keys.has(k as never))
        .map((k) => ({ key: k as HomepageSettings['sections'][number]['key'], enabled: false })),
    ],
  };
}

export default function HomepageSettingsPage() {
  const q = useQuery({
    queryKey: ['settings', 'homepage'],
    queryFn: () => api.get<HomepageSettings>('/settings/homepage'),
  });
  return q.data ? <HomepageForm initial={withAllSections(q.data)} /> : null;
}

function HomepageForm({ initial }: { initial: HomepageSettings }) {
  const collections = useQuery({
    queryKey: ['collections'],
    queryFn: () => api.get<{ items: { id: string; title: string }[] }>('/collections'),
  });
  const { data: tax } = useTaxonomyOptions();
  const [s, setS] = useState<HomepageSettings>(initial);
  const save = useMutation({
    mutationFn: () => api.put('/settings/homepage', s),
    onSuccess: () => toast.success('Homepage updated'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const move = (i: number, d: -1 | 1) => {
    const next = [...s.sections];
    const [item] = next.splice(i, 1);
    next.splice(i + d, 0, item!);
    setS({ ...s, sections: next });
  };
  const toggleId = (key: 'featuredSubjectIds' | 'featuredCollectionIds', id: string) =>
    setS({ ...s, [key]: s[key].includes(id) ? s[key].filter((x) => x !== id) : [...s[key], id] });
  return (
    <>
      <PageHeader
        title="Homepage"
        description="Control the hero text, announcement and which sections appear."
        actions={
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            Save homepage
          </Button>
        }
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-4 p-5">
          <h2 className="font-semibold">Hero</h2>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ht">Headline</Label>
            <Input
              id="ht"
              value={s.heroTitle}
              onChange={(e) => setS({ ...s, heroTitle: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="hs">Subtitle</Label>
            <Textarea
              id="hs"
              rows={3}
              value={s.heroSubtitle}
              onChange={(e) => setS({ ...s, heroSubtitle: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sp">Search placeholder</Label>
            <Input
              id="sp"
              value={s.searchPlaceholder}
              onChange={(e) => setS({ ...s, searchPlaceholder: e.target.value })}
            />
          </div>
          <h2 className="mt-2 font-semibold">Announcement banner</h2>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={Boolean(s.announcement?.enabled)}
              onChange={(e) =>
                setS({
                  ...s,
                  announcement: {
                    message: s.announcement?.message ?? '',
                    href: s.announcement?.href ?? null,
                    enabled: e.target.checked,
                  },
                })
              }
            />{' '}
            Show announcement
          </label>
          <Input
            aria-label="Announcement message"
            placeholder="Term 3 revision packs are now available!"
            value={s.announcement?.message ?? ''}
            onChange={(e) =>
              setS({
                ...s,
                announcement: {
                  enabled: s.announcement?.enabled ?? true,
                  href: s.announcement?.href ?? null,
                  message: e.target.value,
                },
              })
            }
          />
          <Input
            aria-label="Announcement link"
            placeholder="/collections/term-3-revision-pack"
            value={s.announcement?.href ?? ''}
            onChange={(e) =>
              setS({
                ...s,
                announcement: {
                  enabled: s.announcement?.enabled ?? true,
                  message: s.announcement?.message ?? '',
                  href: e.target.value || null,
                },
              })
            }
          />
        </Card>
        <Card className="flex flex-col gap-3 p-5">
          <h2 className="font-semibold">Sections (in order)</h2>
          <ol className="flex flex-col gap-1.5">
            {s.sections.map((sec, i) => (
              <li key={sec.key} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                <Checkbox
                  aria-label={`Show ${SECTION_LABELS[sec.key]}`}
                  checked={sec.enabled}
                  onChange={(e) =>
                    setS({
                      ...s,
                      sections: s.sections.map((x, j) =>
                        j === i ? { ...x, enabled: e.target.checked } : x,
                      ),
                    })
                  }
                />
                <Input
                  className="h-8"
                  aria-label="Section title"
                  placeholder={SECTION_LABELS[sec.key]}
                  value={sec.title ?? ''}
                  onChange={(e) =>
                    setS({
                      ...s,
                      sections: s.sections.map((x, j) =>
                        j === i ? { ...x, title: e.target.value || undefined } : x,
                      ),
                    })
                  }
                />
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  aria-label="Move up"
                >
                  <ArrowUp className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  disabled={i === s.sections.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="Move down"
                >
                  <ArrowDown className="size-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ol>
          <h2 className="mt-2 font-semibold">Featured subjects</h2>
          <p className="text-muted-foreground text-xs">
            Leave empty to show the subjects with the most resources.
          </p>
          <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto text-sm">
            {tax.subjects.map((sub) => (
              <label key={sub.id} className="flex items-center gap-2">
                <Checkbox
                  checked={s.featuredSubjectIds.includes(sub.id)}
                  onChange={() => toggleId('featuredSubjectIds', sub.id)}
                />{' '}
                {String(sub.name)}
              </label>
            ))}
          </div>
          <h2 className="mt-2 font-semibold">Featured collections</h2>
          <div className="flex flex-col gap-1 text-sm">
            {collections.data?.items.map((c) => (
              <label key={c.id} className="flex items-center gap-2">
                <Checkbox
                  checked={s.featuredCollectionIds.includes(c.id)}
                  onChange={() => toggleId('featuredCollectionIds', c.id)}
                />{' '}
                {c.title}
              </label>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
