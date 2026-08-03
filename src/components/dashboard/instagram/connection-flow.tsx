"use client";

import * as React from "react";
import { CheckCircle2, LogOut, ShieldCheck } from "lucide-react";
import { TbBrandInstagram } from "react-icons/tb";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { notifyChannelConnectionChanged } from "@/lib/settings-events";
import type { InstagramReturnTarget } from "@/lib/instagram/return-target";

// The Instagram counterpart of components/dashboard/bot/connection-flow. Both
// the settings modal and the Instagram page render this one component, so the
// connect and disconnect experience cannot drift between them.
//
// Unlike Telegram there is no token to paste: the whole exchange happens on
// Instagram's own consent screen, so this is a single link out and a state
// readback when the browser returns.

export type InstagramAccount = {
  id: string;
  username: string;
  name: string;
  accountType: string;
  status: string;
};

export const InstagramConnectionFlow = ({
  returnTo,
}: {
  returnTo: InstagramReturnTarget;
}) => {
  const { toast } = useToast();
  const [account, setAccount] = React.useState<InstagramAccount | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [disconnecting, setDisconnecting] = React.useState(false);

  React.useEffect(() => {
    const loadAccount = async () => {
      try {
        const response = await fetch("/api/instagram/status");
        if (!response.ok) return;
        const data = (await response.json()) as {
          account: InstagramAccount | null;
        };
        setAccount(data.account);
      } catch {
        // Leaves the empty state in place; the connect button still works.
      } finally {
        setLoading(false);
      }
    };

    void loadAccount();
  }, []);

  const disconnectAccount = async () => {
    if (disconnecting) return;
    setDisconnecting(true);

    try {
      const response = await fetch("/api/instagram/disconnect", {
        method: "POST",
      });

      if (!response.ok) {
        toast({
          title: "قطع اتصال انجام نشد",
          description: "دوباره تلاش کنید.",
          variant: "error",
        });
        return;
      }

      setAccount(null);
      notifyChannelConnectionChanged();
      toast({
        title: "اینستاگرام قطع شد",
        description: "حساب اینستاگرام شما از پشتیبان جدا شد.",
        variant: "success",
      });
    } catch {
      toast({
        title: "قطع اتصال انجام نشد",
        description: "اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.",
        variant: "error",
      });
    } finally {
      setDisconnecting(false);
    }
  };

  if (loading) {
    return (
      <div role="status" aria-label="در حال بارگذاری" className="space-y-4">
        <div className="flex items-center gap-4 rounded-3xl border border-line bg-surface/40 p-5">
          <Skeleton className="size-10 rounded-2xl" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3.5 w-1/3" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </div>
    );
  }

  if (account) {
    const expired = account.status === "error";

    return (
      <div className="space-y-5">
        <div
          className={
            expired
              ? "flex items-center gap-4 rounded-3xl border border-warning/25 bg-warning/10 p-5"
              : "flex items-center gap-4 rounded-3xl border border-success/25 bg-success/10 p-5"
          }
        >
          <Icon
            icon={expired ? TbBrandInstagram : CheckCircle2}
            tile
            size="md"
            tone={expired ? "warning" : "success"}
          />
          <div className="min-w-0">
            <p className="font-bold">{account.name}</p>
            <p dir="ltr" className="mt-1 truncate text-start text-sm text-muted">
              @{account.username}
            </p>
          </div>
          <Badge
            variant={expired ? "warning" : "success"}
            dot
            className="ms-auto shrink-0"
          >
            {expired ? "نیاز به اتصال دوباره" : "متصل است"}
          </Badge>
        </div>

        {expired && (
          <Alert
            variant="warning"
            title="دسترسی اینستاگرام منقضی شده است"
            description="اینستاگرام دسترسی را هر ۶۰ روز تازه می‌کند. یک‌بار دیگر وصل شوید تا پاسخ‌گویی ادامه پیدا کند."
          >
            <a
              href={`/api/instagram/connect?return=${returnTo}`}
              className={buttonVariants({
                variant: "outline",
                size: "sm",
                className: "mt-3",
              })}
            >
              <TbBrandInstagram className="size-4" aria-hidden />
              اتصال دوباره
            </a>
          </Alert>
        )}

        <Button
          variant="outline"
          className="w-full"
          loading={disconnecting}
          startIcon={<LogOut className="size-4" />}
          onClick={() => void disconnectAccount()}
        >
          قطع اتصال اینستاگرام
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm leading-7 text-muted">
        با اتصال اینستاگرام، دایرکت‌های مشتری‌ها به پشتیبان می‌رسد و همان‌جا پاسخ
        داده می‌شود. ورود در صفحهٔ خود اینستاگرام انجام می‌شود و رمز شما هیچ‌وقت
        به پشتیبان داده نمی‌شود.
      </p>

      <div className="flex gap-3 rounded-2xl border border-line bg-background/35 p-4">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
        <div>
          <p className="text-sm font-bold">قبل از شروع</p>
          <p className="mt-1 text-xs leading-6 text-muted">
            حساب اینستاگرام‌تان باید حرفه‌ای و از نوع «تجاری» باشد. در اپ
            اینستاگرام از تنظیمات ‹ نوع حساب و ابزارها این تغییر انجام می‌شود.
          </p>
        </div>
      </div>

      <a
        href={`/api/instagram/connect?return=${returnTo}`}
        className={buttonVariants({ size: "lg", className: "w-full" })}
      >
        <TbBrandInstagram className="size-4" aria-hidden />
        اتصال حساب اینستاگرام
      </a>
    </div>
  );
};
