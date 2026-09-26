'use client';

import { use, useState } from 'react';
import { notFound } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  AdminTableSkeleton,
  Button,
  Card,
  Checkbox,
  Input,
  Label,
  NativeSelect,
  Table,
  TBody,
  THead,
  Td,
  Th,
  Tr,
} from '@edushare/ui';
import { Dialog, DialogContent, DialogTitle } from '@edushare/ui/client';
import { api, ApiRequestError, errorMessage } from '@/lib/api';
import type { TaxonomyRow } from '@/lib/types';
import { useTaxonomyOptions } from '@/lib/taxonomy';
import { PageHeader } from '@/components/shell';
import { ErrorState } from '@/components/report';
import { useSession } from '@/components/providers';

type FieldType = 'text' | 'number' | 'textarea' | 'list' | 'bool' | 'select' | 'multi';
interface FieldDef {
  key: string;
  column: string;
  label: string;
  type: FieldType;
  options?: 'levels' | 'subjects' | 'classes' | 'topics';
  required?: boolean;
}

const slug: FieldDef = { key: 'slug', column: 'slug', label: 'Slug (optional)', type: 'text' };
const CONFIG: Record<
  string,
  { title: string; description: string; fields: FieldDef[]; columns: string[] }
> = {
  classes: {
    title: 'Classes',
    description:
      'Class slugs appear in URLs such as /p6/science. Link subjects to control suggestions.',
    fields: [
      { key: 'name', column: 'name', label: 'Name', type: 'text', required: true },
      { key: 'shortName', column: 'short_name', label: 'Short name (e.g. P6)', type: 'text' },
      slug,
      {
        key: 'levelId',
        column: 'level_id',
        label: 'School level',
        type: 'select',
        options: 'levels',
        required: true,
      },
      { key: 'sortOrder', column: 'sort_order', label: 'Sort order', type: 'number' },
      {
        key: 'subjectIds',
        column: 'subjectIds',
        label: 'Subjects taught',
        type: 'multi',
        options: 'subjects',
      },
      { key: 'description', column: 'description', label: 'Description', type: 'textarea' },
    ],
    columns: ['name', 'short_name', 'slug'],
  },
  levels: {
    title: 'School levels',
    description: 'Groups of classes (Nursery, Primary, Secondary…).',
    fields: [
      { key: 'name', column: 'name', label: 'Name', type: 'text', required: true },
      slug,
      { key: 'sortOrder', column: 'sort_order', label: 'Sort order', type: 'number' },
    ],
    columns: ['name', 'slug'],
  },
  subjects: {
    title: 'Subjects',
    description: 'Aliases improve search, e.g. “sst” for Social Studies.',
    fields: [
      { key: 'name', column: 'name', label: 'Name', type: 'text', required: true },
      { key: 'shortName', column: 'short_name', label: 'Short name', type: 'text' },
      slug,
      {
        key: 'aliases',
        column: 'aliases',
        label: 'Search aliases (comma separated)',
        type: 'list',
      },
      { key: 'sortOrder', column: 'sort_order', label: 'Sort order', type: 'number' },
      { key: 'description', column: 'description', label: 'Description', type: 'textarea' },
    ],
    columns: ['name', 'slug', 'aliases'],
  },
  'resource-types': {
    title: 'Resource types',
    description: 'Each type gets a landing page such as /past-papers.',
    fields: [
      { key: 'name', column: 'name', label: 'Name (singular)', type: 'text', required: true },
      {
        key: 'pluralName',
        column: 'plural_name',
        label: 'Plural name',
        type: 'text',
        required: true,
      },
      slug,
      {
        key: 'aliases',
        column: 'aliases',
        label: 'Search aliases (comma separated)',
        type: 'list',
      },
      { key: 'showInNav', column: 'show_in_nav', label: 'Show in navigation', type: 'bool' },
      { key: 'sortOrder', column: 'sort_order', label: 'Sort order', type: 'number' },
      { key: 'description', column: 'description', label: 'Description', type: 'textarea' },
    ],
    columns: ['name', 'plural_name', 'slug'],
  },
  'academic-years': {
    title: 'Academic years',
    description: 'Years used to classify resources.',
    fields: [
      { key: 'year', column: 'year', label: 'Year', type: 'number', required: true },
      { key: 'label', column: 'label', label: 'Label', type: 'text' },
    ],
    columns: ['year', 'label'],
  },
  terms: {
    title: 'Terms',
    description: 'School terms.',
    fields: [
      { key: 'name', column: 'name', label: 'Name', type: 'text', required: true },
      slug,
      { key: 'number', column: 'number', label: 'Number', type: 'number', required: true },
    ],
    columns: ['name', 'slug', 'number'],
  },
  curricula: {
    title: 'Curricula',
    description: 'Curriculum versions.',
    fields: [
      { key: 'name', column: 'name', label: 'Name', type: 'text', required: true },
      slug,
      { key: 'description', column: 'description', label: 'Description', type: 'textarea' },
    ],
    columns: ['name', 'slug'],
  },
  topics: {
    title: 'Topics',
    description: 'Topics get landing pages at /topics/slug.',
    fields: [
      { key: 'name', column: 'name', label: 'Name', type: 'text', required: true },
      slug,
      {
        key: 'subjectId',
        column: 'subject_id',
        label: 'Subject',
        type: 'select',
        options: 'subjects',
      },
      { key: 'classId', column: 'class_id', label: 'Class', type: 'select', options: 'classes' },
      { key: 'description', column: 'description', label: 'Description', type: 'textarea' },
    ],
    columns: ['name', 'slug'],
  },
  subtopics: {
    title: 'Subtopics',
    description: 'Subtopics belong to a topic.',
    fields: [
      { key: 'name', column: 'name', label: 'Name', type: 'text', required: true },
      slug,
      {
        key: 'topicId',
        column: 'topic_id',
        label: 'Topic',
        type: 'select',
        options: 'topics',
        required: true,
      },
    ],
    columns: ['name', 'slug'],
  },
  tags: {
    title: 'Tags',
    description: 'Tags are created automatically when you add them to resources.',
    fields: [{ key: 'name', column: 'name', label: 'Name', type: 'text', required: true }, slug],
    columns: ['name', 'slug'],
  },
};

