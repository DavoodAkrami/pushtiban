"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Command,
  GitBranch,
  Hash,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { TbBrandInstagram } from "react-icons/tb";
import { luxe } from "@/components/motion/reveal";
import { BotRequiredNotice } from "@/components/dashboard/bot-required-notice";
import {
  ChannelTabs,
  useActiveChannel,
} from "@/components/dashboard/channel-tabs";
import { InstagramRequiredNotice } from "@/components/dashboard/instagram/notices";
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
import { Select, type SelectOption } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import {
  cleanKeyword,
  isValidTelegramCommand,
  KEYWORD_MAX_LENGTH,
  TELEGRAM_COMMAND_DESCRIPTION_MAX_LENGTH,
  TELEGRAM_COMMAND_MAX_LENGTH,
  toTelegramCommandKeyword,
  cleanTelegramCommand,
} from "@/lib/automations";
import {
  FLOW_NAME_MAX_LENGTH,
  flowLimits,
  type AutomationFlow,
  type AutomationFlowDetail,
  type FlowChannel,
} from "@/lib/flows";
import { fa } from "@/lib/utils";
import { CHANNEL_CONNECTION_CHANGED_EVENT } from "@/lib/settings-events";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  createFlow,
  deleteFlow,
  loadFlowDetail,
  loadFlows,
  updateFlow,
  type FlowRequestError,
} from "@/store/slices/flows-slice";
import { loadAutomations } from "@/store/slices/automations-slice";

// ─── Trigger type options ────────────────────────────────────────────────────

const triggerOptions: SelectOption[] = [
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const errorMessage = (error: unknown) => {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as FlowRequestError).message === "string"
  ) {
    return (error as FlowRequestError).message;
  }
  return "درخواست انجام نشد؛ دوباره تلاش کنید.";
};

// ─── Flow editor modal ────────────────────────────────────────────────────────

