import { HomepageSectionSkeleton, Skeleton } from '@edushare/ui';

export default function Loading() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8">
      <div className="flex flex-col items-center gap-4">
        <Skeleton className="h-10 w-full max-w-xl" />
        <Skeleton className="h-5 w-full max-w-lg" />
        <Skeleton className="h-14 w-full max-w-2xl rounded-full" />
      </div>
      <HomepageSectionSkeleton />
      <HomepageSectionSkeleton />
    </div>
  );
}
