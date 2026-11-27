import type { Metadata } from 'next';
import Link from 'next/link';
import { PageContainer } from '@/components/section';
import topics from './topics.json';

export const metadata: Metadata = {
  title: 'PLE Revision Centre | P7 Quizzes and Worksheets',
  description:
    'Practise P7 Mathematics and Integrated Science with free topic quizzes, worked answers and printable revision sheets for Ugandan learners.',
  alternates: { canonical: '/ple-revision' },
};

export default function RevisionCentre() {
  return (
    <PageContainer>
      <header className="mb-8 max-w-3xl">
        <h1 className="mb-3 text-3xl font-bold">PLE revision centre</h1>
        <p>
          Choose a topic, try five questions and check your working. Each topic includes a free
          worksheet and a separate answer key for teachers and parents.
        </p>
      </header>
      {['Mathematics', 'Integrated Science'].map((subject) => (
        <section className="mb-8" key={subject}>
          <h2 className="mb-3 text-xl font-bold">P7 {subject}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {topics
              .filter((t) => t.subject === subject)
              .map((t) => (
                <Link
                  key={t.slug}
                  href={'/ple-revision/' + t.slug}
                  className="bg-card hover:border-primary rounded-xl border p-5"
                >
                  <h3 className="text-primary mb-2 font-semibold underline">{t.title}</h3>
                  <p>{t.aim}</p>
                </Link>
              ))}
          </div>
        </section>
      ))}
      <Link href="/p7/mathematics/past-papers" className="text-primary underline">
        Browse P7 Mathematics past papers
      </Link>
    </PageContainer>
  );
}
