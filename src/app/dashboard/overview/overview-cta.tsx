"use client";

import { Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** Empty-state invitation — knowledge-base ingestion ships in the next phase. */
export function OverviewCta() {
  const { toast } = useToast();
  return (
    <section className="mt-8 rounded-3xl border border-dashed border-line bg-surface/30 px-6 py-14 text-center">
      <span className="mx-auto mb-5 flex size-12 items-center justify-center rounded-2xl bg-accent/12 text-accent">
        <Sparkles className="size-6" aria-hidden />
      </span>
      <h2 className="text-lg font-bold">دستیار شما آماده یادگیری است</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted">
        اولین منبع دانش را متصل کنید — سند، متن یا آدرس سایت — تا پشتیبان از
        همان لحظه پاسخ‌گویی را شروع کند.
      </p>
      <Button
        className="mt-7"
        startIcon={<Plus className="size-4" />}
        onClick={() =>
          toast({
            title: "به‌زودی",
            description: "اتصال منبع دانش در قدم بعدی محصول اضافه می‌شود.",
          })
        }
      >
        افزودن منبع دانش
      </Button>
    </section>
  );
}
