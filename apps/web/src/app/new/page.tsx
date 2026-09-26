import type { Metadata } from 'next';
import { getTaxonomy } from '@/lib/api';
import type { RawSearchParams } from '@/lib/search-params';
import { ListingPage, listingMetadata, type ListingConfig } from '@/components/listing-page';

const cfg: ListingConfig = {
  path: '/new',
  sort: 'newest',
  title: 'Recently Added Resources',
  heading: 'Recently added',
  description: 'The newest free resources added to the library.',
};

type Props = { searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return listingMetadata(cfg, await searchParams);
}

export default async function Page({ searchParams }: Props) {
  const [sp, taxonomy] = await Promise.all([searchParams, getTaxonomy().catch(() => null)]);
  return <ListingPage cfg={cfg} sp={sp} taxonomy={taxonomy} />;
}
