import { SlidersHorizontal } from 'lucide-react';
import type { FacetBucket } from '@edushare/shared';
import type { PublicTaxonomy } from '@/lib/api';
import { AutoSubmitSelect } from './auto-submit';

type FacetMap = Partial<
  Record<'class' | 'subject' | 'type' | 'year' | 'term' | 'fileType', FacetBucket[]>
>;

const SELECT_CLS =
  'h-10 w-full appearance-none rounded-md border border-input bg-card bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E")] bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-9 pl-3 text-sm';

/**
 * Filter form rendered on the server. Works as a plain GET form without JavaScript and
 * auto-submits on change when JavaScript is available.
 */
export function FilterForm({
  action,
  values,
  taxonomy,
  facets,
  hidden = {},
  hide = [],
  sortOptions,
}: {
  action: string;
  values: Record<string, string | undefined>;
  taxonomy: PublicTaxonomy | null;
  facets?: FacetMap;
  hidden?: Record<string, string | undefined>;
  hide?: string[];
  sortOptions: { value: string; label: string }[];
}) {
  const count = (key: keyof FacetMap, slug: string) =>
    facets?.[key]?.find((f) => f.slug === slug)?.count;
  const option = (key: keyof FacetMap, slug: string, label: string) => {
    const n = count(key, slug);
    return (
      <option key={slug} value={slug}>
        {label}
        {n !== undefined ? ` (${n})` : ''}
      </option>
    );
  };
  const hasFacet = (key: keyof FacetMap, slug: string) =>
    !facets || values[key] === slug || (count(key, slug) ?? 0) > 0;
  const active = Object.entries(values).filter(
    ([k, v]) => v && k !== 'sort' && !hide.includes(k),
  ).length;

  const fields = (
    <>
      {Object.entries(hidden).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}
      {!hide.includes('class') ? (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Class
          <AutoSubmitSelect name="class" defaultValue={values.class ?? ''} className={SELECT_CLS}>
            <option value="">All classes</option>
            {taxonomy?.levels.map((l) => (
              <optgroup key={l.id} label={l.name}>
                {l.classes
                  .filter((c) => hasFacet('class', c.slug))
                  .map((c) => option('class', c.slug, c.shortName ?? c.name))}
              </optgroup>
            ))}
          </AutoSubmitSelect>
        </label>
      ) : null}
      {!hide.includes('subject') ? (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Subject
          <AutoSubmitSelect
            name="subject"
            defaultValue={values.subject ?? ''}
            className={SELECT_CLS}
          >
            <option value="">All subjects</option>
            {taxonomy?.subjects
              .filter((s) => hasFacet('subject', s.slug))
              .map((s) => option('subject', s.slug, s.name))}
          </AutoSubmitSelect>
        </label>
      ) : null}
      {!hide.includes('type') ? (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Resource type
          <AutoSubmitSelect name="type" defaultValue={values.type ?? ''} className={SELECT_CLS}>
            <option value="">All types</option>
            {taxonomy?.types
              .filter((t) => hasFacet('type', t.slug))
              .map((t) => option('type', t.slug, t.pluralName))}
          </AutoSubmitSelect>
        </label>
      ) : null}
      {!hide.includes('year') ? (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Year
          <AutoSubmitSelect name="year" defaultValue={values.year ?? ''} className={SELECT_CLS}>
            <option value="">Any year</option>
            {taxonomy?.years
              .filter((y) => hasFacet('year', String(y.year)))
              .map((y) => option('year', String(y.year), String(y.year)))}
          </AutoSubmitSelect>
        </label>
      ) : null}
      {!hide.includes('term') ? (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Term
          <AutoSubmitSelect name="term" defaultValue={values.term ?? ''} className={SELECT_CLS}>
            <option value="">Any term</option>
            {taxonomy?.terms
              .filter((t) => hasFacet('term', t.slug))
              .map((t) => option('term', t.slug, t.name))}
          </AutoSubmitSelect>
        </label>
      ) : null}
      {!hide.includes('fileType') ? (
        <label className="flex flex-col gap-1 text-sm font-medium">
          File type
          <AutoSubmitSelect
            name="fileType"
            defaultValue={values.fileType ?? ''}
            className={SELECT_CLS}
          >
            <option value="">Any file type</option>
            {(
              facets?.fileType ?? [
                { slug: 'pdf', name: 'PDF', count: 0 },
                { slug: 'docx', name: 'DOCX', count: 0 },
                { slug: 'pptx', name: 'PPTX', count: 0 },
              ]
            ).map((f) => option('fileType', f.slug, f.name))}
          </AutoSubmitSelect>
        </label>
      ) : null}
      {taxonomy?.curricula.some((c) => c.count > 0) && !hide.includes('curriculum') ? (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Curriculum
          <AutoSubmitSelect
            name="curriculum"
            defaultValue={values.curriculum ?? ''}
            className={SELECT_CLS}
          >
            <option value="">Any curriculum</option>
            {taxonomy.curricula
              .filter((c) => c.count > 0)
              .map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.name}
                </option>
              ))}
          </AutoSubmitSelect>
        </label>
      ) : null}
      {!hide.includes('level') && !values.class ? (
        <label className="flex flex-col gap-1 text-sm font-medium">
          School level
          <AutoSubmitSelect name="level" defaultValue={values.level ?? ''} className={SELECT_CLS}>
            <option value="">All levels</option>
            {taxonomy?.levels.map((l) => (
              <option key={l.slug} value={l.slug}>
                {l.name}
              </option>
            ))}
          </AutoSubmitSelect>
        </label>
      ) : null}
      <label className="flex flex-col gap-1 text-sm font-medium">
        Sort by
        <AutoSubmitSelect
          name="sort"
          defaultValue={values.sort ?? sortOptions[0]?.value}
          className={SELECT_CLS}
        >
          {sortOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </AutoSubmitSelect>
      </label>
      <div className="flex gap-2">
        <button
          type="submit"
          className="bg-primary text-primary-foreground h-10 flex-1 rounded-md px-4 text-sm font-semibold"
        >
          Apply filters
        </button>
        {active ? (
          <a
            href={`${action}${hidden.q ? `?q=${encodeURIComponent(hidden.q)}` : ''}`}
            className="inline-flex h-10 items-center rounded-md border px-3 text-sm"
          >
            Clear
          </a>
        ) : null}
      </div>
    </>
  );

  // Two independent forms so hidden duplicates are never submitted together.
  return (
    <>
      <form action={action} method="get" aria-label="Filter resources" className="lg:hidden">
        <details className="group bg-card rounded-xl border">
          <summary className="flex h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold">
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal className="size-4" aria-hidden="true" /> Filters
              {active ? ` (${active})` : ''}
            </span>
            <span className="text-muted-foreground group-open:hidden">Show</span>
            <span className="text-muted-foreground hidden group-open:inline">Hide</span>
          </summary>
          <div className="flex flex-col gap-3 border-t p-4">{fields}</div>
        </details>
      </form>
      <form
        action={action}
        method="get"
        aria-label="Filter resources"
        className="hidden flex-col gap-3 lg:flex"
      >
        {fields}
      </form>
    </>
  );
}
