import { SearchResultsSkeleton, Skeleton } from '@edushare/ui';

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
      <Skeleton className="mb-6 h-11 w-full rounded-full" />
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="hidden flex-col gap-3 lg:flex">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
        <Skeleton className="h-12 w-full lg:hidden" />
        <SearchResultsSkeleton />
      </div>
    </div>
  );
}
