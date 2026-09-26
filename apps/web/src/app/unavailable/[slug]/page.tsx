import Link from 'next/link';
import type { Metadata } from 'next';
import { AlertTriangle } from 'lucide-react';
import { getResource } from '@/lib/api';

export const metadata: Metadata = {
  title: 'Resource unavailable',
  robots: { index: false, follow: true },
};

/** Rendered (with HTTP 410) by the proxy when a resource was unpublished or archived. */
export default async function UnavailablePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lookup = await getResource(slug).catch(() => null);
  const title = lookup && 'unavailable' in lookup ? lookup.unavailable : 'This resource';
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-20 text-center">
      <AlertTriangle className="text-warning size-10" aria-hidden="true" />
      <h1 className="text-2xl font-bold">Resource unavailable</h1>
      <p className="text-muted-foreground">
        “{title}” is no longer available. It may have been replaced by a newer version.
      </p>
      <Link
        href={`/search?q=${encodeURIComponent(title)}`}
        className="bg-primary text-primary-foreground inline-flex h-10 items-center rounded-md px-4 text-sm font-semibold"
      >
        Find similar resources
      </Link>
    </div>
  );
}
