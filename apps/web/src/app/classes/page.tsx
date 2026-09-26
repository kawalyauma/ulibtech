import Link from 'next/link';
import type { Metadata } from 'next';
import { getTaxonomy } from '@/lib/api';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/section';

export const revalidate = 600;
export const metadata: Metadata = {
  title: 'Browse resources by class – Nursery, Primary & Secondary',
  description: 'Free past papers, notes, schemes of work and lesson plans for every class from Baby Class to S6.',
  alternates: { canonical: '/classes' },
};

export default async function ClassesPage() {
  const tax = await getTaxonomy().catch(() => null);
  return (
    <PageContainer>
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Classes', path: '/classes' }]} />
      <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">Browse by class</h1>
      <div className="flex flex-col gap-8">
        {tax?.levels.map((level) => (
          <section key={level.id} id={level.slug} aria-labelledby={`lvl-${level.slug}`} className="scroll-mt-32">
            <h2 id={`lvl-${level.slug}`} className="mb-3 text-lg font-semibold">
              {level.name}
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {level.classes.map((c) => (
                <li key={c.id}>
                  <Link href={`/classes/${c.slug}`} className="flex flex-col rounded-xl border bg-card p-4 shadow-xs hover:border-primary">
                    <span className="text-lg font-bold">{c.shortName ?? c.name}</span>
                    <span className="text-xs text-muted-foreground">{c.name}</span>
                    <span className="mt-2 text-sm text-muted-foreground">{c.count} resources</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </PageContainer>
  );
}
