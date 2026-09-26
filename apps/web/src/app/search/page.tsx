import Link from 'next/link';
import type { Metadata } from 'next';
import { SearchX } from 'lucide-react';
import { pluralize } from '@edushare/shared';
import { getClass, getHome, getTaxonomy, search } from '@/lib/api';
import { first, toApiParams, withParam, type RawSearchParams } from '@/lib/search-params';
import { SearchBox } from '@/components/search-box';
import { SearchResult } from '@/components/search-result';
import { FilterForm } from '@/components/filters';
import { Pagination } from '@/components/pagination';
import { ResourceGrid } from '@/components/resource-card';
import { SearchTracker } from '@/components/trackers';
import { ChipLink, PageContainer } from '@/components/section';

const SORTS = [
  { value: 'relevance', label: 'Best match' },
  { value: 'newest', label: 'Newest' },
  { value: 'downloads', label: 'Most downloaded' },
  { value: 'trending_week', label: 'Trending this week' },
  { value: 'trending_today', label: 'Trending today' },
];

type Props = { searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const q = first((await searchParams).q)?.trim();
  return {
    title: q ? `Search results for “${q.slice(0, 60)}”` : 'Search free resources',
    description:
      'Search free notes, past papers, schemes of work and lesson plans for Ugandan schools.',
    alternates: { canonical: q ? `/search?q=${encodeURIComponent(q)}` : '/search' },
    // Search result pages are not indexed; landing pages carry the SEO weight.
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const sp = await searchParams;
  const params = toApiParams(sp, { pageSize: '20' });
  const linkParams = toApiParams(sp);
  const q = params.get('q') ?? '';
  const [result, taxonomy] = await Promise.all([
    search(params).catch(() => null),
    getTaxonomy().catch(() => null),
  ]);
  const values: Record<string, string | undefined> = Object.fromEntries(
    ['class', 'subject', 'type', 'year', 'term', 'fileType', 'curriculum', 'level', 'sort'].map(
      (k) => [k, params.get(k) ?? undefined],
    ),
  );
  const activeFilters = Object.fromEntries(
    Object.entries(values).filter(([k, v]) => v && k !== 'sort'),
  ) as Record<string, string>;
  const interpreted = result?.interpreted ?? {};
  const noResults = result !== null && result.total === 0;

  const nameOf = {
    class: (s?: string) =>
      taxonomy?.levels.flatMap((l) => l.classes).find((c) => c.slug === s)?.shortName ?? s,
    subject: (s?: string) => taxonomy?.subjects.find((x) => x.slug === s)?.name ?? s,
    type: (s?: string) => taxonomy?.types.find((x) => x.slug === s)?.pluralName ?? s,
  };

  return (
    <PageContainer>
      <div className="mb-6 flex flex-col gap-3">
        <h1 className="sr-only">{q ? `Search results for ${q}` : 'Search resources'}</h1>
        <SearchBox key={q} defaultValue={q} autoFocus={!q} />
        {result ? (
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {q ? (
              <>
                {pluralize(result.total, 'result')} for{' '}
                <strong className="text-foreground">“{q}”</strong>
              </>
            ) : (
              <>{pluralize(result.total, 'resource')}</>
            )}
            {interpreted.class || interpreted.subject || interpreted.type ? (
              <span>
                {' '}
                · Showing{' '}
                {[
                  nameOf.class(interpreted.class),
                  nameOf.subject(interpreted.subject),
                  nameOf.type(interpreted.type),
                  interpreted.year,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            ) : null}
          </p>
        ) : null}
        {result?.didYouMean && result.didYouMean !== result.normalizedQuery ? (
          <p className="text-sm">
            {result.total > 0 && result.mode !== 'any' ? 'Showing results for ' : 'Did you mean '}
            <Link
              href={`/search?q=${encodeURIComponent(result.didYouMean)}`}
              className="text-primary font-semibold underline"
            >
              {result.didYouMean}
            </Link>
            ?
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside>
          <FilterForm
            action="/search"
            values={values}
            taxonomy={taxonomy}
            facets={result?.facets}
            hidden={{ q }}
            sortOptions={SORTS}
          />
        </aside>
        <div className="flex min-w-0 flex-col gap-3">
          {result === null ? (
            <div role="alert" className="bg-card rounded-xl border p-6 text-center">
              <p className="font-semibold">Search is temporarily unavailable.</p>
              <p className="text-muted-foreground mt-1 text-sm">
                Please check your connection and try again.
              </p>
              <a
                href={`/search${linkParams.toString() ? `?${linkParams.toString()}` : ''}`}
                className="bg-primary text-primary-foreground mt-4 inline-flex h-10 items-center rounded-md px-4 text-sm font-semibold"
              >
                Retry
              </a>
            </div>
          ) : noResults ? (
            <NoResults
              q={q}
              didYouMean={result.didYouMean}
              interpretedClass={interpreted.class}
              interpretedSubject={interpreted.subject}
            />
          ) : (
            <>
              <ol className="flex flex-col gap-3">
                {result.items.map((hit, i) => (
                  <li key={hit.id}>
                    <SearchResult hit={hit} priority={i < 2} />
                  </li>
                ))}
              </ol>
              <Pagination
                page={result.page}
                totalPages={result.totalPages}
                hrefFor={(p) => `/search${withParam(linkParams, 'page', p > 1 ? String(p) : null)}`}
              />
            </>
          )}
        </div>
      </div>
      {result ? (
        <SearchTracker
          q={q}
          results={result.total}
          filters={{
            ...activeFilters,
            ...(interpreted.class ? { interpretedClass: interpreted.class } : {}),
            ...(interpreted.subject ? { interpretedSubject: interpreted.subject } : {}),
          }}
        />
      ) : null}
    </PageContainer>
  );
}

async function NoResults({
  q,
  didYouMean,
  interpretedClass,
  interpretedSubject,
}: {
  q: string;
  didYouMean: string | null;
  interpretedClass?: string;
  interpretedSubject?: string;
}) {
  const [cls, home] = await Promise.all([
    interpretedClass ? getClass(interpretedClass).catch(() => null) : null,
    getHome().catch(() => null),
  ]);
  const popular =
    home?.sections.find((s) => s.key === 'popular')?.items ?? home?.sections[0]?.items ?? [];
  const classSubjects = cls?.subjects.filter((s) => s.count > 0) ?? [];
  const subjectName = home?.taxonomy.subjects.find((s) => s.slug === interpretedSubject)?.name;
  return (
    <div className="flex flex-col gap-8">
      <div className="bg-card rounded-xl border p-6 text-center">
        <SearchX className="text-muted-foreground mx-auto size-10" aria-hidden="true" />
        <h2 className="mt-3 text-lg font-semibold">
          {q ? `No results for “${q}”` : 'No resources match these filters'}
        </h2>
        {didYouMean ? (
          <p className="mt-2">
            Did you mean{' '}
            <Link
              href={`/search?q=${encodeURIComponent(didYouMean)}`}
              className="text-primary font-semibold underline"
            >
              {didYouMean}
            </Link>
            ?
          </p>
        ) : null}
        <p className="text-muted-foreground mt-2 text-sm">
          Try fewer words, check the spelling, or browse by class and subject below.
        </p>
        {q.split(/\s+/).length > 1 ? (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {q
              .split(/\s+/)
              .filter((w) => w.length > 2)
              .slice(0, 4)
              .map((w) => (
                <ChipLink key={w} href={`/search?q=${encodeURIComponent(w)}`}>
                  {w}
                </ChipLink>
              ))}
          </div>
        ) : null}
      </div>
      {cls && classSubjects.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">
            {subjectName && !classSubjects.some((s) => s.slug === interpretedSubject)
              ? `${subjectName} isn't available for ${cls.class.shortName ?? cls.class.name}. Try these ${cls.class.shortName ?? cls.class.name} subjects:`
              : `Browse ${cls.class.shortName ?? cls.class.name} subjects`}
          </h2>
          <div className="flex flex-wrap gap-2">
            {classSubjects.map((s) => (
              <ChipLink key={s.slug} href={`/${cls.class.slug}/${s.slug}`} count={s.count}>
                {cls.class.shortName} {s.name}
              </ChipLink>
            ))}
          </div>
        </section>
      ) : null}
      {home?.taxonomy ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Browse by class</h2>
          <div className="flex flex-wrap gap-2">
            {home.taxonomy.levels
              .flatMap((l) => l.classes)
              .filter((c) => c.count > 0)
              .map((c) => (
                <ChipLink key={c.slug} href={`/classes/${c.slug}`} count={c.count}>
                  {c.shortName ?? c.name}
                </ChipLink>
              ))}
          </div>
        </section>
      ) : null}
      {popular.length ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Popular resources</h2>
          <ResourceGrid items={popular.slice(0, 8)} />
        </section>
      ) : null}
    </div>
  );
}
