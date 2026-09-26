import Link from 'next/link';
import type { Metadata } from 'next';
import { pluralize } from '@edushare/shared';
import { cn } from '@edushare/ui';
import type { PublicTaxonomy } from '@/lib/api';
import { getListing, type ListingSort } from '@/lib/listing';
import { first, type RawSearchParams } from '@/lib/search-params';
import { Breadcrumbs } from './breadcrumbs';
import { ResourceGrid } from './resource-card';
import { Pagination } from './pagination';
import { AutoSubmitSelect } from './auto-submit';

export interface ListingConfig {
  path: string;
  title: string;
  heading: string;
  description: string;
  sort: ListingSort;
  tabs?: { label: string; path: string; sort: ListingSort }[];
}

export function listingMetadata(cfg: ListingConfig, sp: RawSearchParams): Metadata {
  const page = Number(first(sp.page)) || 1;
  const cls = first(sp.class);
  return {
    title: cfg.title,
    description: cfg.description,
    alternates: { canonical: page > 1 ? `${cfg.path}?page=${page}` : cfg.path },
    // Filtered variants duplicate landing pages; keep them out of the index.
    robots: cls || first(sp.subject) || first(sp.type) ? { index: false, follow: true } : undefined,
  };
}

const SELECT =
  'h-10 appearance-none rounded-md border border-input bg-card bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%236b7280%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E")] bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-9 pl-3 text-sm';

export async function ListingPage({
  cfg,
  sp,
  taxonomy,
}: {
  cfg: ListingConfig;
  sp: RawSearchParams;
  taxonomy: PublicTaxonomy | null;
}) {
  const page = Math.max(1, Math.min(1000, Number(first(sp.page)) || 1));
  const filters = { class: first(sp.class), subject: first(sp.subject), type: first(sp.type) };
  const data = await getListing(cfg.sort, { page, ...filters }).catch(() => null);
  const qs = new URLSearchParams(
    Object.entries(filters).filter((e): e is [string, string] => Boolean(e[1])),
  );
  const hrefFor = (p: number) => {
    const n = new URLSearchParams(qs);
    if (p > 1) n.set('page', String(p));
    const s = n.toString();
    return `${cfg.path}${s ? `?${s}` : ''}`;
  };
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
      <Breadcrumbs
        items={[
          { name: 'Home', path: '/' },
          { name: cfg.heading, path: cfg.path },
        ]}
      />
      <header className="mb-4 flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{cfg.heading}</h1>
        <p className="text-muted-foreground max-w-3xl">{cfg.description}</p>
      </header>
      {cfg.tabs ? (
        <nav
          aria-label="Period"
          className="bg-muted mb-4 flex gap-1 rounded-lg p-1 text-sm sm:w-fit"
        >
          {cfg.tabs.map((t) => (
            <Link
              key={t.path}
              href={`${t.path}${qs.toString() ? `?${qs.toString()}` : ''}`}
              aria-current={t.path === cfg.path ? 'page' : undefined}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-center',
                t.path === cfg.path ? 'bg-card font-semibold shadow-xs' : 'text-muted-foreground',
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      ) : null}
      <form
        action={cfg.path}
        method="get"
        className="mb-6 flex flex-wrap gap-2"
        aria-label="Filter"
      >
        <AutoSubmitSelect
          name="class"
          defaultValue={filters.class ?? ''}
          className={SELECT}
          aria-label="Class"
        >
          <option value="">All classes</option>
          {taxonomy?.levels.map((l) => (
            <optgroup key={l.id} label={l.name}>
              {l.classes.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.shortName ?? c.name}
                </option>
              ))}
            </optgroup>
          ))}
        </AutoSubmitSelect>
        <AutoSubmitSelect
          name="subject"
          defaultValue={filters.subject ?? ''}
          className={SELECT}
          aria-label="Subject"
        >
          <option value="">All subjects</option>
          {taxonomy?.subjects
            .filter((s) => s.count > 0)
            .map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.name}
              </option>
            ))}
        </AutoSubmitSelect>
        <AutoSubmitSelect
          name="type"
          defaultValue={filters.type ?? ''}
          className={SELECT}
          aria-label="Resource type"
        >
          <option value="">All types</option>
          {taxonomy?.types
            .filter((t) => t.count > 0)
            .map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.pluralName}
              </option>
            ))}
        </AutoSubmitSelect>
        <noscript>
          <button
            type="submit"
            className="bg-primary text-primary-foreground h-10 rounded-md px-4 text-sm font-semibold"
          >
            Apply
          </button>
        </noscript>
      </form>
      {data ? (
        <>
          <p className="text-muted-foreground mb-3 text-sm">{pluralize(data.total, 'resource')}</p>
          {data.items.length ? (
            <ResourceGrid items={data.items} priorityCount={2} />
          ) : (
            <p className="bg-card text-muted-foreground rounded-xl border p-8 text-center">
              Nothing here yet. Check back soon.
            </p>
          )}
          <Pagination page={data.page} totalPages={data.totalPages} hrefFor={hrefFor} />
        </>
      ) : (
        <p role="alert" className="bg-card rounded-xl border p-8 text-center">
          This list is temporarily unavailable. Please try again.
        </p>
      )}
    </div>
  );
}
