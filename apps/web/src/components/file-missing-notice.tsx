'use client';

import { useSearchParams } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';

/** Shown when the API redirected here because the file could not be found (?file=missing). */
export function FileMissingNotice({ force = false }: { force?: boolean }) {
  const params = useSearchParams();
  if (!force && params.get('file') !== 'missing') return null;
  return (
    <div
      role="alert"
      className="border-warning/50 bg-warning/10 flex gap-3 rounded-xl border p-4 text-sm"
    >
      <AlertTriangle className="text-warning size-5 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">This file is temporarily unavailable.</p>
        <p className="text-muted-foreground">
          Our team has been notified. Please try again later or browse related resources below.
        </p>
      </div>
    </div>
  );
}
