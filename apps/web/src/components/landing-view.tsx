import type { Metadata } from 'next';
import { collectionPageJsonLd } from '@edushare/seo';
import { pluralize } from '@edushare/shared';
import type { LandingResult, PublicTaxonomy } from '@/lib/api';
import { absoluteUrl } from '@/lib/config';
import { Breadcrumbs } from './breadcrumbs';
import { JsonLd } from './json-ld';
import { ResourceGrid } from './resource-card';
import { Pagination } from './pagination';
import { FilterForm } from './filters';
import { ChipLink } from './section';

export const LANDING_SORTS = [
  { value: 'newest', label: 'Newest' },
  { value: 'downloads', label: 'Most downloaded' },
  { value: 'trending_week', label: 'Trending this week' },
  { value: 'title', label: 'Title A–Z' },
];

export function landingMetadata(data: LandingResult, page: number): Metadata {
  const l = data.landing;
  const canonical = page > 1 ? `${l.path}?page=${page}` : l.path;
  return {
    title: page > 1 ? `${l.title} – Page ${page}` : l.title,
    description: l.description,
    alternates: { canonical },
    robots: l.noindex ? { index: false, follow: true } : undefined,
    openGraph: { title: l.heading, description: l.description, url: absoluteUrl(canonical), type: 'website' },
  };
}

export function LandingView({
  data,
  taxonomy,
  page,
  values,
  extra,
}: {
  data: LandingResult;
  taxonomy: PublicTaxonomy | null;
  page: number;
  values: Record<string, string | undefined>;
  extra?: React.ReactNode;
}) {
  const { landing, resources } = data;
  const hide = Object.entries(landing.filters)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k]) => k);
  const qs = new URLSearchParams(Object.entries(values).filter((e): e is [string, string] => Boolean(e[1])));
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
      <Breadcrumbs items={landing.breadcrumbs} />
      <JsonLd
        data={collectionPageJsonLd({
          name: landing.heading,
          description: landing.description,
          url: absoluteUrl(landing.path),
          items: resources.items.map((r) => ({ name: r.title, url: absoluteUrl(`/resources/${r.slug}`) })),
        })}
      />
      <header className="mb-6 flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{landing.heading}</h1>
        <p className="max-w-3xl text-muted-foreground">{landing.intro}</p>
        <p className="text-sm font-medium">{pluralize(resources.total, 'free resource')}</p>
      </header>
      {extra}
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="flex flex-col gap-6">
          <FilterForm action={landing.path} values={values} taxonomy={taxonomy} facets={resources.facets} hide={hide} sortOptions={LANDING_SORTS} />
        </aside>
        <div className="min-w-0">
          {resources.items.length ? (
            <ResourceGrid items={resources.items} priorityCount={2} />
          ) : (
            <div className="rounded-xl border bg-card p-8 text-center">
              <p className="font-semibold">No resources here yet.</p>
              <p className="mt-1 text-sm text-muted-foreground">New resources are added regularly. Try a related page below or search the library.</p>
            </div>
          )}
          <Pagination
            page={resources.page}
            totalPages={resources.totalPages}
            hrefFor={(p) => {
              const next = new URLSearchParams(qs);
              if (p > 1) next.set('page', String(p));
              else next.delete('page');
              const s = next.toString();
              return `${landing.path}${s ? `?${s}` : ''}`;
            }}
          />
        </div>
      </div>
      {landing.related.length ? (
        <section aria-labelledby="related-pages" className="mt-12 flex flex-col gap-3">
          <h2 id="related-pages" className="text-lg font-semibold">
            Related pages
          </h2>
          <div className="flex flex-wrap gap-2">
            {landing.related.map((r) => (
              <ChipLink key={r.path} href={r.path}>
                {r.name}
              </ChipLink>
            ))}
          </div>
        </section>
      ) : null}
      <span hidden>{page}</span>
    </div>
  );
}
