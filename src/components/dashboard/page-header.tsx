import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Icon, type AppIcon } from "@/components/ui/icon";
import { fa } from "@/lib/utils";

// Shared heading for a dashboard page. Sections that own several routes render
// this once in their layout, above <PageTabs> — which is why there is no back
// link here: the tab strip is the way back up.

type DashboardPageHeaderProps = {
  title: string;
  description: string;
  icon: AppIcon;
  count?: number;
  loading?: boolean;
  action?: React.ReactNode;
  className?: string;
};

export const DashboardPageHeader = ({
  title,
  description,
  icon,
  count,
  loading = false,
  action,
}: DashboardPageHeaderProps) => (
  <header className="mb-8">
    <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-4">
        <Icon icon={icon} tile size="md" tone="accent" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-black">{title}</h1>
            {loading ? (
              <Loader2 className="size-4 animate-spin text-muted" />
            ) : (
              count !== undefined && (
                <Badge variant="muted" className="text-[10px]">
                  {fa(count)}
                </Badge>
              )
            )}
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
            {description}
          </p>
        </div>
      </div>
      {action && <div className="w-full shrink-0 sm:w-auto">{action}</div>}
    </div>
  </header>
);
