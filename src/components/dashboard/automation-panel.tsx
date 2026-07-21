"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  Bot,
  Hash,
  MessageSquareText,
  Pencil,
  Plus,
  Send,
  Trash2,
  Workflow,
} from "lucide-react";
import { luxe } from "@/components/motion/reveal";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
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
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import {
  cleanKeyword,
  KEYWORD_MAX_LENGTH,
  REPLY_MAX_LENGTH,
  type KeywordAutomation,
} from "@/lib/automations";
import { fa } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  createAutomation,
  deleteAutomation,
  loadAutomations,
  updateAutomation,
  type AutomationRequestError,
} from "@/store/slices/automations-slice";

type RuleDraft = { keyword: string; replyText: string };

const errorMessage = (error: unknown) => {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as AutomationRequestError).message === "string"
  ) {
    return (error as AutomationRequestError).message;
  }
  return "درخواست انجام نشد؛ دوباره تلاش کنید.";
};

const RuleEditorModal = ({
  automation,
  onOpenChange,
  onSave,
  open,
}: {
  automation: KeywordAutomation | null;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: RuleDraft) => Promise<boolean>;
  open: boolean;
}) => {
  const [keyword, setKeyword] = React.useState("");
  const [replyText, setReplyText] = React.useState("");
  const [keywordError, setKeywordError] = React.useState("");
  const [replyError, setReplyError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const editing = Boolean(automation);

  React.useEffect(() => {
    if (!open) return;
    setKeyword(automation?.keyword ?? "");
    setReplyText(automation?.replyText ?? "");
    setKeywordError("");
    setReplyError("");
  }, [automation, open]);

  const saveRule = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanedKeyword = cleanKeyword(keyword);
    const cleanedReply = replyText.trim();
    let valid = true;

    if (!cleanedKeyword) {
      setKeywordError("یک کلیدواژه وارد کنید.");
      valid = false;
    } else if (cleanedKeyword.length > KEYWORD_MAX_LENGTH) {
      setKeywordError("کلیدواژه حداکثر ۸۰ نویسه است.");
      valid = false;
    }

    if (!cleanedReply) {
      setReplyError("متن پاسخ آماده را بنویسید.");
      valid = false;
    } else if (cleanedReply.length > REPLY_MAX_LENGTH) {
      setReplyError("متن پاسخ حداکثر ۴۰۹۶ نویسه است.");
      valid = false;
    }

    if (!valid) return;

    setSaving(true);
    const saved = await onSave({
      keyword: cleanedKeyword,
      replyText: cleanedReply,
    });
    setSaving(false);
    if (saved) onOpenChange(false);
  };

  const previewKeyword = cleanKeyword(keyword) || "help";
  const previewReply = replyText.trim() || "متن راهنمای شما اینجا نمایش داده می‌شود.";

  return (
    <Modal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!saving) onOpenChange(nextOpen);
      }}
    >
      <ModalContent size="lg" closeDisabled={saving}>
        <ModalHeader>
          <ModalTitle>
            {editing ? "ویرایش پاسخ کلیدواژه‌ای" : "پاسخ کلیدواژه‌ای جدید"}
          </ModalTitle>
          <ModalDescription>
            وقتی متن پیام دقیقاً با کلیدواژه برابر باشد، ربات پاسخ آماده شما را
            می‌فرستد.
          </ModalDescription>
        </ModalHeader>

        <form onSubmit={saveRule} noValidate>
          <div className="space-y-5">
            <Input
              id="automation-keyword"
              dir="auto"
              label="کلیدواژه"
              hint="فاصله‌های ابتدا و انتها و بزرگی حروف نادیده گرفته می‌شود."
              placeholder="help"
              value={keyword}
              onChange={(event) => {
                setKeyword(event.target.value);
                if (keywordError) setKeywordError("");
              }}
              error={keywordError}
              maxLength={KEYWORD_MAX_LENGTH}
              startIcon={<Hash />}
              autoComplete="off"
              disabled={saving}
              required
            />

            <Textarea
              id="automation-reply"
              dir="auto"
              label="متن پاسخ آماده"
              hint="راهنما، لینک یا هر متنی را که مشتری باید دریافت کند بنویسید."
              placeholder="سلام! برای شروع، راهنمای زیر را دنبال کنید…"
              value={replyText}
              onChange={(event) => {
                setReplyText(event.target.value);
                if (replyError) setReplyError("");
              }}
              error={replyError}
              maxLength={REPLY_MAX_LENGTH}
              showCount
              rows={6}
              disabled={saving}
              required
            />

            <section
              aria-label="پیش‌نمایش عملکرد اتوماسیون"
              className="rounded-3xl border border-line bg-background/55 p-4 sm:p-5"
            >
              <p className="mb-3 text-xs font-medium text-muted">
                پیش‌نمایش عملکرد
              </p>
              <div className="grid items-stretch gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.25fr)] sm:items-center">
                <div className="rounded-2xl bg-surface/70 p-4">
                  <span className="flex items-center gap-2 text-xs text-muted">
                    <MessageSquareText className="size-4" aria-hidden />
                    اگر مشتری بنویسد
                  </span>
                  <code
                    dir="auto"
                    className="mt-2 block break-words text-sm font-bold text-foreground"
                  >
                    {previewKeyword}
                  </code>
                </div>

                <ArrowLeft
                  className="mx-auto hidden size-4 text-muted sm:block"
                  aria-hidden
                />

                <div className="rounded-2xl bg-surface/70 p-4">
                  <span className="flex items-center gap-2 text-xs text-muted">
                    <Send className="size-4" aria-hidden />
                    ربات پاسخ می‌دهد
                  </span>
                  <p
                    dir="auto"
                    className="mt-2 max-h-20 overflow-hidden whitespace-pre-wrap break-words text-sm leading-6"
                  >
                    {previewReply}
                  </p>
                </div>
              </div>
            </section>
          </div>

          <ModalFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              انصراف
            </Button>
            <Button type="submit" loading={saving}>
              {editing ? "ذخیره تغییرات" : "ساخت اتوماسیون"}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

