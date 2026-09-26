import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@edushare/ui';

export function Pagination({ page, totalPages, hrefFor }: { page: number; totalPages: number; hrefFor: (page: number) => string }) {
  if (totalPages <= 1) return null;
  const pages = new Set<number>([1, totalPages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= totalPages));
  const sorted = [...pages].sort((a, b) => a - b);
  const linkCls = 'inline-flex h-10 min-w-10 items-center justify-center rounded-md border bg-card px-3 text-sm hover:bg-muted';
  return (
    <nav aria-label="Pagination" className="mt-8 flex flex-wrap items-center justify-center gap-1.5">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} className={linkCls} rel="prev" aria-label="Previous page">
          <ChevronLeft className="size-4" aria-hidden="true" /> <span className="hidden sm:inline">Previous</span>
        </Link>
      ) : null}
      {sorted.map((p, i) => (
        <span key={p} className="flex items-center gap-1.5">
          {i > 0 && p - sorted[i - 1]! > 1 ? <span className="px-1 text-muted-foreground">…</span> : null}
          <Link
            href={hrefFor(p)}
            aria-current={p === page ? 'page' : undefined}
            className={cn(linkCls, p === page && 'border-primary bg-primary text-primary-foreground hover:bg-primary')}
          >
            {p}
          </Link>
        </span>
      ))}
      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} className={linkCls} rel="next" aria-label="Next page">
          <span className="hidden sm:inline">Next</span> <ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </nav>
  );
}
