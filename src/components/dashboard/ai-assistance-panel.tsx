"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bot,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  BookOpen,
  HelpCircle,
  Link2,
  CheckCircle2,
  Users,
  ArrowLeft,
  ArrowRight,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { luxe } from "@/components/motion/reveal";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Modal,
  ModalContent,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from "@/components/ui/modal";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, type SelectOption } from "@/components/ui/select";
import { Switch } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { cn, fa } from "@/lib/utils";

// ---- Types ----------------------------------------------------------------

type AiAssistancePanelProps = {
  initialEnabled: boolean;
  initialHumanHandoff: boolean;
  loadError: boolean;
  providerConfigured: boolean;
  setupRequired: boolean;
  botId?: string | null;
  botUsername?: string | null;
  ownerTelegramId?: number | null;
};

type Fact = {
  id: string;
  category: string;
  factText: string;
};

type Qa = {
  id: string;
  category: string;
  question: string;
  answer: string;
};

type SettingsResponse = {
  enabled?: boolean;
  humanHandoff?: boolean;
  error?: string;
};

const CATEGORY_OPTIONS: SelectOption[] = [
  { value: "general", label: "عمومی" },
  { value: "shipping", label: "ارسال و تحویل" },
  { value: "pricing", label: "قیمت و تخفیف" },
  { value: "products", label: "محصولات" },
  { value: "returns", label: "بازگشت و تعویض" },
  { value: "account", label: "حساب کاربری" },
];

const categoryLabel = (value: string): string =>
  CATEGORY_OPTIONS.find((opt) => opt.value === value)?.label ?? value;

// ---- Main panel (overview: toggle + links to knowledge pages) -------------

