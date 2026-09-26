import Link from 'next/link';
import type { Metadata } from 'next';
import { getTaxonomy } from '@/lib/api';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { PageContainer } from '@/components/section';

export const revalidate = 600;
export const metadata: Metadata = {
  title: 'Browse resources by subject',
  description:
    'Free notes, past papers and teaching resources for Mathematics, English, Science, Social Studies and every other subject.',
  alternates: { canonical: '/subjects' },
};

export default async function SubjectsPage() {
  const tax = await getTaxonomy().catch(() => null);
  return (
    <PageContainer>
      <Breadcrumbs
        items={[
          { name: 'Home', path: '/' },
          { name: 'Subjects', path: '/subjects' },
        ]}
      />
      <h1 className="mb-6 text-2xl font-bold tracking-tight sm:text-3xl">Browse by subject</h1>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {tax?.subjects.map((s) => (
          <li key={s.id}>
            <Link
              href={`/subjects/${s.slug}`}
              className="bg-card hover:border-primary flex flex-col rounded-xl border p-4 shadow-xs"
            >
              <span className="font-semibold">{s.name}</span>
              <span className="text-muted-foreground text-sm">{s.count} resources</span>
            </Link>
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}