const FlowEditorModal = ({
  channel,
  flow,
  open,
  onOpenChange,
  onCreated,
}: {
  /** The channel a new flow is created on; an edited flow keeps its own. */
  channel: FlowChannel;
  flow: AutomationFlowDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (flow: AutomationFlow) => void;
}) => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const flowChannel = flow?.channel ?? channel;
  const limits = flowLimits(flowChannel);
  // Instagram has no command menu and no way to type a slash command, so there
  // is nothing to choose between: every Instagram flow starts on a keyword.
  const [triggerType, setTriggerType] = React.useState<"keyword" | "command">(
    limits.supportsCommands ? "command" : "keyword"
  );
  const [keyword, setKeyword] = React.useState(
    limits.supportsCommands ? "/" : ""
  );
  const [commandDescription, setCommandDescription] = React.useState("");
  const [name, setName] = React.useState("");
  const [rootMessage, setRootMessage] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const editing = Boolean(flow);

  React.useEffect(() => {
    if (!open) return;
    const fallbackTrigger = limits.supportsCommands ? "command" : "keyword";
    setTriggerType(flow?.triggerType ?? fallbackTrigger);
    setKeyword(
      flow?.triggerKeyword ?? (limits.supportsCommands ? "/" : "")
    );
    setCommandDescription(flow?.commandDescription ?? "");
    setName(flow?.name ?? "");
    setRootMessage(
      flow?.nodes.find((node) => node.isRoot)?.messageText ?? ""
    );
    setErrors({});
  }, [flow, limits.supportsCommands, open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};

    const cleanedKeyword =
      triggerType === "command"
        ? toTelegramCommandKeyword(keyword)
        : cleanKeyword(keyword);

    if (triggerType === "command") {
      if (!cleanTelegramCommand(keyword)) errs.keyword = "یک فرمان وارد کنید.";
      else if (!isValidTelegramCommand(keyword))
        errs.keyword = "فقط حروف انگلیسی کوچک، عدد و زیرخط؛ حداکثر ۳۲ نویسه.";
      if (!commandDescription.trim())
        errs.commandDescription = "توضیحی برای منوی فرمان بنویسید.";
      else if (commandDescription.trim().length > TELEGRAM_COMMAND_DESCRIPTION_MAX_LENGTH)
        errs.commandDescription = "توضیح منو حداکثر ۲۵۶ نویسه است.";
    } else {
      if (!cleanedKeyword) errs.keyword = "یک کلیدواژه وارد کنید.";
      else if (cleanedKeyword.length > KEYWORD_MAX_LENGTH)
        errs.keyword = "کلیدواژه حداکثر ۸۰ نویسه است.";
    }

    if (!name.trim()) errs.name = "نامی برای فلو وارد کنید.";
    else if (name.trim().length > FLOW_NAME_MAX_LENGTH)
      errs.name = "نام فلو حداکثر ۱۰۰ نویسه است.";

    if (!rootMessage.trim()) errs.rootMessage = "متن پیام اول را بنویسید.";
    else if (rootMessage.trim().length > limits.messageMaxLength)
      errs.rootMessage = `متن پیام حداکثر ${fa(limits.messageMaxLength)} نویسه است.`;

    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSaving(true);

    if (flow) {
      const result = await dispatch(
        updateFlow({
          id: flow.id,
          changes: {
            triggerType,
            triggerKeyword: cleanedKeyword,
            name: name.trim(),
            commandDescription:
              triggerType === "command" ? commandDescription.trim() : null,
            rootMessage: rootMessage.trim(),
          },
        })
      );
      setSaving(false);

      if (updateFlow.fulfilled.match(result)) {
        toast({
          title: "تغییرات فلو ذخیره شد",
          description: result.payload.commandsSynced
            ? "محرک و پیام شروع فلو به‌روز شدند."
            : "فلو ذخیره شد، اما منوی فرمان‌های تلگرام به‌روز نشد.",
          variant: result.payload.commandsSynced ? "success" : "warning",
        });
        onOpenChange(false);
      } else {
        toast({
          title: "تغییرات فلو ذخیره نشد",
          description: errorMessage(result.payload),
          variant: "error",
        });
      }
      return;
    }

    const result = await dispatch(
      createFlow({
        channel: flowChannel,
        triggerType,
        triggerKeyword: cleanedKeyword,
        name: name.trim(),
        commandDescription:
          triggerType === "command" ? commandDescription.trim() : undefined,
        rootMessage: rootMessage.trim(),
      })
    );
    setSaving(false);

    if (createFlow.fulfilled.match(result)) {
      toast({ title: "فلو ساخته شد." });
      if (!result.payload.commandsSynced)
        toast({ title: "منوی فرمان‌های تلگرام به‌روز نشد؛ اتصال را بررسی کنید.", variant: "warning" });
      onCreated?.(result.payload.flow);
      onOpenChange(false);
    } else {
      toast({ title: errorMessage(result.payload), variant: "error" });
    }
  };

  return (
    <Modal open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <ModalContent size="lg" closeDisabled={saving} className="flex max-h-[calc(100dvh-2.5rem)] flex-col overflow-hidden p-0">
        <ModalHeader className="mb-0 shrink-0 px-5 pb-4 pt-5 sm:px-7 sm:pb-5 sm:pt-7">
          <ModalTitle>{editing ? "ویرایش فلو" : "فلو جدید"}</ModalTitle>
          <ModalDescription>
            {editing
              ? "نام، محرک و پیام شروع این فلو را ویرایش کنید."
              : flowChannel === "instagram"
                ? "یک مکالمه تعاملی برای دایرکت اینستاگرام بسازید؛ با کلیدواژه شروع می‌شود و هر پیام تا سه دکمه دارد."
                : "یک مکالمه تعاملی با دکمه و پیام‌های زنجیره‌ای بسازید."}
          </ModalDescription>
        </ModalHeader>
        <form onSubmit={(e) => void submit(e)} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-6 pt-1 sm:px-7">
            <Input
              id="flow-name"
              dir="rtl"
              label="نام فلو"
              placeholder="مثلاً: راهنمای خرید"
              value={name}
              onChange={(e) => { setName(e.target.value); if (errors.name) setErrors((p) => ({ ...p, name: "" })); }}
              error={errors.name}
              maxLength={FLOW_NAME_MAX_LENGTH}
              disabled={saving}
              required
            />
            {limits.supportsCommands && (
              <Select
                id="flow-trigger-type"
                label="نوع محرک"
                options={triggerOptions}
                value={triggerType}
                onChange={(v) => {
                  const t = v as "keyword" | "command";
                  setTriggerType(t);
                  setKeyword(t === "command" ? "/" : "");
                  setErrors({});
                }}
                disabled={saving}
              />
            )}
            <Input
              id="flow-keyword"
              dir="rtl"
              label={triggerType === "command" ? "فرمان" : "کلیدواژه"}
              placeholder={triggerType === "command" ? "/start" : "سلام"}
              value={keyword}
              onChange={(e) => {
                setKeyword(
                  triggerType === "command"
                    ? toTelegramCommandKeyword(e.target.value) || "/"
                    : e.target.value
                );
                if (errors.keyword) setErrors((p) => ({ ...p, keyword: "" }));
              }}
              error={errors.keyword}
              maxLength={triggerType === "command" ? TELEGRAM_COMMAND_MAX_LENGTH + 2 : KEYWORD_MAX_LENGTH}
              startIcon={triggerType === "command" ? <Command /> : <Hash />}
              autoComplete="off"
              disabled={saving}
              required
            />
            {triggerType === "command" && (
              <Input
                id="flow-command-description"
                dir="rtl"
                label="توضیح در منوی تلگرام"
                placeholder="راهنمای خرید محصولات"
                value={commandDescription}
                onChange={(e) => { setCommandDescription(e.target.value); if (errors.commandDescription) setErrors((p) => ({ ...p, commandDescription: "" })); }}
                error={errors.commandDescription}
                maxLength={TELEGRAM_COMMAND_DESCRIPTION_MAX_LENGTH}
                disabled={saving}
                required
              />
            )}
            <Textarea
              id="flow-root-message"
              dir="rtl"
              label="متن پیام اول"
              hint={
                flowChannel === "instagram"
                  ? "این پیام وقتی مشتری کلیدواژه را در دایرکت بفرستد ارسال می‌شود. اینستاگرام تا ۶۴۰ نویسه را روی پیام دکمه‌دار می‌پذیرد."
                  : "این پیام وقتی کاربر محرک را ارسال کند نمایش داده می‌شود."
              }
              placeholder="سلام! چطور می‌تونم کمکت کنم؟"
              value={rootMessage}
              onChange={(e) => { setRootMessage(e.target.value); if (errors.rootMessage) setErrors((p) => ({ ...p, rootMessage: "" })); }}
              error={errors.rootMessage}
              maxLength={limits.messageMaxLength}
              showCount
              rows={4}
              disabled={saving}
              required
            />
          </div>
          <ModalFooter className="mt-0 shrink-0 flex-col-reverse border-t border-line px-5 py-4 sm:flex-row sm:px-7 sm:py-5">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving} className="w-full sm:w-auto">
              انصراف
            </Button>
            <Button type="submit" loading={saving} className="w-full sm:w-auto">
              {editing ? "ذخیره تغییرات" : "ساخت فلو"}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

