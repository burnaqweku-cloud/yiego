import { Skeleton } from '@/components/ui/skeleton';

export const StoreHeaderSkeleton = () => (
  <div className="bg-card border-b border-border">
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="flex items-start gap-4">
        <Skeleton className="w-[72px] h-[72px] rounded-2xl" />
        <div className="flex-1 space-y-2.5 pt-1">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="h-11 w-full rounded-xl mt-4" />
    </div>
  </div>
);

export const StoreStatusSkeleton = () => (
  <div className="bg-card border border-border rounded-2xl p-3.5">
    <div className="flex items-center justify-between">
      <Skeleton className="h-3.5 w-28" />
      <Skeleton className="h-3.5 w-16" />
    </div>
    <div className="flex items-center justify-between mt-2.5">
      <Skeleton className="h-3 w-40" />
      <div className="flex gap-1.5">
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
    </div>
  </div>
);

export const StoreBundleSkeleton = () => (
  <>
    <div className="flex gap-2 mb-4">
      {[1, 2, 3].map(i => (
        <Skeleton key={i} className="flex-1 h-10 rounded-xl" />
      ))}
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {[1, 2, 3, 4, 5, 6].map(i => (
        <div key={i} className="bg-card rounded-2xl border border-border p-4">
          <Skeleton className="h-7 w-14 mb-2" />
          <Skeleton className="h-3 w-20 mb-2" />
          <Skeleton className="h-3 w-16 mb-3" />
          <div className="pt-3 border-t border-border">
            <Skeleton className="h-5 w-20 mb-2.5" />
            <Skeleton className="h-9 w-full rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  </>
);
