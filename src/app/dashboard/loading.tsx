import { Skeleton, SkeletonBlock } from "@/components/ui/skeleton";

/**
 * Route-level loading UI for every /dashboard segment — renders inside the
 * shell (sidebar stays put) while the page and the auth middleware resolve.
 */
export default function DashboardLoading() {
  return (
    <div
      role="status"
      aria-label="در حال بارگذاری داشبورد"
      className="mx-auto max-w-5xl"
    >
      {/* Page header */}
      <div className="mb-8 space-y-3">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-3xl border border-line bg-surface/40 p-5"
          >
            <Skeleton className="size-5 rounded-lg" />
            <Skeleton className="mt-4 h-7 w-16" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
        ))}
      </div>

      {/* Large content block */}
      <SkeletonBlock className="mt-8" />
    </div>
  );
}
