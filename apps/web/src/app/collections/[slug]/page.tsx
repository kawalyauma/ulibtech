import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { collectionPageJsonLd } from '@edushare/seo';
import { getCollection } from '@/lib/api';
import { absoluteUrl } from '@/lib/config';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { JsonLd } from '@/components/json-ld';
import { ResourceGrid } from '@/components/resource-card';
import { PageContainer } from '@/components/section';

export const revalidate = 300;
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const c = await getCollection(slug).catch(() => null);
  if (!c) return { title: 'Collection not found', robots: { index: false } };
  return {
    title: c.seoTitle ?? c.title,
    description:
      c.seoDescription ??
      c.description ??
      `${c.resourceCount} free resources in the ${c.title} collection.`,
    alternates: { canonical: `/collections/${c.slug}` },
  };
}

export default async function CollectionPage({ params }: Props) {
  const { slug } = await params;
  const c = await getCollection(slug);
  if (!c) notFound();
  return (
    <PageContainer>
      <Breadcrumbs
        items={[
          { name: 'Home', path: '/' },
          { name: 'Collections', path: '/collections' },
          { name: c.title, path: `/collections/${c.slug}` },
        ]}
      />
      <JsonLd
        data={collectionPageJsonLd({
          name: c.title,
          description: c.description ?? c.title,
          url: absoluteUrl(`/collections/${c.slug}`),
          items: c.resources.map((r) => ({
            name: r.title,
            url: absoluteUrl(`/resources/${r.slug}`),
          })),
        })}
      />
      <header className="mb-6 flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{c.title}</h1>
        {c.description ? <p className="text-muted-foreground max-w-3xl">{c.description}</p> : null}
        <p className="text-sm font-medium">{c.resources.length} resources</p>
      </header>
      <ResourceGrid items={c.resources} priorityCount={2} />
    </PageContainer>
  );
}
