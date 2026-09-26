import { AdminTableSkeleton, DashboardCardSkeleton } from '@edushare/ui';

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <DashboardCardSkeleton key={i} />
        ))}
      </div>
      <AdminTableSkeleton />
    </div>
  );
}
