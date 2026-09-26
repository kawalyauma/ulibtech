import type { Metadata } from 'next';
import { getTaxonomy } from '@/lib/api';
import type { RawSearchParams } from '@/lib/search-params';
import { ListingPage, listingMetadata, type ListingConfig } from '@/components/listing-page';

const cfg: ListingConfig = {
  path: '/trending/week',
  sort: 'trending_week',
  title: 'Trending This Week – Free Resources',
  heading: 'Trending this week',
  description:
    'The most active resources over the past seven days, weighted towards recent downloads and shares.',
  tabs: [
    { label: 'Today', path: '/trending', sort: 'trending_today' },
    { label: 'This week', path: '/trending/week', sort: 'trending_week' },
  ],
};

type Props = { searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  return listingMetadata(cfg, await searchParams);
}

export default async function Page({ searchParams }: Props) {
  const [sp, taxonomy] = await Promise.all([searchParams, getTaxonomy().catch(() => null)]);
  return <ListingPage cfg={cfg} sp={sp} taxonomy={taxonomy} />;
}
