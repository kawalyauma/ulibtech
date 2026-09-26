import Link from 'next/link';
import type { Metadata } from 'next';
import { Megaphone } from 'lucide-react';
import { getHome } from '@/lib/api';
import { SITE_NAME } from '@/lib/config';
import { SearchBox } from '@/components/search-box';
import { ChipLink, PageContainer, Section } from '@/components/section';
import { ResourceGrid } from '@/components/resource-card';

export const revalidate = 120;

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export default async function HomePage() {
  const home = await getHome().catch(() => null);
  const hp = home?.homepage;
  const tax = home?.taxonomy;
  const navTypes = tax?.types.filter((t) => t.count > 0).slice(0, 12) ?? [];
  return (
    <>
      <section className="border-b bg-gradient-to-b from-secondary/70 to-background">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-5 px-4 pt-10 pb-8 text-center sm:pt-14 sm:pb-10">
          {hp?.announcement?.enabled && hp.announcement.message ? (
            <p className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-sm text-accent-foreground">
              <Megaphone className="size-4" aria-hidden="true" />
              {hp.announcement.href ? <Link href={hp.announcement.href} className="underline">{hp.announcement.message}</Link> : hp.announcement.message}
            </p>
          ) : null}
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">{hp?.heroTitle ?? 'Free learning resources for every Ugandan classroom'}</h1>
          <p className="max-w-2xl text-base text-muted-foreground sm:text-lg">
            {hp?.heroSubtitle ?? `Past papers, notes, schemes of work and lesson plans. Search, preview and download — no account needed.`}
          </p>
          <SearchBox size="lg" placeholder={hp?.searchPlaceholder} trending={home?.trendingSearches ?? []} className="max-w-2xl" />
          {home?.trendingSearches.length ? (
            <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
              <span className="text-muted-foreground">Trending:</span>
              {home.trendingSearches.slice(0, 5).map((q) => (
                <Link key={q} href={`/search?q=${encodeURIComponent(q)}`} className="rounded-full bg-card px-3 py-1 shadow-xs hover:text-primary">
                  {q}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <PageContainer className="flex flex-col gap-12">
        {tax ? (
          <Section title="Browse by class" href="/classes">
            <div className="flex flex-col gap-4">
              {tax.levels.map((level) => (
                <div key={level.id} className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-muted-foreground">{level.name}</h3>
                  <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:flex-wrap">
                    {level.classes.map((c) => (
                      <ChipLink key={c.id} href={`/classes/${c.slug}`}>
                        {c.shortName ?? c.name}
                      </ChipLink>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        {navTypes.length ? (
          <Section title="Browse by resource type">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {navTypes.map((t) => (
                <Link key={t.id} href={`/${t.slug}`} className="flex flex-col rounded-xl border bg-card p-4 shadow-xs hover:border-primary">
                  <span className="font-semibold">{t.pluralName}</span>
                  <span className="text-sm text-muted-foreground">{t.count} resources</span>
                </Link>
              ))}
            </div>
          </Section>
        ) : null}

        {home?.sections.map((s, i) => (
          <Section key={s.key} title={s.title} href={s.href}>
            <ResourceGrid items={s.items} priorityCount={i === 0 ? 2 : 0} />
          </Section>
        ))}

        {home?.featuredSubjects.length ? (
          <Section title="Browse by subject" href="/subjects">
            <div className="flex flex-wrap gap-2">
              {home.featuredSubjects.map((s) => (
                <ChipLink key={s.slug} href={`/subjects/${s.slug}`} count={s.count}>
                  {s.name}
                </ChipLink>
              ))}
            </div>
          </Section>
        ) : null}

        {home?.collections.length ? (
          <Section title="Collections" href="/collections">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {home.collections.map((c) => (
                <Link key={c.id} href={`/collections/${c.slug}`} className="flex flex-col gap-1 rounded-xl border bg-card p-4 shadow-xs hover:border-primary">
                  <span className="font-semibold">{c.title}</span>
                  {c.description ? <span className="line-clamp-2 text-sm text-muted-foreground">{c.description}</span> : null}
                  <span className="text-xs text-muted-foreground">{c.resourceCount} resources</span>
                </Link>
              ))}
            </div>
          </Section>
        ) : null}

        {tax?.years.some((y) => y.count > 0) ? (
          <Section title="Browse by year">
            <div className="flex flex-wrap gap-2">
              {tax.years
                .filter((y) => y.count > 0)
                .map((y) => (
                  <ChipLink key={y.id} href={`/search?year=${y.year}`} count={y.count}>
                    {y.year}
                  </ChipLink>
                ))}
            </div>
          </Section>
        ) : null}

        {!home ? (
          <p className="rounded-xl border bg-card p-6 text-center text-muted-foreground">
            {SITE_NAME} is loading its library. Please refresh in a moment.
          </p>
        ) : null}
      </PageContainer>
    </>
  );
}
