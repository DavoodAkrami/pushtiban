import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

/**
 * Body placeholder for a tabbed dashboard section. The tab strip lives in the
 * segment layout, which Next keeps mounted across child navigation, so only the
 * page body below it needs a skeleton.
 */
export const SectionLoading = () => (
  <div role="status" aria-label="در حال بارگذاری">
    <div className="flex items-start gap-4">
      <Skeleton className="size-11 rounded-2xl" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-72" />
      </div>
    </div>
    <div className="mt-8 space-y-4">
      <div className="rounded-3xl border border-line bg-surface/35 p-5">
        <SkeletonText lines={3} />
      </div>
      <div className="rounded-3xl border border-line bg-surface/35 p-5">
        <SkeletonText lines={2} />
      </div>
    </div>
  </div>
);
