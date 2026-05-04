import { Skeleton } from '@/components/ui/skeleton';

export const DashboardSkeleton = () => (
  <div className="space-y-6 animate-page-in">
    {/* Header skeleton */}
    <div className="space-y-2">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-64" />
    </div>

    {/* KPI Cards */}
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="bg-card rounded-2xl border border-border p-4">
          <Skeleton className="w-9 h-9 rounded-xl mb-3" />
          <Skeleton className="h-6 w-20 mb-1" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>

    {/* Charts */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-card rounded-2xl border border-border p-4">
        <Skeleton className="h-4 w-32 mb-4" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
      <div className="bg-card rounded-2xl border border-border p-4">
        <Skeleton className="h-4 w-32 mb-4" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    </div>
  </div>
);

export const OrdersSkeleton = () => (
  <div className="space-y-3">
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="flex items-center gap-3 py-3">
        <Skeleton className="w-2 h-2 rounded-full" />
        <div className="flex-1">
          <Skeleton className="h-4 w-36 mb-1" />
          <Skeleton className="h-3 w-28" />
        </div>
        <Skeleton className="h-4 w-20" />
      </div>
    ))}
  </div>
);

export const EarningsSkeleton = () => (
  <div className="space-y-6">
    <div className="grid grid-cols-2 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-card rounded-2xl border border-border p-4">
          <Skeleton className="w-9 h-9 rounded-xl mb-3" />
          <Skeleton className="h-6 w-24 mb-1" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
    <div className="bg-card rounded-2xl border border-border p-4">
      <Skeleton className="h-4 w-32 mb-4" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  </div>
);
