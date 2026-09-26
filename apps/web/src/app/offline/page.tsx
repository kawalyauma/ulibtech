import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'You are offline', robots: { index: false } };

export default function OfflinePage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-20 text-center">
      <h1 className="text-2xl font-bold">You’re offline</h1>
      <p className="text-muted-foreground">
        Check your internet connection. Pages you visited recently are still available.
      </p>
      <Link
        href="/"
        className="bg-primary text-primary-foreground inline-flex h-10 items-center rounded-md px-4 text-sm font-semibold"
      >
        Try again
      </Link>
    </div>
  );
}
