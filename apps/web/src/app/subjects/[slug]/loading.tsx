import { ResourceGridSkeleton, Skeleton } from '@edushare/ui';

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:py-8">
      <Skeleton className="mb-4 h-4 w-64" />
      <Skeleton className="mb-2 h-8 w-80 max-w-full" />
      <Skeleton className="mb-6 h-4 w-full max-w-2xl" />
      <ResourceGridSkeleton count={8} />
    </div>
  );
}
