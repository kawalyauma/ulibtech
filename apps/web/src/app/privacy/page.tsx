import type { Metadata } from 'next';
import Link from 'next/link';
import { ADSENSE_CLIENT_ID, SITE_NAME } from '@/lib/config';
import { PageContainer } from '@/components/section';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: `How ${SITE_NAME} handles information about visitors, including cookies and advertising.`,
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <PageContainer className="max-w-3xl">
      <h1 className="mb-4 text-3xl font-bold">Privacy policy</h1>
      <div className="prose-sm flex flex-col gap-4 text-base leading-relaxed">
        <p>
          {SITE_NAME} lets anyone browse, preview and download educational resources without an
          account. This page explains what we record when you use the site and why.
        </p>
        <h2 className="mt-2 text-xl font-semibold">What we record</h2>
        <ul className="list-disc pl-6">
          <li>
            <strong>Anonymous usage statistics.</strong> We count views, downloads, shares and
            searches to show popular and trending resources and to decide what to add next. Visitors
            are identified only by a hash that changes every day; we never store IP addresses and
            cannot identify you from these statistics.
          </li>
          <li>
            <strong>Search terms.</strong> What you type in the search box is recorded without any
            link to you, so we can improve results and fill gaps.
          </li>
          <li>
            <strong>On your own device.</strong> Your recent searches are kept in your browser
            (local storage) and never sent to us. You can clear them by clearing your browser data.
          </li>
          <li>
            <strong>Server logs.</strong> Our servers keep short-lived technical logs for security
            and troubleshooting.
          </li>
        </ul>
        <h2 className="mt-2 text-xl font-semibold">Cookies and advertising</h2>
        {ADSENSE_CLIENT_ID ? (
          <>
            <p>
              We do not set cookies for visitors ourselves. To keep the library free, we show ads
              provided by Google AdSense. Google and its partners use cookies and similar
              technologies to serve and measure ads, including ads based on your previous visits to
              this and other websites.
            </p>
            <p>
              You can learn how Google uses this information in{' '}
              <a
                className="underline"
                href="https://policies.google.com/technologies/partner-sites"
                rel="noopener noreferrer"
                target="_blank"
              >
                How Google uses information from sites that use its services
              </a>
              , and turn off personalised ads in{' '}
              <a
                className="underline"
                href="https://adssettings.google.com"
                rel="noopener noreferrer"
                target="_blank"
              >
                Google Ad Settings
              </a>
              .
            </p>
          </>
        ) : (
          <p>
            We do not set cookies for visitors and do not show third-party advertising. If that
            changes, this page will be updated before it happens.
          </p>
        )}
        <h2 className="mt-2 text-xl font-semibold">Children</h2>
        <p>
          The site is used by learners, including children. We do not ask for or knowingly collect
          personal information from anyone. Resources that contain personal data about learners are
          not published.
        </p>
        <h2 className="mt-2 text-xl font-semibold">Contact</h2>
        <p>
          Questions about this policy?{' '}
          <Link className="underline" href="/contact">
            Contact us
          </Link>
          .
        </p>
      </div>
    </PageContainer>
  );
}
