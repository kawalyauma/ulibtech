import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { PageContainer } from '@/components/section';
import topics from '../topics.json';
import { Quiz } from '../quiz';

type Props = { params: Promise<{ topic: string }> };
function lookup(slug: string) {
  return topics.find((t) => t.slug === slug) ?? notFound();
}
export function generateStaticParams() {
  return topics.map((t) => ({ topic: t.slug }));
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = lookup((await params).topic);
  return {
    title: 'P7 ' + t.title + ' Quiz and Worksheet',
    description: t.aim,
    alternates: { canonical: '/ple-revision/' + t.slug },
  };
}
export default async function TopicPage({ params }: Props) {
  const t = lookup((await params).topic);
  const science = t.subject === 'Integrated Science';
  return (
    <PageContainer>
      <article className="mx-auto max-w-3xl space-y-5">
        <Link href="/ple-revision" className="text-primary underline">
          All PLE revision topics
        </Link>
        <header>
          <p className="text-muted-foreground">P7 {t.subject}</p>
          <h1 className="text-3xl font-bold">{t.title}</h1>
          <p className="mt-2">{t.aim}</p>
        </header>
        <section className="bg-muted/40 space-y-3 rounded-xl border p-5">
          <h2 className="text-xl font-semibold">Before you practise</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>{t.method}</li>
            <li>{t.example}</li>
            <li>{t.pitfall}</li>
          </ul>
        </section>
        <section>
          <h2 className="text-xl font-semibold">Try the five-question quiz</h2>
          <p>
            Choose one answer for each question, then mark your answers to see the explanations.
          </p>
          <Quiz key={t.slug} questions={t.questions} />
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold">Practise on paper</h2>
          <div className="flex flex-wrap gap-5">
            <a className="text-primary underline" href={'/ple-worksheets/' + t.slug + '.pdf'}>
              Download learner worksheet (PDF)
            </a>
            <a className="text-primary underline" href={'/ple-worksheets/' + t.slug + '-key.pdf'}>
              Download teacher answer key (PDF)
            </a>
          </div>
        </section>
        <section>
          <h2 className="mb-2 text-xl font-semibold">Sources and further reading</h2>
          <p>
            These are original NotesUG practice questions. Curriculum reference:{' '}
            <a
              className="text-primary underline"
              href="https://ncdc.go.ug/wp-content/uploads/2024/07/PRIMARY-SEVEN-SET-ONE.pdf"
            >
              NCDC Primary Seven Curriculum,{' '}
              {science
                ? 'Integrated Science, Topic 1'
                : t.slug === 'time-and-duration'
                  ? 'Mathematics, Topic 9'
                  : 'Mathematics, Topic 5'}
            </a>
            .
          </p>
          {science && (
            <p>
              <a
                className="text-primary underline"
                href="https://www.kidshealth.org/NAPNAP/en/parents/bones-muscles-joints.html"
              >
                Nemours KidsHealth guide to bones, muscles and joints
              </a>{' '}
              ·{' '}
              <Link
                className="text-primary underline"
                href="/resources/notesug-approved-p7-science-lesson-notes-the-muscular-and-skeletal-system-term-1"
              >
                NotesUG P7 skeletal system lesson notes
              </Link>
            </p>
          )}
        </section>
      </article>
    </PageContainer>
  );
}
