import { Skeleton, Card } from './misc';
import { cn } from '../utils';

/** Matches ResourceCard: portrait thumbnail (1:1.3), 3 text lines, action row. */
export function ResourceCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn('flex flex-col overflow-hidden', className)} aria-hidden="true">
      <Skeleton className="aspect-[1/1.3] w-full rounded-none" />
      <div className="flex flex-1 flex-col gap-2 p-3">
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="mt-auto h-8 w-full" />
      </div>
    </Card>
  );
}

export function ResourceGridSkeleton({
  count = 8,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div
      className={cn('grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4', className)}
      role="status"
      aria-label="Loading resources"
    >
      {Array.from({ length: count }, (_, i) => (
        <ResourceCardSkeleton key={i} />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Matches a horizontal search result row. */
export function SearchResultSkeleton() {
  return (
    <div className="bg-card flex gap-3 rounded-xl border p-3 sm:gap-4" aria-hidden="true">
      <Skeleton className="h-[104px] w-20 shrink-0 sm:h-[130px] sm:w-[100px]" />
      <div className="flex flex-1 flex-col gap-2 py-1">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-5 w-full max-w-md" />
        <Skeleton className="h-3 w-full max-w-lg" />
        <Skeleton className="h-3 w-2/3 max-w-sm" />
        <Skeleton className="mt-auto h-8 w-32" />
      </div>
    </div>
  );
}

export function SearchResultsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Loading search results">
      <Skeleton className="h-4 w-48" />
      {Array.from({ length: count }, (_, i) => (
        <SearchResultSkeleton key={i} />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** Matches the resource detail layout (preview column + details column). */
export function ResourcePageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6" role="status" aria-label="Loading resource">
      <Skeleton className="mb-4 h-4 w-72 max-w-full" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-full max-w-xl" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <Skeleton className="aspect-[1/1.3] w-full max-w-md" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function HomepageSectionSkeleton({ title = true }: { title?: boolean }) {
  return (
    <section className="flex flex-col gap-3" aria-hidden="true">
      {title ? <Skeleton className="h-6 w-48" /> : null}
      <ResourceGridSkeleton count={4} />
    </section>
  );
}

export function AdminTableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div
      className="bg-card overflow-hidden rounded-xl border"
      role="status"
      aria-label="Loading table"
    >
      <div className="flex gap-4 border-b p-3">
        {Array.from({ length: columns }, (_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 border-b p-3 last:border-0">
          {Array.from({ length: columns }, (_, i) => (
            <Skeleton key={i} className={cn('h-4 flex-1', i === 0 && 'flex-[2]')} />
          ))}
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

export function DashboardCardSkeleton() {
  return (
    <Card className="flex flex-col gap-3 p-5" aria-hidden="true">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-20" />
      <Skeleton className="h-3 w-32" />
    </Card>
  );
}
