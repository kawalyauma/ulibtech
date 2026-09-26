import type { Metadata } from 'next';
import { getTaxonomy } from '@/lib/api';
import type { RawSearchParams } from '@/lib/search-params';
import { ListingPage, listingMetadata, type ListingConfig } from '@/components/listing-page';

const cfg: ListingConfig = {
  path: '/popular',
  sort: 'downloads',
  title: 'Most Downloaded Resources',
  heading: 'Most downloaded',
  description: 'All-time most downloaded past papers, notes, schemes of work and lesson plans.',
};

type Props = { searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return listingMetadata(cfg, await searchParams);
}

export default async function Page({ searchParams }: Props) {
  const [sp, taxonomy] = await Promise.all([searchParams, getTaxonomy().catch(() => null)]);
  return <ListingPage cfg={cfg} sp={sp} taxonomy={taxonomy} />;
}
