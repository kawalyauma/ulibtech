import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTaxonomy } from '@/lib/api';
import { loadLanding } from '@/lib/landing';
import type { RawSearchParams } from '@/lib/search-params';
import { LandingView, landingMetadata } from '@/components/landing-view';

/**
 * Classification landing pages generated from taxonomy, e.g.
 *   /past-papers, /p7/past-papers, /p6/science, /p6/science/past-papers, /p6/science/past-papers/2026
 */
export const revalidate = 300;

type Props = { params: Promise<{ segments: string[] }>; searchParams: Promise<RawSearchParams> };

function pathOf(segments: string[]) {
  return `/${segments.map((s) => decodeURIComponent(s).toLowerCase()).join('/')}`;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { segments } = await params;
  const { data, page } = await loadLanding(pathOf(segments), await searchParams).catch(() => ({
    data: null,
    page: 1,
  }));
  if (!data) return { title: 'Page not found', robots: { index: false } };
  return landingMetadata(data, page);
}

export default async function LandingPage({ params, searchParams }: Props) {
  const { segments } = await params;
  if (segments.length > 4) notFound();
  const [{ data, page, values }, taxonomy] = await Promise.all([
    loadLanding(pathOf(segments), await searchParams),
    getTaxonomy().catch(() => null),
  ]);
  if (!data) notFound();
  return <LandingView data={data} taxonomy={taxonomy} page={page} values={values} />;
}