// ─── Delete flow modal ────────────────────────────────────────────────────────

const DeleteFlowModal = ({
  flow,
  deleting,
  onConfirm,
  onOpenChange,
}: {
  flow: AutomationFlow | null;
  deleting: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) => (
  <Modal open={Boolean(flow)} onOpenChange={(o) => { if (!deleting) onOpenChange(o); }}>
    <ModalContent size="sm" closeDisabled={deleting}>
      <ModalHeader>
        <ModalTitle>حذف فلو؟</ModalTitle>
        <ModalDescription>
          فلو «{flow?.name}» و تمام پیام‌ها و دکمه‌های آن حذف می‌شوند.
        </ModalDescription>
      </ModalHeader>
      <ModalFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={deleting}>
          انصراف
        </Button>
        <Button type="button" variant="danger" loading={deleting} onClick={onConfirm}>
          حذف فلو
        </Button>
      </ModalFooter>
    </ModalContent>
  </Modal>
);

// ─── Flow card ────────────────────────────────────────────────────────────────

const FlowCard = ({
  flow,
  busy,
  onDelete,
  onEdit,
  onOpen,
  onToggle,
}: {
  flow: AutomationFlow;
  busy: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onOpen: () => void;
  onToggle: (active: boolean) => void;
}) => {
  const reduce = useReducedMotion();
  const isCommand = flow.triggerType === "command";

  const openFromCard = (event: React.MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, a, input, label, [role='switch']")) return;
    onOpen();
  };

  return (
    <motion.article
      role="link"
      tabIndex={0}
      aria-label={`باز کردن فلو ${flow.name}`}
      layout={!reduce}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
      whileHover={reduce ? undefined : { y: -2 }}
      transition={{ duration: reduce ? 0 : 0.3, ease: luxe }}
      onClick={openFromCard}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer rounded-3xl border border-line bg-surface/35 p-4 shadow-soft transition-colors duration-300 hover:border-accent/30 hover:bg-surface/60 hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 sm:p-5"
    >
      <header className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Icon
            icon={GitBranch}
            tile
            size="sm"
            tone={flow.isActive ? "accent" : "muted"}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">{flow.name}</p>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={flow.isActive ? "success" : "muted"} dot>
                {flow.isActive ? "فعال" : "متوقف"}
              </Badge>
              <span className="text-xs text-muted">
                {isCommand ? flow.triggerKeyword : `«${flow.triggerKeyword}»`}
              </span>
            </div>
          </div>
        </div>
        <Switch
          aria-label={`${flow.isActive ? "توقف" : "فعال‌سازی"} فلو ${flow.name}`}
          checked={flow.isActive}
          disabled={busy}
          onChange={(e) => onToggle(e.target.checked)}
        />
      </header>
      <footer className="mt-4 flex justify-end gap-1 border-t border-line pt-3">
        <Tooltip content="ویرایش" side="top">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onEdit}
            disabled={busy}
            aria-label={`ویرایش فلو ${flow.name}`}
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
            aria-label={`حذف فلو ${flow.name}`}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </Tooltip>
      </footer>
    </motion.article>
  );
};

