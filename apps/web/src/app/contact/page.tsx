import type { Metadata } from 'next';
import { getSiteSettings } from '@/lib/api';
import { SITE_NAME } from '@/lib/config';
import { PageContainer } from '@/components/section';

export const revalidate = 600;

export const metadata: Metadata = {
  title: 'Contact us',
  description: `How to reach the ${SITE_NAME} team: questions, missing resources and removal requests.`,
  alternates: { canonical: '/contact' },
};

export default async function ContactPage() {
  const site = await getSiteSettings()
    .then((r) => r?.site ?? null)
    .catch(() => null);
  const email = site?.contactEmail ?? null;
  const whatsapp = site?.whatsappNumber?.replace(/[^\d+]/g, '') ?? null;
  return (
    <PageContainer className="max-w-3xl">
      <h1 className="mb-4 text-3xl font-bold">Contact us</h1>
      <div className="flex flex-col gap-4 text-base leading-relaxed">
        <p>We are happy to hear from teachers, learners, parents and schools. Contact us to:</p>
        <ul className="list-disc pl-6">
          <li>ask for a resource you could not find,</li>
          <li>report a mistake in a title, description or classification,</li>
          <li>request that a resource you own is credited or removed.</li>
        </ul>
        <div className="bg-muted/40 flex flex-col gap-2 rounded-xl border p-5">
          {email ? (
            <p>
              <strong>Email:</strong>{' '}
              <a className="underline" href={`mailto:${email}`}>
                {email}
              </a>
            </p>
          ) : null}
          {whatsapp ? (
            <p>
              <strong>WhatsApp:</strong>{' '}
              <a className="underline" href={`https://wa.me/${whatsapp.replace(/^\+/, '')}`}>
                {site?.whatsappNumber}
              </a>
            </p>
          ) : null}
          {!email && !whatsapp ? (
            <p className="text-muted-foreground">
              Contact details are being updated. Please check back soon.
            </p>
          ) : null}
        </div>
        <p className="text-muted-foreground text-sm">
          For removal requests, include the link to the resource page and how you own it.
        </p>
      </div>
    </PageContainer>
  );
}