type Values = Record<string, string | boolean | string[]>;

function fromRow(fields: FieldDef[], row?: TaxonomyRow): Values {
  const v: Values = {};
  for (const f of fields) {
    const raw = row?.[f.column];
    if (f.type === 'bool') v[f.key] = Boolean(raw);
    else if (f.type === 'multi') v[f.key] = (raw as string[] | undefined) ?? [];
    else if (f.type === 'list') v[f.key] = ((raw as string[] | undefined) ?? []).join(', ');
    else v[f.key] = raw === null || raw === undefined ? '' : String(raw);
  }
  return v;
}

function toBody(fields: FieldDef[], v: Values) {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    const val = v[f.key];
    if (f.type === 'number') out[f.key] = val === '' ? undefined : Number(val);
    else if (f.type === 'list')
      out[f.key] = String(val)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    else if (f.type === 'select') out[f.key] = val === '' ? null : val;
    else if (f.type === 'text' || f.type === 'textarea')
      out[f.key] = val === '' ? (f.key === 'slug' ? undefined : null) : val;
    else out[f.key] = val;
  }
  return out;
}

export default function TaxonomyPage({ params }: { params: Promise<{ entity: string }> }) {
  const { entity } = use(params);
  const cfg = CONFIG[entity];
  if (!cfg) notFound();
  return <TaxonomyManager key={entity} entity={entity} cfg={cfg} />;
}