const DeleteRuleModal = ({
  automation,
  deleting,
  onConfirm,
  onOpenChange,
}: {
  automation: KeywordAutomation | null;
  deleting: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) => (
  <Modal
    open={Boolean(automation)}
    onOpenChange={(open) => {
      if (!deleting) onOpenChange(open);
    }}
  >
    <ModalContent size="sm" closeDisabled={deleting}>
      <ModalHeader>
        <ModalTitle>حذف اتوماسیون؟</ModalTitle>
        <ModalDescription>
          پس از حذف، ربات دیگر به کلیدواژه «{automation?.keyword}» پاسخ آماده
          نمی‌دهد.
        </ModalDescription>
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
          حذف اتوماسیون
        </Button>
      </ModalFooter>
    </ModalContent>
  </Modal>
);

const RuleCard = ({
  automation,
  busy,
  onDelete,
  onEdit,
  onToggle,
}: {
  automation: KeywordAutomation;
  busy: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onToggle: (active: boolean) => void;
}) => {
  const reduce = useReducedMotion();

  return (
    <motion.article
      layout={!reduce}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
      transition={{ duration: reduce ? 0 : 0.3, ease: luxe }}
      className="rounded-3xl border border-line bg-surface/35 p-4 sm:p-5"
    >
      <header className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Icon icon={Workflow} tile size="sm" tone={automation.isActive ? "accent" : "muted"} />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">پاسخ کلیدواژه‌ای</p>
            <Badge
              variant={automation.isActive ? "success" : "muted"}
              dot
              className="mt-1.5"
            >
              {automation.isActive ? "فعال" : "متوقف"}
            </Badge>
          </div>
        </div>
        <Switch
          aria-label={`${automation.isActive ? "توقف" : "فعال‌سازی"} اتوماسیون ${automation.keyword}`}
          checked={automation.isActive}
          disabled={busy}
          onChange={(event) => onToggle(event.target.checked)}
        />
      </header>

      <div className="mt-5 grid gap-3 border-y border-line py-5 md:grid-cols-[minmax(0,0.9fr)_auto_minmax(0,1.35fr)] md:items-center">
        <div className="min-w-0 rounded-2xl bg-background/45 p-4">
          <p className="flex items-center gap-2 text-xs text-muted">
            <MessageSquareText className="size-4 shrink-0" aria-hidden />
            پیام مشتری
          </p>
          <code
            dir="auto"
            className="mt-2 block truncate text-sm font-bold text-foreground"
          >
            {automation.keyword}
          </code>
        </div>

        <ArrowLeft
          className="mx-auto hidden size-4 text-muted md:block"
          aria-hidden
        />

        <div className="min-w-0 rounded-2xl bg-background/45 p-4">
          <p className="flex items-center gap-2 text-xs text-muted">
            <Send className="size-4 shrink-0" aria-hidden />
            پاسخ آماده
          </p>
          <p
            dir="auto"
            className="mt-2 max-h-12 overflow-hidden whitespace-pre-wrap break-words text-sm leading-6"
          >
            {automation.replyText}
          </p>
        </div>
      </div>

      <footer className="mt-3 flex justify-end gap-1">
        <Tooltip content="ویرایش" side="top">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`ویرایش اتوماسیون ${automation.keyword}`}
            onClick={onEdit}
            disabled={busy}
          >
            <Pencil className="size-4" aria-hidden />
          </Button>
        </Tooltip>
        <Tooltip content="حذف" side="top">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`حذف اتوماسیون ${automation.keyword}`}
            onClick={onDelete}
            disabled={busy}
            className="hover:text-danger"
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </Tooltip>
      </footer>
    </motion.article>
  );
};

