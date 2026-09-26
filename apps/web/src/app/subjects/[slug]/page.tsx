import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTaxonomy } from '@/lib/api';
import { loadLanding } from '@/lib/landing';
import type { RawSearchParams } from '@/lib/search-params';
import { LandingView, landingMetadata } from '@/components/landing-view';
import { ChipLink } from '@/components/section';

export const revalidate = 300;
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { data, page } = await loadLanding(`/subjects/${slug}`, await searchParams).catch(() => ({ data: null, page: 1 }));
  return data ? landingMetadata(data, page) : { title: 'Subject not found', robots: { index: false } };
}

export default async function SubjectPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const [{ data, page, values }, taxonomy] = await Promise.all([loadLanding(`/subjects/${slug}`, await searchParams), getTaxonomy().catch(() => null)]);
  if (!data) notFound();
  const types = data.resources.facets.type;
  const extra = types.length ? (
    <div className="mb-6 flex flex-wrap gap-2">
      {types.map((t) => (
        <ChipLink key={t.slug} href={`/subjects/${slug}/${t.slug}`} count={t.count}>
          {t.name}
        </ChipLink>
      ))}
    </div>
  ) : null;
  return <LandingView data={data} taxonomy={taxonomy} page={page} values={values} extra={extra} />;
}