function TaxonomyManager({ entity, cfg }: { entity: string; cfg: (typeof CONFIG)[string] }) {
  const qc = useQueryClient();
  const { can } = useSession();
  const { data: options } = useTaxonomyOptions();
  const [editing, setEditing] = useState<TaxonomyRow | 'new' | null>(null);
  const [values, setValues] = useState<Values>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const list = useQuery({
    queryKey: ['taxonomy', entity],
    queryFn: () => api.get<{ items: TaxonomyRow[] }>(`/taxonomy/${entity}`),
  });
  const done = (msg: string) => {
    toast.success(msg);
    setEditing(null);
    void qc.invalidateQueries({ queryKey: ['taxonomy'] });
  };
  const save = useMutation({
    mutationFn: () => {
      const body = toBody(cfg.fields, values);
      return editing === 'new'
        ? api.post(`/taxonomy/${entity}`, body)
        : api.patch(`/taxonomy/${entity}/${(editing as TaxonomyRow).id}`, body);
    },
    onSuccess: () => done('Saved'),
    onError: (e) => {
      if (e instanceof ApiRequestError && e.fields) setErrors(e.fields);
      toast.error(errorMessage(e));
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/taxonomy/${entity}/${id}`),
    onSuccess: () => done('Deleted'),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const open = (row: TaxonomyRow | 'new') => {
    setErrors({});
    setValues(fromRow(cfg.fields, row === 'new' ? undefined : row));
    setEditing(row);
  };
  const manage = can('taxonomy.manage');
  const optionList = (o: FieldDef['options']) =>
    (o ? options[o] : []).map((x) => ({ value: x.id, label: String(x.name ?? x.year) }));

  return (
    <>
      <PageHeader
        title={cfg.title}
        description={cfg.description}
        actions={
          manage ? (
            <Button onClick={() => open('new')}>
              <Plus className="size-4" aria-hidden="true" /> Add
            </Button>
          ) : null
        }
      />
      {list.isLoading ? <AdminTableSkeleton columns={cfg.columns.length + 2} /> : null}
      {list.error ? (
        <ErrorState message={errorMessage(list.error)} retry={() => list.refetch()} />
      ) : null}
      {list.data ? (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <Tr>
                {cfg.columns.map((c) => (
                  <Th key={c}>{c.replace(/_/g, ' ')}</Th>
                ))}
                <Th className="text-right">Used by</Th>
                <Th className="w-24">
                  <span className="sr-only">Actions</span>
                </Th>
              </Tr>
            </THead>
            <TBody>
              {list.data.items.map((row) => (
                <Tr key={row.id}>
                  {cfg.columns.map((c) => (
                    <Td
                      key={c}
                      className={
                        c === 'name' || c === 'year' ? 'font-medium' : 'text-muted-foreground'
                      }
                    >
                      {Array.isArray(row[c])
                        ? (row[c] as string[]).join(', ')
                        : String(row[c] ?? '—')}
                    </Td>
                  ))}
                  <Td className="text-right tabular-nums">{row.usage_count}</Td>
                  <Td>
                    {manage ? (
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => open(row)}
                          aria-label={`Edit ${String(row.name ?? row.year)}`}
                        >
                          <Pencil className="size-4" aria-hidden="true" />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => confirm('Delete this item?') && remove.mutate(row.id)}
                          aria-label={`Delete ${String(row.name ?? row.year)}`}
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </Button>
                      </div>
                    ) : null}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </Card>
      ) : null}

      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle className="text-lg font-semibold">
            {editing === 'new' ? `Add ${cfg.title.toLowerCase().replace(/s$/, '')}` : 'Edit'}
          </DialogTitle>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
            className="flex flex-col gap-3"
          >
            {cfg.fields.map((f) => (
              <div key={f.key} className="flex flex-col gap-1.5">
                {f.type === 'bool' ? (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={Boolean(values[f.key])}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked }))}
                    />{' '}
                    {f.label}
                  </label>
                ) : (
                  <>
                    <Label htmlFor={`f-${f.key}`}>{f.label}</Label>
                    {f.type === 'select' ? (
                      <NativeSelect
                        id={`f-${f.key}`}
                        value={String(values[f.key] ?? '')}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                        required={f.required}
                      >
                        <option value="">—</option>
                        {optionList(f.options).map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </NativeSelect>
                    ) : f.type === 'multi' ? (
                      <div
                        id={`f-${f.key}`}
                        className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto rounded-md border p-2 text-sm"
                      >
                        {optionList(f.options).map((o) => {
                          const sel = (values[f.key] as string[]) ?? [];
                          return (
                            <label key={o.value} className="flex items-center gap-2">
                              <Checkbox
                                checked={sel.includes(o.value)}
                                onChange={() =>
                                  setValues((v) => ({
                                    ...v,
                                    [f.key]: sel.includes(o.value)
                                      ? sel.filter((x) => x !== o.value)
                                      : [...sel, o.value],
                                  }))
                                }
                              />
                              {o.label}
                            </label>
                          );
                        })}
                      </div>
                    ) : f.type === 'textarea' ? (
                      <textarea
                        id={`f-${f.key}`}
                        rows={3}
                        className="border-input bg-card rounded-md border p-2 text-sm"
                        value={String(values[f.key] ?? '')}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      />
                    ) : (
                      <Input
                        id={`f-${f.key}`}
                        type={f.type === 'number' ? 'number' : 'text'}
                        required={f.required}
                        value={String(values[f.key] ?? '')}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                        aria-invalid={Boolean(errors[f.key])}
                      />
                    )}
                  </>
                )}
                {errors[f.key] ? <p className="text-destructive text-xs">{errors[f.key]}</p> : null}
              </div>
            ))}
            <div className="mt-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={save.isPending}>
                Save
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
