'use client';

import type { UseFormReturn } from 'react-hook-form';
import { Input, Label, NativeSelect, Textarea, Checkbox } from '@edushare/ui';
import { useTaxonomyOptions, labelOf } from '@/lib/taxonomy';

export interface ResourceFormValues {
  title: string;
  slug?: string;
  description?: string;
  shortDescription?: string;
  classId?: string;
  subjectId?: string;
  resourceTypeId?: string;
  academicYearId?: string;
  termId?: string;
  topicId?: string;
  subtopicId?: string;
  curriculumId?: string;
  topic?: string;
  subtopic?: string;
  tags?: string;
  keywords?: string;
  author?: string;
  publisher?: string;
  featured?: boolean;
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
  status?: 'draft' | 'review' | 'published';
}

function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : hint ? (
        <p className="text-muted-foreground text-xs">{hint}</p>
      ) : null}
    </div>
  );
}

/** Metadata inputs shared by upload, edit and bulk upload forms. */
export function ResourceFields({
  form,
  omit = [],
  serverErrors = {},
}: {
  form: UseFormReturn<ResourceFormValues>;
  omit?: string[];
  serverErrors?: Record<string, string>;
}) {
  const { data } = useTaxonomyOptions();
  const { register, watch, formState } = form;
  const err = (k: keyof ResourceFormValues) =>
    (formState.errors[k]?.message as string | undefined) ?? serverErrors[k];
  const classId = watch('classId');
  const subjectId = watch('subjectId');
  const topicId = watch('topicId');
  const cls = data.classes.find((c) => c.id === classId);
  const classSubjects = (cls?.subjectIds as string[] | undefined) ?? [];
  const subjects = classSubjects.length
    ? [...data.subjects].sort(
        (a, b) => Number(classSubjects.includes(b.id)) - Number(classSubjects.includes(a.id)),
      )
    : data.subjects;
  const topics = data.topics.filter(
    (t) => !subjectId || !t.subject_id || t.subject_id === subjectId,
  );
  const subtopics = data.subtopics.filter((s) => s.topic_id === topicId);
  const levels = data.levels;

  const select = (
    name: keyof ResourceFormValues,
    label: string,
    options: { value: string; label: string; group?: string }[],
    placeholder: string,
  ) => (
    <Field label={label} htmlFor={name} error={err(name)}>
      <NativeSelect id={name} {...register(name)}>
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.group ? `${o.group} – ` : ''}
            {o.label}
          </option>
        ))}
      </NativeSelect>
    </Field>
  );

  return (
    <div className="flex flex-col gap-6">
      <fieldset className="grid gap-4">
        <legend className="mb-2 text-sm font-semibold">Details</legend>
        {!omit.includes('title') ? (
          <Field
            label="Title"
            htmlFor="title"
            error={err('title')}
            hint="e.g. P6 Social Studies Term 2 Examination 2026"
          >
            <Input id="title" {...register('title')} aria-invalid={Boolean(err('title'))} />
          </Field>
        ) : null}
        {!omit.includes('slug') ? (
          <Field
            label="URL slug"
            htmlFor="slug"
            error={err('slug')}
            hint="Leave empty to generate from the title. Changing it keeps a redirect."
          >
            <Input
              id="slug"
              {...register('slug')}
              placeholder="p6-social-studies-term-2-examination-2026"
            />
          </Field>
        ) : null}
        <Field
          label="Short description"
          htmlFor="shortDescription"
          error={err('shortDescription')}
          hint="One sentence shown on cards and search results (max 300 characters)."
        >
          <Input id="shortDescription" {...register('shortDescription')} maxLength={300} />
        </Field>
        <Field label="Description" htmlFor="description" error={err('description')}>
          <Textarea id="description" rows={5} {...register('description')} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Classification</legend>
        {select(
          'classId',
          'Class',
          data.classes.map((c) => ({
            value: c.id,
            label: String(c.name),
            group: levels.find((l) => l.id === c.level_id)?.name as string | undefined,
          })),
          'Select class',
        )}
        {select(
          'subjectId',
          'Subject',
          subjects.map((s) => ({
            value: s.id,
            label:
              String(s.name) +
              (classSubjects.length && !classSubjects.includes(s.id)
                ? ' (not linked to class)'
                : ''),
          })),
          'Select subject',
        )}
        {select(
          'resourceTypeId',
          'Resource type',
          data['resource-types'].map((t) => ({ value: t.id, label: String(t.name) })),
          'Select type',
        )}
        {select(
          'academicYearId',
          'Year',
          data['academic-years'].map((y) => ({ value: y.id, label: String(y.year) })),
          'Select year',
        )}
        {select(
          'termId',
          'Term',
          data.terms.map((t) => ({ value: t.id, label: String(t.name) })),
          'Select term',
        )}
        {select(
          'curriculumId',
          'Curriculum',
          data.curricula.map((c) => ({ value: c.id, label: String(c.name) })),
          'Select curriculum',
        )}
        {select(
          'topicId',
          'Topic (managed)',
          topics.map((t) => ({ value: t.id, label: labelOf(t) })),
          topics.length ? 'Select topic' : 'No topics yet',
        )}
        {subtopics.length
          ? select(
              'subtopicId',
              'Subtopic (managed)',
              subtopics.map((t) => ({ value: t.id, label: labelOf(t) })),
              'Select subtopic',
            )
          : null}
        <Field
          label="Topic (free text)"
          htmlFor="topic"
          error={err('topic')}
          hint="Use when no managed topic exists."
        >
          <Input id="topic" {...register('topic')} placeholder="e.g. Photosynthesis" />
        </Field>
        <Field label="Subtopic (free text)" htmlFor="subtopic" error={err('subtopic')}>
          <Input id="subtopic" {...register('subtopic')} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold">Search & attribution</legend>
        <Field label="Tags" htmlFor="tags" hint="Comma separated, e.g. PLE, revision, UNEB">
          <Input id="tags" {...register('tags')} />
        </Field>
        <Field label="Keywords" htmlFor="keywords" hint="Extra search terms, comma separated.">
          <Input id="keywords" {...register('keywords')} />
        </Field>
        <Field label="Author / source" htmlFor="author">
          <Input id="author" {...register('author')} />
        </Field>
        <Field label="Publisher" htmlFor="publisher">
          <Input id="publisher" {...register('publisher')} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox {...register('featured')} /> Feature on the homepage
        </label>
      </fieldset>

      <fieldset className="grid gap-4">
        <legend className="mb-2 text-sm font-semibold">SEO (optional)</legend>
        <Field
          label="SEO title"
          htmlFor="seoTitle"
          error={err('seoTitle')}
          hint="Up to 70 characters. Defaults to the title."
        >
          <Input id="seoTitle" {...register('seoTitle')} maxLength={70} />
        </Field>
        <Field
          label="SEO description"
          htmlFor="seoDescription"
          error={err('seoDescription')}
          hint="Up to 170 characters. Generated automatically if empty."
        >
          <Textarea id="seoDescription" rows={2} {...register('seoDescription')} maxLength={170} />
        </Field>
        <Field
          label="Canonical URL"
          htmlFor="canonicalUrl"
          error={err('canonicalUrl')}
          hint="Only if this resource is primarily published elsewhere."
        >
          <Input id="canonicalUrl" type="url" {...register('canonicalUrl')} />
        </Field>
      </fieldset>
    </div>
  );
}

/** Converts form values to the API payload (empty strings → null, lists → arrays). */
export function toPayload(v: ResourceFormValues) {
  const list = (s?: string) =>
    (s ?? '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
  const nul = (s?: string) => (s && s.trim() ? s.trim() : null);
  return {
    title: v.title,
    slug: v.slug?.trim() || undefined,
    description: nul(v.description),
    shortDescription: nul(v.shortDescription),
    classId: nul(v.classId),
    subjectId: nul(v.subjectId),
    resourceTypeId: nul(v.resourceTypeId),
    academicYearId: nul(v.academicYearId),
    termId: nul(v.termId),
    topicId: nul(v.topicId),
    subtopicId: nul(v.subtopicId),
    curriculumId: nul(v.curriculumId),
    topic: nul(v.topic),
    subtopic: nul(v.subtopic),
    author: nul(v.author),
    publisher: nul(v.publisher),
    tags: list(v.tags),
    keywords: list(v.keywords),
    featured: Boolean(v.featured),
    seoTitle: nul(v.seoTitle),
    seoDescription: nul(v.seoDescription),
    canonicalUrl: nul(v.canonicalUrl),
  };
}