export const AiAssistancePanel = ({
  initialEnabled,
  initialHumanHandoff,
  loadError,
  providerConfigured,
  setupRequired,
  botId = null,
  botUsername = null,
  ownerTelegramId = null,
}: AiAssistancePanelProps) => {
  const reduce = useReducedMotion() ?? false;
  const { toast } = useToast();
  const [enabled, setEnabled] = React.useState(initialEnabled);
  const [saving, setSaving] = React.useState(false);
  const [humanHandoff, setHumanHandoff] = React.useState(initialHumanHandoff);
  const [savingHandoff, setSavingHandoff] = React.useState(false);

  // The assistant on/off toggle also needs a configured provider; the handoff
  // toggle only routes to humans, so it needs neither a provider nor anything
  // beyond the settings table being reachable.
  const unavailable = setupRequired || loadError || !providerConfigured;
  const handoffUnavailable = setupRequired || loadError;

  const updateEnabled = async (nextEnabled: boolean) => {
    const previousEnabled = enabled;
    setEnabled(nextEnabled);
    setSaving(true);

    try {
      const response = await fetch("/api/ai/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      const result = (await response.json().catch(() => ({}))) as SettingsResponse;

      if (!response.ok || typeof result.enabled !== "boolean") {
        throw new Error(
          result.error || "وضعیت دستیار ذخیره نشد؛ دوباره تلاش کنید."
        );
      }

      setEnabled(result.enabled);
      toast({
        title: result.enabled
          ? "دستیار هوش مصنوعی روشن شد"
          : "دستیار هوش مصنوعی خاموش شد",
        description: result.enabled
          ? "پرسش‌های بدون پاسخ آماده به دستیار سپرده می‌شوند."
          : "دیگر هیچ پیام عادی به هوش مصنوعی فرستاده نمی‌شود.",
        variant: "success",
      });
    } catch (error) {
      setEnabled(previousEnabled);
      toast({
        title: "تغییر وضعیت ذخیره نشد",
        description: error instanceof Error ? error.message : "دوباره تلاش کنید.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const updateHandoff = async (nextHandoff: boolean) => {
    const previous = humanHandoff;
    setHumanHandoff(nextHandoff);
    setSavingHandoff(true);

    try {
      const response = await fetch("/api/ai/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ humanHandoff: nextHandoff }),
      });
      const result = (await response.json().catch(() => ({}))) as SettingsResponse;

      if (!response.ok || typeof result.humanHandoff !== "boolean") {
        throw new Error(
          result.error || "تنظیم ارجاع ذخیره نشد؛ دوباره تلاش کنید."
        );
      }

      setHumanHandoff(result.humanHandoff);
      toast({
        title: result.humanHandoff
          ? "ارجاع به پشتیبان روشن شد"
          : "ارجاع به پشتیبان خاموش شد",
        description: result.humanHandoff
          ? "پرسش‌های بی‌پاسخ و درخواست‌های مستقیم مشتری به شما و ادمین‌ها می‌رسد."
          : "دیگر هیچ پیامی به پشتیبان انسانی ارجاع نمی‌شود.",
        variant: "success",
      });
    } catch (error) {
      setHumanHandoff(previous);
      toast({
        title: "تغییر تنظیم ذخیره نشد",
        description: error instanceof Error ? error.message : "دوباره تلاش کنید.",
        variant: "error",
      });
    } finally {
      setSavingHandoff(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-8">
        <h1 className="text-2xl font-black">دستیار هوش مصنوعی</h1>
        <p className="mt-2 text-sm leading-7 text-muted">
          پاسخ‌گویی هوشمند ربات تلگرام را از اینجا کنترل کنید.
        </p>
      </header>

      <div className="space-y-4">
        {setupRequired && (
          <Alert
            variant="warning"
            title="راه‌اندازی پایگاه داده کامل نشده است"
            description="اسکریپت تنظیمات دستیار را اجرا کنید تا کلیدها فعال شوند."
          />
        )}
        {!setupRequired && loadError && (
          <Alert
            variant="error"
            title="وضعیت دستیار بارگذاری نشد"
            description="صفحه را تازه کنید و دوباره تلاش کنید."
          />
        )}
        {!providerConfigured && (
          <Alert
            variant="warning"
            title="ارائه‌دهنده هوش مصنوعی تنظیم نشده است"
            description="برای روشن کردن دستیار، کلید NVIDIA NIM یا OpenAI را در سرور تنظیم کنید."
          />
        )}

        {/* AI on/off */}
        <ToggleCard
          icon={Bot}
          title="پاسخ‌گویی هوشمند"
          description="وقتی روشن باشد، پیام‌های عادی که با فلو یا کلیدواژه فعال تطبیق ندارند به دستیار فرستاده می‌شوند. فرمان‌های تلگرام هرگز به هوش مصنوعی فرستاده نمی‌شوند."
          badgeOn="روشن"
          badgeOff="خاموش"
          ariaLabel="روشن کردن دستیار هوش مصنوعی"
          enabled={enabled}
          saving={saving}
          disabled={saving || unavailable}
          reduce={reduce}
          onToggle={updateEnabled}
        />
      </div>

      {/* Everything below the master toggle appears only when the assistant
          is on. */}
      <AnimatePresence initial={false}>
        {enabled && (
          <motion.div
            key="assistant-body"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
            transition={{ duration: reduce ? 0 : 0.3, ease: luxe }}
            className="mt-4 space-y-4"
          >
            {/* Human handoff on/off */}
            <ToggleCard
              icon={Users}
              title="ارجاع به پشتیبان انسانی"
              description="وقتی روشن باشد، دستیار می‌تواند پرسش‌هایی را که پاسخشان را نمی‌داند — و درخواست‌های مستقیم مشتری برای گفتگو با انسان — پس از تأیید مشتری به شما و ادمین‌ها بفرستد. وقتی خاموش باشد، هیچ پیامی ارجاع نمی‌شود."
              badgeOn="روشن"
              badgeOff="خاموش"
              ariaLabel="روشن کردن ارجاع به پشتیبان انسانی"
              enabled={humanHandoff}
              saving={savingHandoff}
              disabled={savingHandoff || handoffUnavailable}
              reduce={reduce}
              onToggle={updateHandoff}
            />

            {/* Admin/recipient setup — only meaningful when handoff is on. */}
            <AnimatePresence initial={false}>
              {humanHandoff && (
                <motion.div
                  key="inbox-setup"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
                  transition={{ duration: reduce ? 0 : 0.3, ease: luxe }}
                >
                  <InboxSetupSection
                    botId={botId}
                    botUsername={botUsername}
                    ownerTelegramId={ownerTelegramId}
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Persona — how the assistant introduces itself and sounds */}
            <KnowledgeLinkCard
              href="/dashboard/ai-assistance/persona"
              icon={Wand2}
              title="شخصیت و لحن دستیار"
              description="کسب‌وکارتان را معرفی کنید و لحن پاسخ‌ها را تنظیم کنید؛ صمیمیت، شور، تیتر و فهرست و ایموجی."
            />

            {/* Knowledge navigation cards */}
            <div className="grid gap-3 sm:grid-cols-2">
              <KnowledgeLinkCard
                href="/dashboard/ai-assistance/facts"
                icon={BookOpen}
                title="اطلاعات کسب‌وکار"
                description="هر چیزی که می‌خواهید هوش مصنوعی همیشه بداند؛ همیشه در دستیار تزریق می‌شود."
              />
              <KnowledgeLinkCard
                href="/dashboard/ai-assistance/qa"
                icon={HelpCircle}
                title="پرسش و پاسخ آماده"
                description="پرسش‌های متداول و پاسخ دقیق آن‌ها؛ هوش مصنوعی این زوج‌ها را اولویت بالاتری می‌دهد."
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const KnowledgeLinkCard = ({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
}) => (
  <Link
    href={href}
    className="group flex items-start gap-4 rounded-3xl border border-line bg-surface/25 p-5 transition-colors duration-300 hover:border-accent/30 hover:bg-surface/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 sm:p-6"
  >
    <Icon icon={icon} tile size="sm" tone="muted" className="shrink-0" />
    <div className="min-w-0 flex-1">
      <h3 className="font-bold">{title}</h3>
      <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
    </div>
    <ArrowLeft className="size-4 shrink-0 text-muted transition-transform duration-300 group-hover:-translate-x-1 group-hover:text-accent" aria-hidden />
  </Link>
);

// ---- Inbox setup section ---------------------------------------------------

type AdminRow = {
  id: string;
  admin_telegram_id: number;
  admin_display_name: string | null;
  admin_username: string | null;
  admin_linked_at: string | null;
};

const InboxSetupSection = ({
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

// ---- Reusable setting toggle card -----------------------------------------

type ToggleCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  badgeOn: string;
  badgeOff: string;
  ariaLabel: string;
  enabled: boolean;
  saving: boolean;
  disabled: boolean;
  reduce: boolean;
  onToggle: (next: boolean) => void;
};

const ToggleCard = ({
  icon,
  title,
  description,
  badgeOn,
  badgeOff,
  ariaLabel,
  enabled,
  saving,
  disabled,
  reduce,
  onToggle,
}: ToggleCardProps) => {
  const titleId = React.useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn(
        "relative overflow-hidden rounded-3xl border bg-surface/40 p-5 transition-colors duration-300 sm:p-6",
        enabled ? "border-accent/30" : "border-line"
      )}
    >
      <motion.span
        aria-hidden
        className="absolute inset-y-0 start-0 w-1 bg-accent"
        initial={false}
        animate={{ opacity: enabled ? 1 : 0 }}
        transition={{ duration: reduce ? 0 : 0.25, ease: luxe }}
      />
      <div className="flex items-start gap-4">
        <Icon
          icon={icon}
          tile
          size="md"
          tone={enabled ? "accent" : "muted"}
          className="shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={titleId} className="font-bold">
              {title}
            </h2>
            <Badge variant={enabled ? "success" : "muted"} dot>
              {enabled ? badgeOn : badgeOff}
            </Badge>
          </div>
          <p className="mt-2 max-w-xl text-sm leading-7 text-muted">
            {description}
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-busy={saving}
          onChange={(event) => void onToggle(event.target.checked)}
        />
      </div>
    </section>
  );
};

// ---- Shared page header for knowledge sub-pages ---------------------------

type KnowledgePageHeaderProps = {
  title: string;
  description: string;
  icon: LucideIcon;
  count?: number;
  loading?: boolean;
  action?: React.ReactNode;
};

export const KnowledgePageHeader = ({
  title,
  description,
  icon,
  count,
  loading = false,
  action,
}: KnowledgePageHeaderProps) => (
  <header className="mb-8">
    <Link
      href="/dashboard/ai-assistance"
      className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted transition-colors duration-300 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-full"
    >
      <ArrowRight className="size-4" aria-hidden />
      بازگشت به دستیار
    </Link>
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

// ---- Facts editor ----------------------------------------------------------

type FactEditorModalProps = {
  fact: Fact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: { factText: string; category: string }) => Promise<boolean>;
};

const FactEditorModal = ({
  fact,
  open,
  onOpenChange,
  onSave,
}: FactEditorModalProps) => {
  const [factText, setFactText] = React.useState("");
  const [category, setCategory] = React.useState("general");
  const [factTextError, setFactTextError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const editing = Boolean(fact);

  React.useEffect(() => {
    if (!open) return;
    setFactText(fact?.factText ?? "");
    setCategory(fact?.category ?? "general");
    setFactTextError("");
  }, [fact, open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleaned = factText.trim();
    if (!cleaned) {
      setFactTextError("متن اطلاعات را بنویسید.");
      return;
    }
    setSaving(true);
    const saved = await onSave({ factText: cleaned, category });
    setSaving(false);
    if (saved) onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
    >
      <ModalContent
        size="md"
        closeDisabled={saving}
        className="flex max-h-[calc(100dvh-2.5rem)] flex-col overflow-hidden p-0"
      >
        <ModalHeader className="mb-0 shrink-0 px-5 pb-4 pt-5 sm:px-7 sm:pb-5 sm:pt-7">
          <ModalTitle>
            {editing ? "ویرایش اطلاعات کسب‌وکار" : "اطلاعات جدید"}
          </ModalTitle>
          <ModalDescription>
            هر چیزی را که می‌خواهید هوش مصنوعی همیشه بداند اینجا بنویسید.
          </ModalDescription>
        </ModalHeader>
        <form
          onSubmit={submit}
          noValidate
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-6 pt-1 sm:px-7">
            <Textarea
              id="fact-text"
              dir="rtl"
              label="متن اطلاعات"
              hint="ساعت کاری، آدرس، حساب بانکی، سیاست ارسال و…"
              placeholder="مثال: ساعت کاری ما ۹ تا ۲۱ است."
              value={factText}
              onChange={(event) => {
                setFactText(event.target.value);
                if (factTextError) setFactTextError("");
              }}
              error={factTextError}
              rows={5}
              disabled={saving}
              required
            />
            <Select
              id="fact-category"
              label="دسته"
              options={CATEGORY_OPTIONS}
              value={category}
              onChange={(value) => setCategory(value ?? "general")}
              disabled={saving}
            />
          </div>
          <ModalFooter className="mt-0 shrink-0 flex-col-reverse border-t border-line px-5 py-4 sm:flex-row sm:px-7 sm:py-5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="w-full sm:w-auto"
            >
              انصراف
            </Button>
            <Button
              type="submit"
              loading={saving}
              className="w-full sm:w-auto"
            >
              {editing ? "ذخیره تغییرات" : "افزودن اطلاعات"}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

const DeleteFactModal = ({
  fact,
  deleting,
  onConfirm,
  onOpenChange,
}: {
  fact: Fact | null;
  deleting: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) => (
  <Modal
    open={Boolean(fact)}
    onOpenChange={(open) => {
      if (!deleting) onOpenChange(open);
    }}
  >
    <ModalContent size="sm" closeDisabled={deleting}>
      <ModalHeader>
        <ModalTitle>حذف اطلاعات؟</ModalTitle>
        <ModalDescription>این اطلاعات از پایگاه دانش حذف می‌شود.</ModalDescription>
      </ModalHeader>
      <ModalFooter>
        <Button
          type="button"
          variant="ghost"
          onClick={() => onOpenChange(false)}
          disabled={deleting}
        >
          انصراف
        </Button>
        <Button
          type="button"
          variant="danger"
          loading={deleting}
          onClick={onConfirm}
        >
          حذف
        </Button>
      </ModalFooter>
    </ModalContent>
  </Modal>
);

const FactRow = ({
  fact,
  busy,
  onEdit,
  onDelete,
}: {
  fact: Fact;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const reduce = useReducedMotion();
  return (
    <motion.li
      layout={!reduce}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
      transition={{ duration: reduce ? 0 : 0.3, ease: luxe }}
      className="flex items-start gap-3 rounded-2xl border border-line bg-surface/40 p-3"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-6">{fact.factText}</p>
        <Badge variant="muted" className="mt-1.5 text-[10px]">
          {categoryLabel(fact.category)}
        </Badge>
      </div>
      <div className="flex shrink-0 gap-1">
        <Tooltip content="ویرایش" side="top">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onEdit}
            disabled={busy}
            aria-label="ویرایش اطلاعات"
          >
            <Pencil className="size-4" aria-hidden />
          </Button>
        </Tooltip>
        <Tooltip content="حذف" side="top">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDelete}
            disabled={busy}
            className="hover:text-danger"
            aria-label="حذف اطلاعات"
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </Tooltip>
      </div>
    </motion.li>
  );
};

export const FactsEditor = () => {
  const { toast } = useToast();
  const [facts, setFacts] = React.useState<Fact[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingFact, setEditingFact] = React.useState<Fact | null>(null);
  const [deletingFact, setDeletingFact] = React.useState<Fact | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const loadFacts = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/knowledge/facts");
      const data = (await res.json()) as { facts?: Fact[]; error?: string };
      if (res.ok && data.facts) setFacts(data.facts);
    } catch {
      // soft-fail
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadFacts();
  }, [loadFacts]);

  const openCreate = () => {
    setEditingFact(null);
    setEditorOpen(true);
  };

  const openEdit = (fact: Fact) => {
    setEditingFact(fact);
    setEditorOpen(true);
  };

  const saveFact = async (draft: {
    factText: string;
    category: string;
  }): Promise<boolean> => {
    try {
      const res = await fetch("/api/ai/knowledge/facts", {
        method: editingFact ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingFact ? { id: editingFact.id, ...draft } : draft
        ),
      });
      const data = (await res.json()) as { fact?: Fact; error?: string };
      if (!res.ok || !data.fact) {
        throw new Error(data.error || "ذخیره ناموفق بود.");
      }
      if (editingFact) {
        setFacts((prev) =>
          prev.map((f) => (f.id === editingFact.id ? data.fact! : f))
        );
      } else {
        setFacts((prev) => [...prev, data.fact!]);
      }
      toast({
        title: editingFact
          ? "اطلاعات به‌روز شد"
          : "اطلاعات افزوده شد",
        variant: "success",
      });
      return true;
    } catch (error) {
      toast({
        title: "ذخیره ناموفق بود",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
      return false;
    }
  };

  const confirmDelete = async () => {
    if (!deletingFact) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/ai/knowledge/facts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deletingFact.id }),
      });
      if (!res.ok) throw new Error();
      setFacts((prev) => prev.filter((f) => f.id !== deletingFact.id));
      setDeletingFact(null);
      toast({ title: "اطلاعات حذف شد", variant: "success" });
    } catch {
      toast({
        title: "حذف ناموفق بود",
        description: "دوباره تلاش کنید.",
        variant: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <KnowledgePageHeader
        title="اطلاعات کسب‌وکار"
        description="هر چیزی که می‌خواهید هوش مصنوعی همیشه بداند؛ این اطلاعات همیشه در دستیار تزریق می‌شوند."
        icon={BookOpen}
        count={facts.length}
        loading={loading}
        action={
          <Button
            type="button"
            startIcon={<Plus className="size-4" />}
            onClick={openCreate}
            className="w-full sm:w-auto"
          >
            اطلاعات جدید
          </Button>
        }
      />

      <div className="space-y-4">
        {loading && (
          <div
            role="status"
            aria-label="در حال بارگذاری اطلاعات"
            className="space-y-2"
          >
            {[0, 1].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-line bg-surface/35 p-3"
              >
                <SkeletonText className="mb-2" lines={2} />
                <Skeleton className="h-4 w-16 rounded-full" />
              </div>
            ))}
          </div>
        )}

        {!loading && facts.length === 0 && (
          <section className="rounded-3xl border border-dashed border-line bg-surface/25 px-6 py-14 text-center">
            <Icon icon={BookOpen} tile size="lg" tone="accent" />
            <h2 className="mt-5 text-lg font-bold">
              اولین اطلاعات کسب‌وکار را اضافه کنید
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-7 text-muted">
              مثلاً ساعت کاری، آدرس یا سیاست ارسال را وارد کنید تا هوش مصنوعی
              همیشه آن را بداند.
            </p>
            <Button
              type="button"
              className="mt-6"
              startIcon={<Plus className="size-4" />}
              onClick={openCreate}
            >
              افزودن اولین اطلاعات
            </Button>
          </section>
        )}

        {!loading && facts.length > 0 && (
          <section aria-labelledby="facts-list-heading">
            <div className="mb-3 flex items-center justify-between gap-4">
              <h2 id="facts-list-heading" className="text-sm font-bold">
                اطلاعات ذخیره‌شده
              </h2>
              <Badge variant="muted">{fa(facts.length)} مورد</Badge>
            </div>
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {facts.map((fact) => (
                  <FactRow
                    key={fact.id}
                    fact={fact}
                    busy={deleting && deletingFact?.id === fact.id}
                    onEdit={() => openEdit(fact)}
                    onDelete={() => setDeletingFact(fact)}
                  />
                ))}
              </AnimatePresence>
            </ul>
          </section>
        )}
      </div>

      <FactEditorModal
        fact={editingFact}
        open={editorOpen}
        onOpenChange={(open) => {
          if (!open) setEditingFact(null);
          setEditorOpen(open);
        }}
        onSave={saveFact}
      />

      <DeleteFactModal
        fact={deletingFact}
        deleting={deleting}
        onConfirm={() => void confirmDelete()}
        onOpenChange={(open) => {
          if (!open) setDeletingFact(null);
        }}
      />
    </>
  );
};

// ---- Q&A editor ------------------------------------------------------------

type QaEditorModalProps = {
  qa: Qa | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: {
    question: string;
    answer: string;
    category: string;
  }) => Promise<boolean>;
};

const QaEditorModal = ({
  qa,
  open,
  onOpenChange,
  onSave,
}: QaEditorModalProps) => {
  const [question, setQuestion] = React.useState("");
  const [answer, setAnswer] = React.useState("");
  const [category, setCategory] = React.useState("general");
  const [questionError, setQuestionError] = React.useState("");
  const [answerError, setAnswerError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const editing = Boolean(qa);

  React.useEffect(() => {
    if (!open) return;
    setQuestion(qa?.question ?? "");
    setAnswer(qa?.answer ?? "");
    setCategory(qa?.category ?? "general");
    setQuestionError("");
    setAnswerError("");
  }, [qa, open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanedQuestion = question.trim();
    const cleanedAnswer = answer.trim();
    let valid = true;
    if (!cleanedQuestion) {
      setQuestionError("پرسش را بنویسید.");
      valid = false;
    }
    if (!cleanedAnswer) {
      setAnswerError("پاسخ را بنویسید.");
      valid = false;
    }
    if (!valid) return;

    setSaving(true);
    const saved = await onSave({
      question: cleanedQuestion,
      answer: cleanedAnswer,
      category,
    });
    setSaving(false);
    if (saved) onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
    >
      <ModalContent
        size="md"
        closeDisabled={saving}
        className="flex max-h-[calc(100dvh-2.5rem)] flex-col overflow-hidden p-0"
      >
        <ModalHeader className="mb-0 shrink-0 px-5 pb-4 pt-5 sm:px-7 sm:pb-5 sm:pt-7">
          <ModalTitle>
            {editing ? "ویرایش پرسش و پاسخ" : "پرسش و پاسخ جدید"}
          </ModalTitle>
          <ModalDescription>
            پرسش‌های متداول و پاسخ دقیق آن‌ها؛ هوش مصنوعی این زوج‌ها را اولویت
            بالاتری می‌دهد.
          </ModalDescription>
        </ModalHeader>
        <form
          onSubmit={submit}
          noValidate
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-6 pt-1 sm:px-7">
            <Input
              id="qa-question"
              dir="rtl"
              label="پرسش"
              placeholder="مثال: هزینه ارسال چقدر است؟"
              value={question}
              onChange={(event) => {
                setQuestion(event.target.value);
                if (questionError) setQuestionError("");
              }}
              error={questionError}
              disabled={saving}
              autoComplete="off"
              required
            />
            <Textarea
              id="qa-answer"
              dir="rtl"
              label="پاسخ"
              hint="پاسخ دقیق و کامل پرسش را بنویسید."
              placeholder="پاسخ دقیق پرسش…"
              value={answer}
              onChange={(event) => {
                setAnswer(event.target.value);
                if (answerError) setAnswerError("");
              }}
              error={answerError}
              rows={5}
              disabled={saving}
              required
            />
            <Select
              id="qa-category"
              label="دسته"
              options={CATEGORY_OPTIONS}
              value={category}
              onChange={(value) => setCategory(value ?? "general")}
              disabled={saving}
            />
          </div>
          <ModalFooter className="mt-0 shrink-0 flex-col-reverse border-t border-line px-5 py-4 sm:flex-row sm:px-7 sm:py-5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
              className="w-full sm:w-auto"
            >
              انصراف
            </Button>
            <Button
              type="submit"
              loading={saving}
              className="w-full sm:w-auto"
            >
              {editing ? "ذخیره تغییرات" : "افزودن پرسش"}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

const DeleteQaModal = ({
  qa,
  deleting,
  onConfirm,
  onOpenChange,
}: {
  qa: Qa | null;
  deleting: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) => (
  <Modal
    open={Boolean(qa)}
    onOpenChange={(open) => {
      if (!deleting) onOpenChange(open);
    }}
  >
    <ModalContent size="sm" closeDisabled={deleting}>
      <ModalHeader>
        <ModalTitle>حذف پرسش؟</ModalTitle>
        <ModalDescription>این پرسش و پاسخ از پایگاه دانش حذف می‌شود.</ModalDescription>
      </ModalHeader>
      <ModalFooter>
        <Button
          type="button"
          variant="ghost"
          onClick={() => onOpenChange(false)}
          disabled={deleting}
        >
          انصراف
        </Button>
        <Button
          type="button"
          variant="danger"
          loading={deleting}
          onClick={onConfirm}
        >
          حذف
        </Button>
      </ModalFooter>
    </ModalContent>
  </Modal>
);

const QaRow = ({
  item,
  busy,
  onEdit,
  onDelete,
}: {
  item: Qa;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const reduce = useReducedMotion();
  return (
    <motion.li
      layout={!reduce}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
      transition={{ duration: reduce ? 0 : 0.3, ease: luxe }}
      className="rounded-2xl border border-line bg-surface/40 p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">س: {item.question}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-muted">
            پ: {item.answer}
          </p>
          <Badge variant="muted" className="mt-1.5 text-[10px]">
            {categoryLabel(item.category)}
          </Badge>
        </div>
        <div className="flex shrink-0 gap-1">
          <Tooltip content="ویرایش" side="top">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onEdit}
              disabled={busy}
              aria-label="ویرایش پرسش"
            >
              <Pencil className="size-4" aria-hidden />
            </Button>
          </Tooltip>
          <Tooltip content="حذف" side="top">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onDelete}
              disabled={busy}
              className="hover:text-danger"
              aria-label="حذف پرسش"
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </Tooltip>
        </div>
      </div>
    </motion.li>
  );
};

export const QaEditor = () => {
  const { toast } = useToast();
  const [qa, setQa] = React.useState<Qa[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingQa, setEditingQa] = React.useState<Qa | null>(null);
  const [deletingQa, setDeletingQa] = React.useState<Qa | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const loadQa = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/knowledge/qa");
      const data = (await res.json()) as { qa?: Qa[]; error?: string };
      if (res.ok && data.qa) setQa(data.qa);
    } catch {
      // soft-fail
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadQa();
  }, [loadQa]);

  const openCreate = () => {
    setEditingQa(null);
    setEditorOpen(true);
  };

  const openEdit = (item: Qa) => {
    setEditingQa(item);
    setEditorOpen(true);
  };

  const saveQa = async (draft: {
    question: string;
    answer: string;
    category: string;
  }): Promise<boolean> => {
    try {
      const res = await fetch("/api/ai/knowledge/qa", {
        method: editingQa ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingQa ? { id: editingQa.id, ...draft } : draft
        ),
      });
      const data = (await res.json()) as { qa?: Qa; error?: string };
      if (!res.ok || !data.qa) {
        throw new Error(data.error || "ذخیره ناموفق بود.");
      }
      if (editingQa) {
        setQa((prev) =>
          prev.map((q) => (q.id === editingQa.id ? data.qa! : q))
        );
      } else {
        setQa((prev) => [...prev, data.qa!]);
      }
      toast({
        title: editingQa ? "پرسش به‌روز شد" : "پرسش افزوده شد",
        variant: "success",
      });
      return true;
    } catch (error) {
      toast({
        title: "ذخیره ناموفق بود",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
      return false;
    }
  };

  const confirmDelete = async () => {
    if (!deletingQa) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/ai/knowledge/qa", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deletingQa.id }),
      });
      if (!res.ok) throw new Error();
      setQa((prev) => prev.filter((q) => q.id !== deletingQa.id));
      setDeletingQa(null);
      toast({ title: "پرسش حذف شد", variant: "success" });
    } catch {
      toast({
        title: "حذف ناموفق بود",
        description: "دوباره تلاش کنید.",
        variant: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <KnowledgePageHeader
        title="پرسش و پاسخ آماده"
        description="پرسش‌های متداول و پاسخ دقیق آن‌ها؛ هوش مصنوعی این زوج‌ها را اولویت بالاتری می‌دهد."
        icon={HelpCircle}
        count={qa.length}
        loading={loading}
        action={
          <Button
            type="button"
            startIcon={<Plus className="size-4" />}
            onClick={openCreate}
            className="w-full sm:w-auto"
          >
            پرسش جدید
          </Button>
        }
      />

      <div className="space-y-4">
        {loading && (
          <div
            role="status"
            aria-label="در حال بارگذاری پرسش‌ها"
            className="space-y-2"
          >
            {[0, 1].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-line bg-surface/35 p-3"
              >
                <Skeleton className="mb-2 h-4 w-3/4" />
                <SkeletonText className="mb-2" lines={2} />
                <Skeleton className="h-4 w-16 rounded-full" />
              </div>
            ))}
          </div>
        )}

        {!loading && qa.length === 0 && (
          <section className="rounded-3xl border border-dashed border-line bg-surface/25 px-6 py-14 text-center">
            <Icon icon={HelpCircle} tile size="lg" tone="accent" />
            <h2 className="mt-5 text-lg font-bold">اولین پرسش را اضافه کنید</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-7 text-muted">
              پرسش‌های پرتکرار مشتریان و پاسخ دقیق آن‌ها را اینجا ذخیره کنید تا
              هوش مصنوعی اولویت بالاتری به آن‌ها بدهد.
            </p>
            <Button
              type="button"
              className="mt-6"
              startIcon={<Plus className="size-4" />}
              onClick={openCreate}
            >
              افزودن اولین پرسش
            </Button>
          </section>
        )}

        {!loading && qa.length > 0 && (
          <section aria-labelledby="qa-list-heading">
            <div className="mb-3 flex items-center justify-between gap-4">
              <h2 id="qa-list-heading" className="text-sm font-bold">
                پرسش‌های ذخیره‌شده
              </h2>
              <Badge variant="muted">{fa(qa.length)} پرسش</Badge>
            </div>
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {qa.map((item) => (
                  <QaRow
                    key={item.id}
                    item={item}
                    busy={deleting && deletingQa?.id === item.id}
                    onEdit={() => openEdit(item)}
                    onDelete={() => setDeletingQa(item)}
                  />
                ))}
              </AnimatePresence>
            </ul>
          </section>
        )}
      </div>

      <QaEditorModal
        qa={editingQa}
        open={editorOpen}
        onOpenChange={(open) => {
          if (!open) setEditingQa(null);
          setEditorOpen(open);
        }}
        onSave={saveQa}
      />

      <DeleteQaModal
        qa={deletingQa}
        deleting={deleting}
        onConfirm={() => void confirmDelete()}
        onOpenChange={(open) => {
          if (!open) setDeletingQa(null);
        }}
      />
    </>
  );
};

// ---- Standalone page panels (used by their own routes) ---------------------

export const FactsPanel = () => (
  <div className="mx-auto max-w-3xl">
    <FactsEditor />
  </div>
);

export const QaPanel = () => (
  <div className="mx-auto max-w-3xl">
    <QaEditor />
  </div>
);
