"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, RefreshCw, Workflow } from "lucide-react";
import { FlowBuilder } from "@/components/dashboard/flow-builder";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { loadFlowDetail } from "@/store/slices/flows-slice";

const FlowBuilderSkeleton = () => (
  <div
    role="status"
    aria-label="در حال بارگذاری فلو"
    className="mx-auto max-w-[96rem]"
  >
    <Skeleton className="h-5 w-28" />
    <div className="mt-5 flex items-center gap-3">
      <Skeleton className="size-10 rounded-2xl" />
      <div className="space-y-2">
        <Skeleton className="h-6 w-44" />
        <Skeleton className="h-4 w-28" />
      </div>
    </div>
    <div className="mt-6 grid min-h-[44rem] overflow-hidden rounded-3xl border border-line bg-surface/25 lg:grid-cols-[minmax(0,1fr)_23rem]">
      <div className="relative min-h-[60dvh] p-8 lg:min-h-[44rem]">
        <div className="grid gap-8 pt-20 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div
              key={item}
              className="rounded-3xl border border-line bg-card p-4"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-2xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-28" />
                </div>
              </div>
              <SkeletonText className="mt-5" lines={3} />
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-line p-5 lg:border-s lg:border-t-0">
        <SkeletonText lines={8} />
      </div>
    </div>
  </div>
);

export const FlowDetailPage = ({ flowId }: { flowId: string }) => {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { detail, detailError, detailStatus } = useAppSelector(
    (state) => state.flows
  );

  React.useEffect(() => {
    void dispatch(loadFlowDetail(flowId));
  }, [dispatch, flowId]);

  const loading =
    detailStatus === "idle" ||
    detailStatus === "loading" ||
    (detailStatus === "succeeded" && detail?.id !== flowId);

  if (loading) return <FlowBuilderSkeleton />;

  if (detailStatus === "failed" || !detail) {
    return (
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={() => router.push("/dashboard/flow")}
          className="mb-5 flex items-center gap-2 rounded-full text-sm text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <ArrowRight className="size-4" aria-hidden />
          بازگشت به فلوها
        </button>
        <Alert
          variant="error"
          title="فلو بارگذاری نشد"
          description={
            detailError ??
            "ممکن است این فلو حذف شده باشد. فهرست فلوها را بررسی کنید یا دوباره تلاش کنید."
          }
        >
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              startIcon={<RefreshCw className="size-4" />}
              onClick={() => void dispatch(loadFlowDetail(flowId))}
            >
              تلاش دوباره
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              startIcon={<Workflow className="size-4" />}
              onClick={() => router.push("/dashboard/flow")}
            >
              مشاهده فلوها
            </Button>
          </div>
        </Alert>
      </div>
    );
  }

  return <FlowBuilder flow={detail} />;
};