// ─── FlowsPanel ───────────────────────────────────────────────────────────────

export const FlowsPanel = () => {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const {
    channel: loadedChannel,
    detail,
    items,
    status: flowsStatus,
    error: flowsError,
    setupRequired: flowsSetupRequired,
  } = useAppSelector((state) => state.flows);
  const {
    bot,
    status: connectionStatus,
    error: connectionError,
    setupRequired: connectionSetupRequired,
  } = useAppSelector((state) => state.automations);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editingFlowId, setEditingFlowId] = React.useState<string | null>(null);
  const [deletingFlow, setDeletingFlow] = React.useState<AutomationFlow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [busyFlowId, setBusyFlowId] = React.useState<string | null>(null);
  const [instagramUsername, setInstagramUsername] = React.useState<string | null>(
    null
  );
  const [instagramChecked, setInstagramChecked] = React.useState(false);

  // Which channel's flows are on screen. A search param rather than useState, so
  // a channel can be linked to and survives a refresh — the same choice the
  // keyword panel makes.
  const activeChannel = useActiveChannel("telegram");
  const isInstagram = activeChannel === "instagram";
  const instagramConnected = Boolean(instagramUsername);
  const connected = isInstagram ? instagramConnected : Boolean(bot);

  // The list belongs to the channel it was fetched for. Until the two agree the
  // panel is still loading, not empty.
  const listReady = flowsStatus === "succeeded" && loadedChannel === activeChannel;
  // A failed load is not a pending one: the error alert answers for it, and a
  // skeleton that never resolves would say nothing.
  const listPending =
    flowsStatus === "idle" ||
    flowsStatus === "loading" ||
    (flowsStatus === "succeeded" && loadedChannel !== activeChannel);
  const loading =
    listPending ||
    connectionStatus === "idle" ||
    connectionStatus === "loading" ||
    (isInstagram && !instagramChecked);
  const canCreate =
    listReady &&
    connected &&
    !flowsSetupRequired &&
    (isInstagram || !connectionSetupRequired);

  const refreshInstagram = React.useCallback(async () => {
    try {
      const response = await fetch("/api/instagram/status", {
        cache: "no-store",
      });
      if (response.ok) {
        const data = (await response.json()) as {
          account?: { username?: string } | null;
        };
        setInstagramUsername(data.account?.username ?? null);
      }
    } catch {
      // Leaves the chip disconnected, which is the safe reading of silence.
    } finally {
      setInstagramChecked(true);
    }
  }, []);

  React.useEffect(() => {
    void dispatch(loadFlows(activeChannel));
  }, [activeChannel, dispatch]);

  React.useEffect(() => {
    if (connectionStatus === "idle") void dispatch(loadAutomations());
  }, [connectionStatus, dispatch]);

  React.useEffect(() => {
    void refreshInstagram();
  }, [refreshInstagram]);

  React.useEffect(() => {
    const refreshConnection = () => {
      void dispatch(loadFlows(activeChannel));
      void dispatch(loadAutomations());
      void refreshInstagram();
    };
    window.addEventListener(
      CHANNEL_CONNECTION_CHANGED_EVENT,
      refreshConnection
    );
    return () =>
      window.removeEventListener(
        CHANNEL_CONNECTION_CHANGED_EVENT,
        refreshConnection
      );
  }, [activeChannel, dispatch, refreshInstagram]);

  const openEdit = async (flow: AutomationFlow) => {
    setBusyFlowId(flow.id);
    const result = await dispatch(loadFlowDetail(flow.id));
    setBusyFlowId(null);

    if (loadFlowDetail.fulfilled.match(result)) {
      setEditingFlowId(flow.id);
      return;
    }

    toast({
      title: "اطلاعات فلو بارگذاری نشد",
      description: errorMessage(result.payload),
      variant: "error",
    });
  };

  const toggleFlow = async (flow: AutomationFlow, active: boolean) => {
    setBusyFlowId(flow.id);
    const result = await dispatch(updateFlow({ id: flow.id, changes: { isActive: active } }));
    setBusyFlowId(null);
    if (updateFlow.fulfilled.match(result)) {
      if (!result.payload.commandsSynced)
        toast({ title: "منوی فرمان‌های تلگرام به‌روز نشد؛ اتصال را بررسی کنید.", variant: "warning" });
    } else {
      toast({ title: errorMessage(result.payload), variant: "error" });
    }
  };

  const confirmDelete = async () => {
    if (!deletingFlow) return;
    setDeleting(true);
    const result = await dispatch(deleteFlow(deletingFlow.id));
    setDeleting(false);
    if (deleteFlow.fulfilled.match(result)) {
      toast({ title: "فلو حذف شد." });
      if (!result.payload.commandsSynced)
        toast({ title: "منوی فرمان‌های تلگرام به‌روز نشد؛ اتصال را بررسی کنید.", variant: "warning" });
      setDeletingFlow(null);
    } else {
      toast({ title: errorMessage(result.payload), variant: "error" });
    }
  };

  return (
    <div>
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-black">فلوها</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
            {isInstagram
              ? "مکالمه‌های چندمرحله‌ای دایرکت اینستاگرام را روی یک بوم دیداری بسازید؛ هر پیام تا سه دکمه دارد و هر دکمه به پیام بعدی، لینک یا پایان مسیر می‌رود."
              : "مکالمه‌های چندمرحله‌ای ربات را روی یک بوم دیداری بسازید و هر دکمه را به پیام بعدی، لینک یا پایان مسیر متصل کنید."}
          </p>
        </div>
        <Button
          type="button"
          startIcon={<Plus className="size-4" />}
          onClick={() => setCreateOpen(true)}
          disabled={!canCreate}
          className="w-full shrink-0 sm:w-auto"
        >
          فلو جدید
        </Button>
      </header>

      <ChannelTabs
        active={activeChannel}
        className="mt-6"
        availability={{
          telegram: { connected: Boolean(bot) },
          instagram: { supported: false },
        }}
      />

      <div className="mt-8 space-y-5">
        {(flowsSetupRequired || (!isInstagram && connectionSetupRequired)) && (
          <Alert
            variant="warning"
            title="راه‌اندازی فلوها کامل نشده است"
            description={
              flowsError ??
              connectionError ??
              "اسکریپت پایگاه داده فلوها را اجرا کنید، سپس دوباره بررسی کنید."
            }
          >
            <Button
              type="button"
              variant="link"
              className="mt-2"
              onClick={() => {
                void dispatch(loadFlows(activeChannel));
                void dispatch(loadAutomations());
              }}
            >
              بررسی دوباره
            </Button>
          </Alert>
        )}

        {!flowsSetupRequired && flowsStatus === "failed" && (
          <Alert
            variant="error"
            title="فلوها بارگذاری نشدند"
            description={flowsError ?? "اتصال اینترنت را بررسی کنید."}
          >
            <Button
              type="button"
              variant="link"
              className="mt-2"
              onClick={() => void dispatch(loadFlows(activeChannel))}
            >
              تلاش دوباره
            </Button>
          </Alert>
        )}

        {!isInstagram && !connectionSetupRequired && connectionStatus === "failed" && (
          <Alert
            variant="error"
            title="وضعیت ربات بررسی نشد"
            description={
              connectionError ??
              "اتصال اینترنت را بررسی کنید و دوباره تلاش کنید."
            }
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

        {!loading &&
          !connected &&
          (isInstagram ? <InstagramRequiredNotice /> : <BotRequiredNotice />)}

        {connected && (
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface/30 px-4 py-3 sm:flex-row sm:items-center">
            <span className="flex min-w-0 items-center gap-3">
              <Icon
                icon={isInstagram ? TbBrandInstagram : GitBranch}
                tile
                size="xs"
                tone="accent"
              />
              <span className="min-w-0">
                <span className="block text-xs text-muted">
                  {isInstagram ? "حساب متصل" : "ربات متصل"}
                </span>
                <span
                  dir="ltr"
                  className="block truncate text-start text-sm font-medium"
                >
                  @{isInstagram ? instagramUsername : bot?.username}
                </span>
              </span>
            </span>
            <span className="text-xs leading-6 text-muted sm:ms-auto">
              {isInstagram
                ? "هر فلو با یک کلیدواژه در دایرکت شروع می‌شود."
                : "هر فلو با یک فرمان یا کلیدواژه شروع می‌شود."}
            </span>
          </div>
        )}

        {loading && (
          <div className="space-y-4" role="status" aria-label="در حال بارگذاری فلوها">
            {[0, 1].map((item) => (
              <div
                key={item}
                className="rounded-3xl border border-line bg-surface/35 p-5"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="size-9 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  <Skeleton className="h-6 w-11 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && listReady && connected && items.length === 0 && (
          <section className="rounded-3xl border border-dashed border-line bg-surface/25 px-6 py-14 text-center">
            <Icon
              icon={isInstagram ? TbBrandInstagram : GitBranch}
              tile
              size="lg"
              tone="accent"
            />
            <h2 className="mt-5 text-lg font-bold">اولین فلو را بسازید</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-7 text-muted">
              {isInstagram
                ? "مثلاً کلیدواژهٔ «خرید» را به یک پیام خوش‌آمدگویی با سه دکمه وصل کنید و برای هر انتخاب مشتری یک مسیر جدا بسازید."
                : "مثلاً فرمان /start را به یک پیام خوش‌آمدگویی وصل کنید و برای هر انتخاب مشتری یک مسیر جدا بسازید."}
            </p>
            <Button
              type="button"
              className="mt-6"
              startIcon={<Plus className="size-4" />}
              onClick={() => setCreateOpen(true)}
            >
              ساخت اولین فلو
            </Button>
          </section>
        )}

        {!loading && listReady && items.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted">{fa(items.length)} فلو</span>
            </div>
            <AnimatePresence initial={false}>
              {items.map((flow) => (
                <FlowCard
                  key={flow.id}
                  flow={flow}
                  busy={busyFlowId === flow.id}
                  onOpen={() => router.push(`/dashboard/flow/${flow.id}`)}
                  onEdit={() => void openEdit(flow)}
                  onDelete={() => setDeletingFlow(flow)}
                  onToggle={(active) => void toggleFlow(flow, active)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <FlowEditorModal
        channel={activeChannel}
        flow={null}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(flow) => router.push(`/dashboard/flow/${flow.id}`)}
      />
      <FlowEditorModal
        channel={activeChannel}
        flow={
          editingFlowId && detail?.id === editingFlowId ? detail : null
        }
        open={Boolean(editingFlowId && detail?.id === editingFlowId)}
        onOpenChange={(open) => {
          if (!open) setEditingFlowId(null);
        }}
      />
      <DeleteFlowModal
        flow={deletingFlow}
        deleting={deleting}
        onConfirm={() => void confirmDelete()}
        onOpenChange={(o) => { if (!o) setDeletingFlow(null); }}
      />
    </div>
  );
};
