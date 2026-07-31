"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  CheckCircle2,
  Link2,
  Loader2,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { fa } from "@/lib/utils";

type AdminRow = {
  id: string;
  admin_telegram_id: number;
  admin_display_name: string | null;
  admin_username: string | null;
  admin_linked_at: string | null;
};

export const InboxSetupSection = ({
  botId,
  botUsername,
  ownerTelegramId,
}: {
  botId: string | null;
  botUsername: string | null;
  ownerTelegramId: number | null;
}) => {
  const { toast } = useToast();
  const [link, setLink] = React.useState<string | null>(null);
  const [linkLoading, setLinkLoading] = React.useState(false);
  const linked = ownerTelegramId != null;
  const [admins, setAdmins] = React.useState<AdminRow[]>([]);
  const [adminsLoading, setAdminsLoading] = React.useState(false);
  const [newAdminId, setNewAdminId] = React.useState("");
  const [newAdminName, setNewAdminName] = React.useState("");
  const [addingAdmin, setAddingAdmin] = React.useState(false);
  const [adminLink, setAdminLink] = React.useState<string | null>(null);
  const [adminLinkLoading, setAdminLinkLoading] = React.useState(false);

  const loadAdmins = React.useCallback(async () => {
    if (!botId) return;
    setAdminsLoading(true);
    try {
      const res = await fetch(`/api/telegram/admins?botId=${encodeURIComponent(botId)}`);
      const data = (await res.json()) as { admins?: AdminRow[] };
      if (res.ok && data.admins) setAdmins(data.admins);
    } catch {
      // soft-fail
    } finally {
      setAdminsLoading(false);
    }
  }, [botId]);

  React.useEffect(() => {
    void loadAdmins();
  }, [loadAdmins]);

  const generateLink = async () => {
    if (!botId || linkLoading) return;
    setLinkLoading(true);
    try {
      const res = await fetch("/api/telegram/owner-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId }),
      });
      const data = (await res.json()) as { link?: string; error?: string };
      if (!res.ok || !data.link) {
        throw new Error(data.error || "ساخت لینک ناموفق بود.");
      }
      setLink(data.link);
    } catch (error) {
      toast({
        title: "ساخت لینک ناموفق بود",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setLinkLoading(false);
    }
  };

  const addAdmin = async () => {
    if (!botId || addingAdmin) return;
    const id = Number(newAdminId.trim());
    if (!Number.isFinite(id) || id <= 0) {
      toast({ title: "شناسه تلگرام معتبر نیست", variant: "error" });
      return;
    }
    setAddingAdmin(true);
    try {
      const res = await fetch("/api/telegram/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          connectionId: botId,
          adminTelegramId: id,
          adminDisplayName: newAdminName.trim() || null,
        }),
      });
      const data = (await res.json()) as { admin?: AdminRow; error?: string };
      if (!res.ok || !data.admin) {
        throw new Error(data.error || "افزودن ناموفق بود.");
      }
      setAdmins((prev) => [...prev, data.admin!]);
      setNewAdminId("");
      setNewAdminName("");
      toast({ title: "ادمین اضافه شد", variant: "success" });
    } catch (error) {
      toast({
        title: "افزودن ناموفق بود",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setAddingAdmin(false);
    }
  };

  const removeAdmin = async (id: string) => {
    try {
      const res = await fetch("/api/telegram/admins", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
      setAdmins((prev) => prev.filter((a) => a.id !== id));
      toast({ title: "ادمین حذف شد", variant: "success" });
    } catch {
      toast({ title: "حذف ناموفق بود", variant: "error" });
    }
  };

  const generateAdminLink = async () => {
    if (!botId || adminLinkLoading) return;
    setAdminLinkLoading(true);
    try {
      const res = await fetch("/api/telegram/admin-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botId }),
      });
      const data = (await res.json()) as { link?: string; error?: string };
      if (!res.ok || !data.link) {
        throw new Error(data.error || "ساخت لینک ناموفق بود.");
      }
      setAdminLink(data.link);
    } catch (error) {
      toast({
        title: "ساخت لینک ناموفق بود",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setAdminLinkLoading(false);
    }
  };

  return (
    <section
      aria-labelledby="inbox-setup-title"
      className="rounded-3xl border border-line bg-surface/25 p-5 sm:p-6"
    >
      <div className="flex items-start gap-4">
        <Icon icon={Link2} tile size="sm" tone="muted" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="inbox-setup-title" className="font-bold">
              دریافت پیام‌ها در تلگرام
            </h2>
            {linked ? (
              <Badge variant="success" dot>
                متصل
              </Badge>
            ) : (
              <Badge variant="muted" dot>
                غیرفعال
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm leading-6 text-muted">
            وقتی هوش مصنوعی پاسخی نداشته باشد و مشتری تأیید کند، پیام به شما
            و ادمین‌های شما در تلگرام ارسال می‌شود؛ با دکمه «پاسخ» مستقیماً
            جواب بدهید.
          </p>
        </div>
      </div>

      {/* Owner linking */}
      <div className="mt-4 rounded-2xl border border-line bg-background/40 p-4">
        {linked ? (
          <div className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="size-4" />
            <span>
              تلگرام شما متصل است
              {botUsername && (
                <a
                  href={`https://t.me/${botUsername}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ms-1 text-accent hover:underline"
                >
                  @{botUsername}
                </a>
              )}
            </span>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted">
              روی دکمه بزنید تا لینک اتصال ساخته شود؛ سپس آن را در تلگرام باز
              کنید تا ربات شما را به‌عنوان دریافت‌کننده پیام‌های پشتیبانی بشناسد.
            </p>
            <Button onClick={generateLink} loading={linkLoading} size="md">
              <Link2 className="size-4" />
              ساخت لینک اتصال
            </Button>
          </div>
        )}
        <AnimatePresence>
          {link && !linked && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-3 rounded-xl border border-accent/30 bg-accent/10 p-3"
            >
              <p className="text-xs text-muted">
                این لینک را در تلگرام باز کنید (دقیقاً از همان حسابی که ربات را
                ساخته‌اید):
              </p>
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block break-all text-sm font-bold text-accent hover:underline"
              >
                {link}
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Admins */}
      <div className="mt-3 rounded-2xl border border-line bg-background/40 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Users className="size-4 text-accent" />
          <h3 className="text-sm font-bold">ادمین‌های دیگر</h3>
          {adminsLoading && <Loader2 className="size-3.5 animate-spin text-muted" />}
        </div>
        <p className="mb-3 text-xs text-muted">
          همکارانتان را دوشادوست کنید: یک «لینک دعوت» بسازید و برایشان بفرستید.
          با زدن لینک در تلگرام، خودکار به‌عنوان ادمین اضافه می‌شوند و پیام‌های
          پشتیبانی را دریافت می‌کنند. برای افزودن دستی، شناسه عددی تلگرام را
          وارد کنید.
        </p>

        {/* Invite via magic link */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={generateAdminLink}
            loading={adminLinkLoading}
            size="md"
            variant="secondary"
          >
            <Link2 className="size-4" />
            ساخت لینک دعوت ادمین
          </Button>
        </div>
        <AnimatePresence>
          {adminLink && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mt-3 rounded-xl border border-accent/30 bg-accent/10 p-3"
            >
              <p className="text-xs text-muted">
                این لینک را برای همکارتان بفرستید. با باز کردن آن در تلگرام،
                خودکار به‌عنوان ادمین اضافه می‌شود:
              </p>
              <a
                href={adminLink}
                target="_blank"
                rel="noreferrer"
                className="mt-1 block break-all text-sm font-bold text-accent hover:underline"
              >
                {adminLink}
              </a>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Manual add by numeric id */}
        <div className="mt-4 border-t border-line pt-4">
          <p className="mb-2 text-xs text-muted">افزودن دستی با شناسه عددی:</p>
          <div className="flex flex-wrap items-end gap-2">
            <Input
              value={newAdminId}
              onChange={(e) => setNewAdminId(e.target.value)}
              placeholder="شناسه عددی (مثال: ۱۲۳۴۵۶۷۸۹)"
              disabled={addingAdmin}
              className="flex-1"
            />
            <Input
              value={newAdminName}
              onChange={(e) => setNewAdminName(e.target.value)}
              placeholder="نام (اختیاری)"
              disabled={addingAdmin}
              className="flex-1"
            />
            <Button onClick={addAdmin} loading={addingAdmin} size="md">
              <Plus className="size-4" />
              افزودن
            </Button>
          </div>
        </div>

        {admins.length > 0 && (
          <ul className="mt-3 space-y-1.5">
            {admins.map((admin) => {
              const isAdminLinked = admin.admin_linked_at != null;
              return (
                <li
                  key={admin.id}
                  className="flex items-center justify-between rounded-xl border border-line bg-surface/40 p-2 text-sm"
                >
                  <div className="min-w-0">
                    {admin.admin_username ? (
                      <span dir="ltr" className="block truncate font-bold">
                        @{admin.admin_username}
                      </span>
                    ) : (
                      <span className="font-bold">
                        {fa(admin.admin_telegram_id)}
                      </span>
                    )}
                    {admin.admin_display_name && (
                      <span className="ms-2 text-muted">
                        {admin.admin_display_name}
                      </span>
                    )}
                    {isAdminLinked ? (
                      <Badge variant="success" dot className="ms-2 text-[10px]">
                        متصل
                      </Badge>
                    ) : (
                      <Badge variant="warning" dot className="ms-2 text-[10px]">
                        در انتظار اتصال
                      </Badge>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAdmin(admin.id)}
                    aria-label="حذف ادمین"
                    className="rounded-lg p-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Link to the website inbox */}
      <div className="mt-3">
        <Link
          href="/dashboard/inbox"
          className="group flex items-center gap-2 text-sm text-accent hover:underline"
        >
          صندوق پیام‌ها در وب‌سایت
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
        </Link>
      </div>
    </section>
  );
};
