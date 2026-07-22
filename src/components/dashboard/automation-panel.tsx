"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  Bot,
  Command,
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
import { Select, type SelectOption } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import {
  cleanTelegramCommand,
  cleanKeyword,
  isValidTelegramCommand,
  KEYWORD_MAX_LENGTH,
  REPLY_MAX_LENGTH,
  TELEGRAM_COMMAND_DESCRIPTION_MAX_LENGTH,
  TELEGRAM_COMMAND_MAX_LENGTH,
  toTelegramCommandKeyword,
  type AutomationTriggerType,
  type KeywordAutomation,
} from "@/lib/automations";
import { fa } from "@/lib/utils";
import { Camera, MessageCircle } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  createAutomation,
  deleteAutomation,
  loadAutomations,
  updateAutomation,
  type AutomationRequestError,
} from "@/store/slices/automations-slice";

type RuleDraft = {
  triggerType: AutomationTriggerType;
  keyword: string;
  commandDescription: string | null;
  replyText: string;
};

const triggerTypeOptions: SelectOption[] = [
  {
    value: "keyword",
    label: "کلیدواژه",
    description: "تطبیق دقیق با متن کامل پیام",
    icon: <Hash className="size-4" aria-hidden />,
  },
  {
    value: "command",
    label: "فرمان تلگرام",
    description: "نمایش در منوی / ربات",
    icon: <Command className="size-4" aria-hidden />,
  },
];

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
  const [triggerType, setTriggerType] =
    React.useState<AutomationTriggerType>("keyword");
  const [keyword, setKeyword] = React.useState("");
  const [commandDescription, setCommandDescription] = React.useState("");
  const [replyText, setReplyText] = React.useState("");
  const [keywordError, setKeywordError] = React.useState("");
  const [commandDescriptionError, setCommandDescriptionError] =
    React.useState("");
  const [replyError, setReplyError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const editing = Boolean(automation);

  React.useEffect(() => {
    if (!open) return;
    setTriggerType(automation?.triggerType ?? "keyword");
    setKeyword(
      automation?.triggerType === "command"
        ? toTelegramCommandKeyword(automation.keyword) || "/"
        : automation?.keyword ?? ""
    );
    setCommandDescription(automation?.commandDescription ?? "");
    setReplyText(automation?.replyText ?? "");
    setKeywordError("");
    setCommandDescriptionError("");
    setReplyError("");
  }, [automation, open]);

  const saveRule = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanedKeyword =
      triggerType === "command"
        ? toTelegramCommandKeyword(keyword)
        : cleanKeyword(keyword);
    const cleanedCommandDescription = commandDescription.trim();
    const cleanedReply = replyText.trim();
    let valid = true;

    if (triggerType === "command") {
      if (!cleanTelegramCommand(keyword)) {
        setKeywordError("یک فرمان وارد کنید.");
        valid = false;
      } else if (!isValidTelegramCommand(keyword)) {
        setKeywordError(
          "فقط حروف انگلیسی کوچک، عدد و زیرخط؛ حداکثر ۳۲ نویسه."
        );
        valid = false;
      }

      if (!cleanedCommandDescription) {
        setCommandDescriptionError("توضیحی برای منوی فرمان بنویسید.");
        valid = false;
      } else if (
        cleanedCommandDescription.length >
        TELEGRAM_COMMAND_DESCRIPTION_MAX_LENGTH
      ) {
        setCommandDescriptionError("توضیح منو حداکثر ۲۵۶ نویسه است.");
        valid = false;
      }
    } else {
      if (!cleanedKeyword) {
        setKeywordError("یک کلیدواژه وارد کنید.");
        valid = false;
      } else if (cleanedKeyword.length > KEYWORD_MAX_LENGTH) {
        setKeywordError("کلیدواژه حداکثر ۸۰ نویسه است.");
        valid = false;
      }
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
      triggerType,
      keyword: cleanedKeyword,
      commandDescription:
        triggerType === "command" ? cleanedCommandDescription : null,
      replyText: cleanedReply,
    });
    setSaving(false);
    if (saved) onOpenChange(false);
  };

  const previewKeyword =
    triggerType === "command"
      ? toTelegramCommandKeyword(keyword) || "/help"
      : cleanKeyword(keyword) || "help";
  const previewCommandDescription =
    commandDescription.trim() || "دریافت راهنمای کامل";
  const previewReply = replyText.trim() || "متن راهنمای شما اینجا نمایش داده می‌شود.";

  return (
    <Modal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!saving) onOpenChange(nextOpen);
      }}
    >
      <ModalContent
        size="lg"
        closeDisabled={saving}
        className="flex max-h-[calc(100dvh-2.5rem)] flex-col overflow-hidden p-0"
      >
        <ModalHeader className="mb-0 shrink-0 px-5 pb-4 pt-5 sm:px-7 sm:pb-5 sm:pt-7">
          <ModalTitle>
            {editing ? "ویرایش اتوماسیون" : "اتوماسیون جدید"}
          </ModalTitle>
          <ModalDescription>
            {triggerType === "command"
              ? "فرمان در منوی ربات نمایش داده می‌شود و پاسخ آماده شما را می‌فرستد."
              : "وقتی متن پیام دقیقاً با کلیدواژه برابر باشد، ربات پاسخ آماده شما را می‌فرستد."}
          </ModalDescription>
        </ModalHeader>

        <form
          onSubmit={saveRule}
          noValidate
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-6 pt-1 sm:px-7">
            <Select
              id="automation-trigger-type"
              label="نوع محرک"
              options={triggerTypeOptions}
              value={triggerType}
              onChange={(value) => {
                const nextTriggerType = value as AutomationTriggerType;
                if (nextTriggerType !== triggerType) {
                  setKeyword(nextTriggerType === "command" ? "/" : "");
                  setCommandDescription("");
                }
                setTriggerType(nextTriggerType);
                setKeywordError("");
                setCommandDescriptionError("");
              }}
              disabled={saving}
            />

            <Input
              id="automation-keyword"
              dir="rtl"
              label={triggerType === "command" ? "فرمان" : "کلیدواژه"}
              hint={
                triggerType === "command"
                  ? "/ خودکار افزوده می‌شود؛ حروف بزرگ هم خودکار کوچک می‌شوند."
                  : "فاصله‌های ابتدا و انتها و بزرگی حروف نادیده گرفته می‌شود."
              }
              placeholder={triggerType === "command" ? "/help" : "help"}
              value={keyword}
              onChange={(event) => {
                setKeyword(
                  triggerType === "command"
                    ? toTelegramCommandKeyword(event.target.value) || "/"
                    : event.target.value
                );
                if (keywordError) setKeywordError("");
              }}
              error={keywordError}
              maxLength={
                triggerType === "command"
                  ? TELEGRAM_COMMAND_MAX_LENGTH + 2
                  : KEYWORD_MAX_LENGTH
              }
              startIcon={triggerType === "command" ? <Command /> : <Hash />}
              autoComplete="off"
              disabled={saving}
              required
            />

            {triggerType === "command" && (
              <Input
                id="automation-command-description"
                dir="rtl"
                label="توضیح در منوی تلگرام"
                hint="این متن کنار فرمان در فهرست / ربات دیده می‌شود."
                placeholder="دریافت راهنمای کامل"
                value={commandDescription}
                onChange={(event) => {
                  setCommandDescription(event.target.value);
                  if (commandDescriptionError) setCommandDescriptionError("");
                }}
                error={commandDescriptionError}
                maxLength={TELEGRAM_COMMAND_DESCRIPTION_MAX_LENGTH}
                startIcon={<MessageSquareText />}
                autoComplete="off"
                disabled={saving}
                required
              />
            )}

            <Textarea
              id="automation-reply"
              dir="rtl"
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
                  {triggerType === "command" && (
                    <span className="mt-1.5 block truncate text-xs text-muted">
                      {previewCommandDescription}
                    </span>
                  )}
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
          پس از حذف، ربات دیگر به «{automation?.keyword}» پاسخ آماده نمی‌دهد.
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
  const isCommand = automation.triggerType === "command";

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
          <Icon
            icon={isCommand ? Command : Workflow}
            tile
            size="sm"
            tone={automation.isActive ? "accent" : "muted"}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">
              {isCommand ? "فرمان تلگرام" : "پاسخ کلیدواژه‌ای"}
            </p>
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
            {isCommand ? (
              <Command className="size-4 shrink-0" aria-hidden />
            ) : (
              <MessageSquareText className="size-4 shrink-0" aria-hidden />
            )}
            {isCommand ? "فرمان" : "پیام مشتری"}
          </p>
          <code
            dir="auto"
            className="mt-2 block truncate text-sm font-bold text-foreground"
          >
            {automation.keyword}
          </code>
          {isCommand && automation.commandDescription && (
            <p className="mt-1.5 truncate text-xs text-muted">
              {automation.commandDescription}
            </p>
          )}
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

