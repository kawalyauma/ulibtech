'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Sparkles, Wand2 } from 'lucide-react';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@edushare/ui';
import { api, errorMessage } from '@/lib/api';
import type { AdminResource } from '@/lib/types';
import { useTaxonomyOptions, labelOf } from '@/lib/taxonomy';

const CLASS_FIELDS = [
  ['classId', 'Class', 'classes'],
  ['subjectId', 'Subject', 'subjects'],
  ['resourceTypeId', 'Type', 'resource-types'],
  ['academicYearId', 'Year', 'academic-years'],
  ['termId', 'Term', 'terms'],
  ['topicId', 'Topic', 'topics'],
] as const;

interface Features {
  ai: boolean;
  officePreviews: boolean;
  ocr: boolean;
}

/** Shows rule-based and AI suggestions and applies them one field at a time. */
export function SuggestionsPanel({
  resource,
  canEdit,
}: {
  resource: AdminResource;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const { data: tax } = useTaxonomyOptions();
  const features = useQuery({
    queryKey: ['features'],
    queryFn: () => api.get<Features>('/system/features'),
    staleTime: 10 * 60_000,
  });
  const done = (d: AdminResource, msg: string) => {
    qc.setQueryData(['resource', resource.id], d);
    toast.success(msg);
  };
  const apply = useMutation({
    mutationFn: (v: { source: 'rules' | 'ai'; fields: string[] }) =>
      api.post<AdminResource>(`/resources/${resource.id}/suggestions/apply`, v),
    onSuccess: (d) => done(d, 'Suggestion applied'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const enrich = useMutation({
    mutationFn: () => api.post<AdminResource>(`/resources/${resource.id}/enrich`),
    onSuccess: (d) => done(d, 'AI suggestions ready'),
    onError: (e) => toast.error(errorMessage(e)),
  });

  const nameOf = (entity: (typeof CLASS_FIELDS)[number][2], id: unknown) => {
    const row = tax[entity].find((x) => x.id === id);
    return row ? labelOf(row) : null;
  };
  const current = resource.ids as Record<string, string | null>;
  const rules = resource.suggestions?.rules;
  const ai = resource.suggestions?.ai;

  const rows = (source: 'rules' | 'ai', ids: Record<string, unknown>) =>
    CLASS_FIELDS.map(([field, label, entity]) => {
      const suggested = ids[field];
      if (!suggested || suggested === current[field]) return null;
      return (
        <li key={`${source}-${field}`} className="flex items-center justify-between gap-2 text-sm">
          <span>
            <span className="text-muted-foreground">{label}:</span>{' '}
            {nameOf(entity, suggested) ?? '—'}
            {current[field] ? (
              <span className="text-muted-foreground text-xs">
                {' '}
                (now {nameOf(entity, current[field]) ?? 'set'})
              </span>
            ) : null}
          </span>
          {canEdit ? (
            <Button
              size="xs"
              variant="outline"
              disabled={apply.isPending}
              onClick={() => apply.mutate({ source, fields: [field] })}
            >
              Apply
            </Button>
          ) : null}
        </li>
      );
    }).filter(Boolean);

  const ruleRows = rules ? rows('rules', rules) : [];
  const aiRows = ai ? rows('ai', ai.ids) : [];
  if (!ruleRows.length && !ai && !features.data?.ai) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wand2 className="size-4" aria-hidden="true" /> Suggestions
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {ruleRows.length ? (
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium uppercase">
              From title, file name and content
            </p>
            <ul className="flex flex-col gap-1.5">{ruleRows}</ul>
          </div>
        ) : null}
        {ai ? (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-xs font-medium uppercase">
              AI ({ai.model}, {new Date(ai.generatedAt).toLocaleDateString('en-GB')})
            </p>
            {aiRows.length ? <ul className="flex flex-col gap-1.5">{aiRows}</ul> : null}
            <div className="rounded-md border p-2 text-sm">
              <p className="font-medium">Short description</p>
              <p className="text-muted-foreground">{ai.shortDescription}</p>
              {canEdit ? (
                <Button
                  size="xs"
                  variant="outline"
                  className="mt-1"
                  onClick={() => apply.mutate({ source: 'ai', fields: ['shortDescription'] })}
                >
                  Use
                </Button>
              ) : null}
            </div>
            <div className="rounded-md border p-2 text-sm">
              <p className="font-medium">Description</p>
              <p className="text-muted-foreground">{ai.description}</p>
              {canEdit ? (
                <Button
                  size="xs"
                  variant="outline"
                  className="mt-1"
                  onClick={() => apply.mutate({ source: 'ai', fields: ['description'] })}
                >
                  Use
                </Button>
              ) : null}
            </div>
            {ai.keywords.length ? (
              <div className="text-sm">
                <p className="font-medium">Keywords</p>
                <p className="text-muted-foreground">{ai.keywords.join(', ')}</p>
                {canEdit ? (
                  <Button
                    size="xs"
                    variant="outline"
                    className="mt-1"
                    onClick={() => apply.mutate({ source: 'ai', fields: ['keywords'] })}
                  >
                    Add keywords
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {features.data?.ai && canEdit ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => enrich.mutate()}
            disabled={enrich.isPending}
          >
            {enrich.isPending ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="size-4" aria-hidden="true" />
            )}
            {ai ? 'Regenerate AI suggestions' : 'Generate AI summary & classification'}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
