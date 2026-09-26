import type { Metadata } from 'next';
import { SITE_NAME } from '@/lib/config';
import { PageContainer } from '@/components/section';

export const metadata: Metadata = {
  title: 'About',
  description: `${SITE_NAME} is a free public library of educational resources for Ugandan schools.`,
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <PageContainer className="max-w-3xl">
      <h1 className="mb-4 text-3xl font-bold">About {SITE_NAME}</h1>
      <div className="flex flex-col gap-4 text-base leading-relaxed">
        <p>
          {SITE_NAME} is a free public library of educational resources for schools, teachers,
          learners and parents in Uganda.
        </p>
        <p>
          You can search, preview and download past papers, notes, schemes of work, lesson plans,
          marking guides and more — from Baby Class to S6 — without creating an account, paying, or
          giving your email address.
        </p>
        <p>
          Resources are reviewed and published by our content team. If a resource you need is
          missing, search for it anyway: we use searches that return no results to decide what to
          add next.
        </p>
      </div>
    </PageContainer>
  );
}
