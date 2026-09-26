import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTaxonomy } from '@/lib/api';
import { loadLanding } from '@/lib/landing';
import type { RawSearchParams } from '@/lib/search-params';
import { LandingView, landingMetadata } from '@/components/landing-view';

export const revalidate = 300;
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { data, page } = await loadLanding(`/topics/${slug}`, await searchParams).catch(() => ({ data: null, page: 1 }));
  return data ? landingMetadata(data, page) : { title: 'Topic not found', robots: { index: false } };
}

export default async function TopicPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const [{ data, page, values }, taxonomy] = await Promise.all([loadLanding(`/topics/${slug}`, await searchParams), getTaxonomy().catch(() => null)]);
  if (!data) notFound();
  return <LandingView data={data} taxonomy={taxonomy} page={page} values={values} />;
}
