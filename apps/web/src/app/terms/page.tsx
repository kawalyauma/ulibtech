import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_NAME } from '@/lib/config';
import { PageContainer } from '@/components/section';

export const metadata: Metadata = {
  title: 'Terms of use',
  description: `The terms for using ${SITE_NAME} and the resources it hosts.`,
  alternates: { canonical: '/terms' },
};

export default function TermsPage() {
  return (
    <PageContainer className="max-w-3xl">
      <h1 className="mb-4 text-3xl font-bold">Terms of use</h1>
      <div className="flex flex-col gap-4 text-base leading-relaxed">
        <p>
          By using {SITE_NAME} you agree to these terms. If you do not agree, please do not use the
          site.
        </p>
        <h2 className="mt-2 text-xl font-semibold">Using the resources</h2>
        <p>
          Resources are provided free for personal study and for teaching in schools. You may
          download, print and share them for these purposes. Do not sell them or republish them as
          your own.
        </p>
        <h2 className="mt-2 text-xl font-semibold">Accuracy</h2>
        <p>
          We work to describe and classify every resource correctly, but resources are provided
          as-is. Always check important information, such as syllabus requirements and examination
          rules, with your school or the relevant examination body.
        </p>
        <h2 className="mt-2 text-xl font-semibold">Copyright and removal requests</h2>
        <p>
          We respect the rights of authors and publishers. If you own a resource on this site and
          want it credited differently or removed,{' '}
          <Link className="underline" href="/contact">
            contact us
          </Link>{' '}
          with the page link and proof of ownership, and we will act on it promptly.
        </p>
        <h2 className="mt-2 text-xl font-semibold">Acceptable use</h2>
        <p>
          Do not attempt to disrupt the site, scrape it at a rate that affects other visitors, or
          use it to distribute harmful material.
        </p>
        <h2 className="mt-2 text-xl font-semibold">Changes</h2>
        <p>
          We may update these terms. The version on this page is the one that applies. See also our{' '}
          <Link className="underline" href="/privacy">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </PageContainer>
  );
}