// Channel selector — Telegram is live; others reserved for future services.
const channels = [
  { id: "telegram", label: "تلگرام", icon: Send, available: true },
  { id: "instagram", label: "اینستاگرام", icon: Camera, available: false },
  { id: "whatsapp", label: "واتساپ", icon: MessageCircle, available: false },
] as const;

const ChannelTabs = () => {
  const [active, setActive] = React.useState<string>("telegram");

  return (
    <div className="mt-6 flex flex-wrap gap-2" role="tablist" aria-label="کانال‌ها">
      {channels.map((channel) => {
        const isActive = active === channel.id;
        return (
          <button
            key={channel.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={!channel.available}
            onClick={() => channel.available && setActive(channel.id)}
            className={`group flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              isActive
                ? "border-accent/40 bg-accent/10 text-accent"
                : channel.available
                  ? "border-line bg-surface/40 text-foreground hover:bg-surface/70"
                  : "cursor-not-allowed border-line bg-surface/20 text-muted"
            }`}
          >
            <channel.icon className="size-4" aria-hidden />
            {channel.label}
            {!channel.available && (
              <Badge variant="muted" className="ms-1">
                به‌زودی
              </Badge>
            )}
          </button>
        );
      })}
    </div>
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
        description: !result.webhookActive
          ? "قانون ذخیره شد، اما دریافت پیام ربات فعال نشد؛ آدرس عمومی سامانه را بررسی کنید."
          : !result.commandsSynced
            ? "پاسخ فعال شد، اما منوی فرمان‌های تلگرام به‌روز نشد؛ اتصال تلگرام را بررسی کنید."
            : draft.triggerType === "command"
              ? "فرمان و پاسخ آماده روی ربات تلگرام فعال هستند."
              : "پاسخ کلیدواژه‌ای روی ربات تلگرام فعال است.",
        variant:
          result.webhookActive && result.commandsSynced ? "success" : "warning",
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
            : !result.commandsSynced
              ? "وضعیت ذخیره شد، اما منوی فرمان‌های تلگرام به‌روز نشد؛ اتصال تلگرام را بررسی کنید."
              : isActive
                ? automation.triggerType === "command"
                  ? "ربات به این فرمان پاسخ می‌دهد و آن را در منوی / نمایش می‌دهد."
                  : "ربات به این کلیدواژه پاسخ می‌دهد."
                : automation.triggerType === "command"
                  ? "فرمان از منوی / برداشته شد و فعلاً پاسخی نمی‌فرستد."
                  : "ربات فعلاً به این کلیدواژه پاسخ نمی‌دهد.",
        variant:
          (isActive && !result.webhookActive) || !result.commandsSynced
            ? "warning"
            : "success",
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
      const result = await dispatch(deleteAutomation(deletingRule.id)).unwrap();
      setDeletingRule(null);
      toast({
        title: "اتوماسیون حذف شد",
        description: result.commandsSynced
          ? "ربات دیگر به این محرک پاسخ آماده نمی‌دهد."
          : "اتوماسیون حذف شد، اما منوی فرمان‌های تلگرام به‌روز نشد؛ اتصال تلگرام را بررسی کنید.",
        variant: result.commandsSynced ? "success" : "warning",
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
          <h1 className="text-2xl font-black">پیام‌های آماده</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
            برای پیام‌های پرتکرار کلیدواژه یا فرمان تعریف کنید تا ربات تلگرام
            همان لحظه پاسخ آماده شما را بفرستد.
          </p>
        </div>
        <Button
          type="button"
          startIcon={<Plus className="size-4" />}
          onClick={openCreate}
          disabled={!canCreate}
          className="w-full shrink-0 sm:w-auto"
        >
          پیام آماده جدید
        </Button>
      </header>

      <ChannelTabs />

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
              فرمان‌ها در منوی / ربات نمایش داده می‌شوند؛ کلیدواژه‌ها با متن
              کامل پیام تطبیق دارند.
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
              مثلاً فرمان «/help» یا کلیدواژه «راهنما» را به یک متن کامل وصل
              کنید تا مشتری فوراً پاسخ آماده را دریافت کند.
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
                پاسخ‌های خودکار
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
