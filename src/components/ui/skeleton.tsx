import { cn } from "@/lib/utils";

/**
 * Skeleton — loading placeholder. The base block shimmers softly;
 * SkeletonText / SkeletonCard compose it for common layouts.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-xl bg-line/80 motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  );
}

/** Stacked text lines; the last one is shorter, like real copy. */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2.5", className)} aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3.5", i === lines - 1 ? "w-3/5" : "w-full")}
        />
      ))}
    </div>
  );
}

/** Card-shaped placeholder matching GlassCard proportions. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="در حال بارگذاری"
      className={cn(
        "rounded-3xl border border-line bg-surface/40 p-7",
        className
      )}
    >
      <Skeleton className="mb-5 size-12 rounded-2xl" />
      <Skeleton className="mb-3 h-5 w-1/2" />
      <SkeletonText lines={2} />
    </div>
  );
}

/** Full-width placeholder for large blocks (charts, tables, showcases). */
export function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="در حال بارگذاری"
      className={cn(
        "rounded-3xl border border-line bg-surface/40 p-6",
        className
      )}
    >
      <div className="mb-5 flex items-center gap-3">
        <Skeleton className="size-9 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3 w-1/5" />
        </div>
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>
      <Skeleton className="h-40 w-full rounded-2xl" />
    </div>
  );
}
