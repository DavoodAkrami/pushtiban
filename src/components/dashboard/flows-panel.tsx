"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Bot,
  Command,
  GitBranch,
  Hash,
  Plus,
  Trash2,
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
import { Select, type SelectOption } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { FlowBuilder } from "@/components/dashboard/flow-builder";
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
  FLOW_NODE_MESSAGE_MAX_LENGTH,
  type AutomationFlow,
  type AutomationFlowDetail,
} from "@/lib/flows";
import { fa } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  createFlow,
  deleteFlow,
  loadFlowDetail,
  loadFlows,
  updateFlow,
  type FlowRequestError,
} from "@/store/slices/flows-slice";
import type { AutomationBot } from "@/lib/automations";

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

// ─── Create flow modal ────────────────────────────────────────────────────────

const CreateFlowModal = ({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (flow: AutomationFlow) => void;
}) => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const [triggerType, setTriggerType] = React.useState<"keyword" | "command">("command");
  const [keyword, setKeyword] = React.useState("/");
  const [commandDescription, setCommandDescription] = React.useState("");
  const [name, setName] = React.useState("");
  const [rootMessage, setRootMessage] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) return;
    setTriggerType("command");
    setKeyword("/");
    setCommandDescription("");
    setName("");
    setRootMessage("");
    setErrors({});
  }, [open]);

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
    else if (rootMessage.trim().length > FLOW_NODE_MESSAGE_MAX_LENGTH)
      errs.rootMessage = "متن پیام حداکثر ۴۰۹۶ نویسه است.";

    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSaving(true);
    const result = await dispatch(
      createFlow({
        triggerType,
        triggerKeyword: cleanedKeyword,
        name: name.trim(),
        commandDescription: triggerType === "command" ? commandDescription.trim() : undefined,
        rootMessage: rootMessage.trim(),
      })
    );
    setSaving(false);

    if (createFlow.fulfilled.match(result)) {
      toast({ title: "فلو ساخته شد." });
      if (!result.payload.commandsSynced)
        toast({ title: "منوی فرمان‌های تلگرام به‌روز نشد؛ اتصال را بررسی کنید.", variant: "warning" });
      onCreated(result.payload.flow);
      onOpenChange(false);
    } else {
      toast({ title: errorMessage(result.payload), variant: "error" });
    }
  };

  return (
    <Modal open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <ModalContent size="lg" closeDisabled={saving} className="flex max-h-[calc(100dvh-2.5rem)] flex-col overflow-hidden p-0">
        <ModalHeader className="mb-0 shrink-0 px-5 pb-4 pt-5 sm:px-7 sm:pb-5 sm:pt-7">
          <ModalTitle>فلو جدید</ModalTitle>
          <ModalDescription>
            یک مکالمه تعاملی با دکمه و پیام‌های زنجیره‌ای بسازید.
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
              hint="این پیام وقتی کاربر محرک را ارسال کند نمایش داده می‌شود."
              placeholder="سلام! چطور می‌تونم کمکت کنم؟"
              value={rootMessage}
              onChange={(e) => { setRootMessage(e.target.value); if (errors.rootMessage) setErrors((p) => ({ ...p, rootMessage: "" })); }}
              error={errors.rootMessage}
              maxLength={FLOW_NODE_MESSAGE_MAX_LENGTH}
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
              ساخت فلو
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
  onToggle,
}: {
  flow: AutomationFlow;
  busy: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onToggle: (active: boolean) => void;
}) => {
  const reduce = useReducedMotion();
  const isCommand = flow.triggerType === "command";

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
      <footer className="mt-4 flex items-center gap-2 border-t border-line pt-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onEdit}
          disabled={busy}
        >
          ویرایش فلو
        </Button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="ms-auto rounded-full p-1.5 text-muted hover:text-danger transition-colors disabled:opacity-40"
          aria-label={`حذف فلو ${flow.name}`}
        >
          <Trash2 className="size-4" />
        </button>
      </footer>
    </motion.article>
  );
};

// ─── FlowsPanel ───────────────────────────────────────────────────────────────

export const FlowsPanel = ({ bot }: { bot: AutomationBot | null }) => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const { items, status, error, setupRequired } = useAppSelector((s) => s.flows);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [deletingFlow, setDeletingFlow] = React.useState<AutomationFlow | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [busyFlowId, setBusyFlowId] = React.useState<string | null>(null);
  const [editingFlow, setEditingFlow] = React.useState<AutomationFlowDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = React.useState(false);

  const loading = status === "idle" || status === "loading";

  React.useEffect(() => {
    if (status === "idle") void dispatch(loadFlows());
  }, [dispatch, status]);

  const openEdit = async (flow: AutomationFlow) => {
    setLoadingDetail(true);
    const result = await dispatch(loadFlowDetail(flow.id));
    setLoadingDetail(false);
    if (loadFlowDetail.fulfilled.match(result)) {
      setEditingFlow(result.payload.flow);
    } else {
      toast({ title: "فلو بارگذاری نشد؛ دوباره تلاش کنید.", variant: "error" });
    }
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

  if (editingFlow) {
    return (
      <FlowBuilder
        flow={editingFlow}
        onClose={() => setEditingFlow(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold">فلوهای مکالمه</h3>
          <p className="mt-0.5 text-xs text-muted">
            پیام‌های تعاملی با دکمه و مسیرهای زنجیره‌ای
          </p>
        </div>
        {bot && status === "succeeded" && (
          <Button
            type="button"
            size="sm"
            startIcon={<Plus className="size-4" />}
            onClick={() => setCreateOpen(true)}
            disabled={loadingDetail}
          >
            فلو جدید
          </Button>
        )}
      </div>

      {setupRequired && (
        <Alert
          variant="warning"
          title="راه‌اندازی ناقص"
          description={error ?? "اسکریپت پایگاه داده را اجرا کنید."}
        >
          <Button type="button" variant="link" className="mt-2" onClick={() => void dispatch(loadFlows())}>
            بررسی دوباره
          </Button>
        </Alert>
      )}

      {!setupRequired && status === "failed" && (
        <Alert variant="error" title="فلوها بارگذاری نشدند" description={error ?? "اتصال اینترنت را بررسی کنید."}>
          <Button type="button" variant="link" className="mt-2" onClick={() => void dispatch(loadFlows())}>
            تلاش دوباره
          </Button>
        </Alert>
      )}

      {loading && (
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-3xl border border-line bg-surface/35 p-5">
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

      {!loading && status === "succeeded" && bot && items.length === 0 && (
        <section className="rounded-3xl border border-dashed border-line bg-surface/25 px-6 py-10 text-center">
          <Icon icon={GitBranch} tile size="md" tone="accent" />
          <h4 className="mt-4 text-base font-bold">اولین فلو را بسازید</h4>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-7 text-muted">
            مثلاً فرمان /start را به یک پیام خوش‌آمدگویی با دکمه‌های انتخابی وصل کنید.
          </p>
          <Button type="button" className="mt-6" startIcon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
            ساخت اولین فلو
          </Button>
        </section>
      )}

      {!loading && status === "succeeded" && items.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">{fa(items.length)} فلو</span>
          </div>
          <AnimatePresence initial={false}>
            {items.map((flow) => (
              <FlowCard
                key={flow.id}
                flow={flow}
                busy={busyFlowId === flow.id || loadingDetail}
                onEdit={() => void openEdit(flow)}
                onDelete={() => setDeletingFlow(flow)}
                onToggle={(active) => void toggleFlow(flow, active)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      <CreateFlowModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {}}
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
