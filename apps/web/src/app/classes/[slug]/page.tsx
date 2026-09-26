import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getClass, getTaxonomy } from '@/lib/api';
import { loadLanding } from '@/lib/landing';
import type { RawSearchParams } from '@/lib/search-params';
import { LandingView, landingMetadata } from '@/components/landing-view';
import { ChipLink } from '@/components/section';

export const revalidate = 300;
type Props = { params: Promise<{ slug: string }>; searchParams: Promise<RawSearchParams> };

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { data, page } = await loadLanding(`/classes/${slug}`, await searchParams).catch(() => ({ data: null, page: 1 }));
  return data ? landingMetadata(data, page) : { title: 'Class not found', robots: { index: false } };
}

export default async function ClassPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const [{ data, page, values }, taxonomy, cls] = await Promise.all([
    loadLanding(`/classes/${slug}`, await searchParams),
    getTaxonomy().catch(() => null),
    getClass(slug).catch(() => null),
  ]);
  if (!data) notFound();
  const subjects = cls?.subjects ?? [];
  const extra = subjects.length ? (
    <section aria-label="Subjects" className="mb-6 flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-muted-foreground">Subjects</h2>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:flex-wrap">
        {subjects.map((s) => (
          <ChipLink key={s.slug} href={`/${slug}/${s.slug}`} count={s.count}>
            {s.name}
          </ChipLink>
        ))}
      </div>
    </section>
  ) : null;
  return <LandingView data={data} taxonomy={taxonomy} page={page} values={values} extra={extra} />;
}
