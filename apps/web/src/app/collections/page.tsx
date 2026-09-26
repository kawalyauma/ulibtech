import Link from 'next/link';
import type { Metadata } from 'next';
import { getCollections } from '@/lib/api';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/section';

export const revalidate = 300;
export const metadata: Metadata = {
  title: 'Resource collections',
  description: 'Curated collections of free revision packs, examination resources and teacher planning materials.',
  alternates: { canonical: '/collections' },
};

export default async function CollectionsPage() {
  const data = await getCollections().catch(() => null);
  return (
    <PageContainer>
      <Breadcrumbs items={[{ name: 'Home', path: '/' }, { name: 'Collections', path: '/collections' }]} />
      <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">Collections</h1>
      {data?.items.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.items.map((c) => (
            <li key={c.id}>
              <Link href={`/collections/${c.slug}`} className="flex h-full flex-col gap-1 rounded-xl border bg-card p-5 shadow-xs hover:border-primary">
                <span className="text-lg font-semibold">{c.title}</span>
                {c.description ? <span className="line-clamp-3 text-sm text-muted-foreground">{c.description}</span> : null}
                <span className="mt-auto pt-2 text-xs text-muted-foreground">{c.resourceCount} resources</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">No collections have been published yet.</p>
      )}
    </PageContainer>
  );
}
