import { cn } from "@/lib/utils";

const SIZES = {
  sm: "size-3.5 border-[1.5px]",
  md: "size-4 border-2",
  lg: "size-6 border-2",
} as const;

export function Spinner({
  size = "md",
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label="در حال بارگذاری"
      className={cn(
        "inline-block animate-spin rounded-full border-current border-t-transparent motion-reduce:animate-none",
        SIZES[size],
        className
      )}
    />
  );
}
