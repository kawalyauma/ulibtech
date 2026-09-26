'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-20 text-center"
    >
      <h1 className="text-2xl font-bold">Something went wrong</h1>
      <p className="text-muted-foreground">
        We couldn’t load this page. This is usually a temporary network problem.
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="bg-primary text-primary-foreground inline-flex h-10 items-center rounded-md px-4 text-sm font-semibold"
        >
          Try again
        </button>
        <Link href="/" className="inline-flex h-10 items-center rounded-md border px-4 text-sm">
          Go home
        </Link>
      </div>
      {error.digest ? (
        <p className="text-muted-foreground text-xs">Reference: {error.digest}</p>
      ) : null}
    </div>
  );
}