const AutomationPanelContent = () => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const { bot, error, items, setupRequired, status } = useAppSelector(
    (state) => state.automations
  );
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingRule, setEditingRule] = React.useState<KeywordAutomation | null>(
    null
  );
  const [deletingRule, setDeletingRule] = React.useState<KeywordAutomation | null>(
    null
  );
  const [busyRuleId, setBusyRuleId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    void dispatch(loadAutomations());
  }, [dispatch]);

  const openCreate = () => {
    setEditingRule(null);
    setEditorOpen(true);
  };

  const openEdit = (automation: KeywordAutomation) => {
    setEditingRule(automation);
    setEditorOpen(true);
  };

  const saveRule = async (draft: RuleDraft) => {
    try {
      const result = editingRule
        ? await dispatch(
            updateAutomation({ id: editingRule.id, changes: draft })
          ).unwrap()
        : await dispatch(createAutomation(draft)).unwrap();

      toast({
        title: editingRule ? "تغییرات ذخیره شد" : "اتوماسیون ساخته شد",
        description: result.webhookActive
          ? "پاسخ کلیدواژه‌ای روی ربات تلگرام فعال است."
          : "قانون ذخیره شد، اما دریافت پیام ربات فعال نشد؛ آدرس عمومی سامانه را بررسی کنید.",
        variant: result.webhookActive ? "success" : "warning",
      });
      return true;
    } catch (requestError) {
      toast({
        title: "اتوماسیون ذخیره نشد",
        description: errorMessage(requestError),
        variant: "error",
      });
      return false;
    }
  };

  const toggleRule = async (automation: KeywordAutomation, isActive: boolean) => {
    setBusyRuleId(automation.id);
    try {
      const result = await dispatch(
        updateAutomation({ id: automation.id, changes: { isActive } })
      ).unwrap();
      toast({
        title: isActive ? "اتوماسیون فعال شد" : "اتوماسیون متوقف شد",
        description:
          isActive && !result.webhookActive
            ? "قانون فعال شد، اما دریافت پیام ربات برقرار نشد؛ آدرس عمومی سامانه را بررسی کنید."
            : isActive
              ? "ربات به این کلیدواژه پاسخ می‌دهد."
              : "ربات فعلاً به این کلیدواژه پاسخ نمی‌دهد.",
        variant: isActive && !result.webhookActive ? "warning" : "success",
      });
    } catch (requestError) {
      toast({
        title: "تغییر وضعیت انجام نشد",
        description: errorMessage(requestError),
        variant: "error",
      });
    } finally {
      setBusyRuleId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deletingRule) return;
    setDeleting(true);
    try {
      await dispatch(deleteAutomation(deletingRule.id)).unwrap();
      setDeletingRule(null);
      toast({
        title: "اتوماسیون حذف شد",
        description: "ربات دیگر به این کلیدواژه پاسخ آماده نمی‌دهد.",
        variant: "success",
      });
    } catch (requestError) {
      toast({
        title: "اتوماسیون حذف نشد",
        description: errorMessage(requestError),
        variant: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  const loading = status === "idle" || status === "loading";
  const canCreate = status === "succeeded" && Boolean(bot) && !setupRequired;

  return (
    <div className="mx-auto max-w-5xl">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-black">اتوماسیون</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
            برای پیام‌های پرتکرار کلیدواژه تعریف کنید تا ربات تلگرام همان لحظه
            پاسخ آماده شما را بفرستد.
          </p>
        </div>
        <Button
          type="button"
          startIcon={<Plus className="size-4" />}
          onClick={openCreate}
          disabled={!canCreate}
          className="w-full shrink-0 sm:w-auto"
        >
          اتوماسیون جدید
        </Button>
      </header>

      <div className="mt-8 space-y-5">
        {setupRequired && (
          <Alert
            variant="warning"
            title="راه‌اندازی اتوماسیون کامل نشده است"
            description="اسکریپت پایگاه داده اتوماسیون را اجرا کنید، سپس این صفحه را دوباره بارگذاری کنید."
          >
            <Button
              type="button"
              variant="link"
              className="mt-2"
              onClick={() => void dispatch(loadAutomations())}
            >
              بررسی دوباره
            </Button>
          </Alert>
        )}

        {!setupRequired && status === "failed" && (
          <Alert
            variant="error"
            title="اتوماسیون‌ها بارگذاری نشدند"
            description={error ?? "اتصال اینترنت را بررسی کنید و دوباره تلاش کنید."}
          >
            <Button
              type="button"
              variant="link"
              className="mt-2"
              onClick={() => void dispatch(loadAutomations())}
            >
              تلاش دوباره
            </Button>
          </Alert>
        )}

        {!loading && status === "succeeded" && !bot && (
          <Alert
            variant="info"
            title="ابتدا ربات تلگرام را متصل کنید"
            description="از منوی حساب وارد تنظیمات و بخش اتصالات شوید. پس از اتصال ربات، می‌توانید اولین پاسخ کلیدواژه‌ای را بسازید."
          />
        )}

        {bot && status === "succeeded" && (
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface/30 px-4 py-3 sm:flex-row sm:items-center">
            <span className="flex min-w-0 items-center gap-3">
              <Icon icon={Bot} tile size="xs" tone="accent" />
              <span className="min-w-0">
                <span className="block text-xs text-muted">ربات متصل</span>
                <span dir="ltr" className="block truncate text-start text-sm font-medium">
                  @{bot.username}
                </span>
              </span>
            </span>
            <span className="text-xs leading-6 text-muted sm:ms-auto">
              تطبیق کلیدواژه با متن کامل پیام انجام می‌شود.
            </span>
          </div>
        )}

        {loading && (
          <div role="status" aria-label="در حال بارگذاری اتوماسیون‌ها" className="space-y-4">
            {[0, 1].map((item) => (
              <div
                key={item}
                className="rounded-3xl border border-line bg-surface/35 p-5"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="size-9 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-6 w-11 rounded-full" />
                </div>
                <SkeletonText className="mt-6" lines={2} />
              </div>
            ))}
          </div>
        )}

        {!loading && status === "succeeded" && bot && items.length === 0 && (
          <section className="rounded-3xl border border-dashed border-line bg-surface/25 px-6 py-14 text-center">
            <Icon icon={MessageSquareText} tile size="lg" tone="accent" />
            <h2 className="mt-5 text-lg font-bold">اولین پاسخ آماده را بسازید</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-7 text-muted">
              مثلاً کلیدواژه «help» را به یک متن راهنمای کامل وصل کنید تا هر
              مشتری با فرستادن آن، فوراً راهنما را دریافت کند.
            </p>
            <Button
              type="button"
              className="mt-7"
              startIcon={<Plus className="size-4" />}
              onClick={openCreate}
            >
              ساخت اولین اتوماسیون
            </Button>
          </section>
        )}

        {!loading && status === "succeeded" && items.length > 0 && (
          <section aria-labelledby="keyword-automations-heading">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 id="keyword-automations-heading" className="text-sm font-bold">
                پاسخ‌های کلیدواژه‌ای
              </h2>
              <Badge variant="muted">{fa(items.length)} اتوماسیون</Badge>
            </div>
            <div className="space-y-4">
              <AnimatePresence initial={false}>
                {items.map((automation) => (
                  <RuleCard
                    key={automation.id}
                    automation={automation}
                    busy={busyRuleId === automation.id}
                    onEdit={() => openEdit(automation)}
                    onDelete={() => setDeletingRule(automation)}
                    onToggle={(active) =>
                      void toggleRule(automation, active)
                    }
                  />
                ))}
              </AnimatePresence>
            </div>
          </section>
        )}
      </div>

      <RuleEditorModal
        automation={editingRule}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSave={saveRule}
      />
      <DeleteRuleModal
        automation={deletingRule}
        deleting={deleting}
        onConfirm={() => void confirmDelete()}
        onOpenChange={(open) => {
          if (!open) setDeletingRule(null);
        }}
      />
    </div>
  );
};

export const AutomationPanel = () => <AutomationPanelContent />;
