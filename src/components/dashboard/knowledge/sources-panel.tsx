"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ChevronDown,
  FileText,
  Globe,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { luxe } from "@/components/motion/reveal";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import {
  CATEGORY_OPTIONS,
  categoryLabel,
} from "@/components/dashboard/knowledge/categories";
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
import { Select } from "@/components/ui/select";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import {
  CHUNKS_MAX_PER_USER,
  SOURCE_TEXT_MAX_CHARS,
  SOURCE_TITLE_MAX_LENGTH,
} from "@/lib/ai/limits";
import { cn, fa } from "@/lib/utils";

type SourceType = "text" | "file" | "url";
type SourceStatus = "processing" | "ready" | "error";

type KnowledgeSource = {
  id: string;
  title: string;
  source_type: SourceType;
  status: SourceStatus;
  created_at: string;
  chunkCount: number;
};

type SourcesResponse = {
  sources?: KnowledgeSource[];
  usedChunks?: number;
  maxChunks?: number;
  setupRequired?: boolean;
  error?: string;
};

const TYPE_META: Record<SourceType, { label: string; icon: typeof FileText }> = {
  text: { label: "متن", icon: FileText },
  url: { label: "لینک", icon: Globe },
  file: { label: "فایل", icon: Upload },
};

const STATUS_META: Record<
  SourceStatus,
  { label: string; variant: "success" | "warning" | "error" }
> = {
  ready: { label: "آماده", variant: "success" },
  processing: { label: "در حال پردازش", variant: "warning" },
  error: { label: "خطا", variant: "error" },
};

// Only formats we can read as plain text in the browser. PDF and Word need a
// server-side parser, which this build deliberately does not carry.
const ACCEPTED_FILES = ".txt,.md,.markdown,.csv";

type Chunk = {
  id: string;
  chunk_index: number;
  content: string;
  category: string;
};

/** One editable chunk. Saving re-embeds it server-side. */
const ChunkRow = ({
  chunk,
  onSaved,
  onDeleted,
}: {
  chunk: Chunk;
  onSaved: (content: string) => void;
  onDeleted: () => void;
}) => {
  const { toast } = useToast();
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(chunk.content);
  const [saving, setSaving] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);

  const save = async () => {
    const content = draft.trim();
    if (!content) {
      toast({ title: "متن بخش نمی‌تواند خالی باشد.", variant: "error" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/ai/rag/chunks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: chunk.id, content }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "ذخیره بخش ناموفق بود.");
      onSaved(content);
      setEditing(false);
      toast({
        title: "بخش ذخیره شد",
        description: "امبدینگ این بخش دوباره ساخته شد تا جستجو هماهنگ بماند.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "ذخیره بخش ناموفق بود",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setRemoving(true);
    try {
      const res = await fetch("/api/ai/rag/chunks", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: chunk.id }),
      });
      if (!res.ok) throw new Error();
      onDeleted();
      toast({ title: "بخش حذف شد", variant: "success" });
    } catch {
      toast({ title: "حذف بخش ناموفق بود", variant: "error" });
      setRemoving(false);
    }
  };

  return (
    <li className="rounded-xl border border-line bg-background/40 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Badge variant="muted" className="text-[10px]">
          بخش {fa(chunk.chunk_index + 1)}
        </Badge>
        <Badge variant="muted" className="text-[10px]">
          {categoryLabel(chunk.category)}
        </Badge>
        <div className="ms-auto flex gap-1">
          {editing ? (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft(chunk.content);
                  setEditing(false);
                }}
                disabled={saving}
              >
                انصراف
              </Button>
              <Button
                type="button"
                size="sm"
                loading={saving}
                onClick={() => void save()}
              >
                ذخیره
              </Button>
            </>
          ) : (
            <>
              <Tooltip content="ویرایش" side="top">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => setEditing(true)}
                  disabled={removing}
                  aria-label={`ویرایش بخش ${fa(chunk.chunk_index + 1)}`}
                >
                  <Pencil className="size-4" aria-hidden />
                </Button>
              </Tooltip>
              <Tooltip content="حذف بخش" side="top">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => void remove()}
                  loading={removing}
                  className="hover:text-danger"
                  aria-label={`حذف بخش ${fa(chunk.chunk_index + 1)}`}
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </Tooltip>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          rows={6}
          disabled={saving}
          aria-label={`متن بخش ${fa(chunk.chunk_index + 1)}`}
        />
      ) : (
        <p className="whitespace-pre-wrap text-xs leading-6 text-muted">
          {chunk.content}
        </p>
      )}
    </li>
  );
};

const SourceRow = ({
  source,
  busy,
  onDelete,
  onRenamed,
  onChunkCountChange,
}: {
  source: KnowledgeSource;
  busy: boolean;
  onDelete: () => void;
  onRenamed: (title: string) => void;
  onChunkCountChange: (delta: number) => void;
}) => {
  const reduce = useReducedMotion();
  const { toast } = useToast();
  const type = TYPE_META[source.source_type] ?? TYPE_META.text;
  const status = STATUS_META[source.status] ?? STATUS_META.ready;

  const [open, setOpen] = React.useState(false);
  const [chunks, setChunks] = React.useState<Chunk[] | null>(null);
  const [loadingChunks, setLoadingChunks] = React.useState(false);
  const [renaming, setRenaming] = React.useState(false);
  const [titleDraft, setTitleDraft] = React.useState(source.title);
  const [savingTitle, setSavingTitle] = React.useState(false);

  const loadChunks = async () => {
    setLoadingChunks(true);
    try {
      const res = await fetch(
        `/api/ai/rag/chunks?sourceId=${encodeURIComponent(source.id)}`
      );
      const data = (await res.json()) as { chunks?: Chunk[]; error?: string };
      if (!res.ok) throw new Error(data.error);
      setChunks(data.chunks ?? []);
    } catch {
      toast({ title: "بارگذاری بخش‌ها ناموفق بود", variant: "error" });
    } finally {
      setLoadingChunks(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && chunks === null) void loadChunks();
  };

  const saveTitle = async () => {
    const title = titleDraft.trim();
    if (!title || title === source.title) {
      setRenaming(false);
      setTitleDraft(source.title);
      return;
    }
    setSavingTitle(true);
    try {
      const res = await fetch("/api/ai/rag/sources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: source.id, title }),
      });
      const data = (await res.json()) as { error?: string; reindexed?: number };
      if (!res.ok) throw new Error(data.error || "تغییر عنوان ناموفق بود.");
      onRenamed(title);
      setRenaming(false);
      toast({
        title: "عنوان تغییر کرد",
        description: data.reindexed
          ? `${fa(data.reindexed)} بخش با عنوان تازه دوباره ایندکس شد.`
          : undefined,
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "تغییر عنوان ناموفق بود",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setSavingTitle(false);
    }
  };

  return (
    <motion.li
      layout={!reduce}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
      transition={{ duration: reduce ? 0 : 0.3, ease: luxe }}
      className="rounded-2xl border border-line bg-surface/40 p-3"
    >
      <div className="flex items-start gap-3">
        <Icon icon={type.icon} tile size="xs" tone="muted" className="shrink-0" />

        <div className="min-w-0 flex-1">
          {renaming ? (
            <div className="flex flex-wrap items-end gap-2">
              <Input
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                maxLength={SOURCE_TITLE_MAX_LENGTH}
                disabled={savingTitle}
                aria-label="عنوان منبع"
                className="min-w-40 flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTitleDraft(source.title);
                  setRenaming(false);
                }}
                disabled={savingTitle}
              >
                انصراف
              </Button>
              <Button
                type="button"
                size="sm"
                loading={savingTitle}
                onClick={() => void saveTitle()}
              >
                ذخیره
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={toggle}
              aria-expanded={open}
              className="flex w-full items-center gap-2 rounded-lg text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <motion.span
                animate={{ rotate: open ? 180 : 0 }}
                transition={{ duration: reduce ? 0 : 0.2, ease: luxe }}
                className="shrink-0 text-muted"
              >
                <ChevronDown className="size-4" aria-hidden />
              </motion.span>
              <span className="truncate text-sm font-medium">{source.title}</span>
            </button>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant="muted" className="text-[10px]">
              {type.label}
            </Badge>
            <Badge variant={status.variant} dot className="text-[10px]">
              {status.label}
            </Badge>
            <span className="text-[11px] text-muted">
              {fa(source.chunkCount)} بخش
            </span>
          </div>
        </div>

        {!renaming && (
          <div className="flex shrink-0 gap-1">
            <Tooltip content="تغییر عنوان" side="top">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setRenaming(true)}
                disabled={busy}
                aria-label={`تغییر عنوان ${source.title}`}
              >
                <Pencil className="size-4" aria-hidden />
              </Button>
            </Tooltip>
            <Tooltip content="حذف منبع" side="top">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={onDelete}
                disabled={busy}
                className="hover:text-danger"
                aria-label={`حذف ${source.title}`}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </Tooltip>
          </div>
        )}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.24, ease: luxe }}
            className="overflow-hidden"
          >
            <div className="mt-3 border-t border-line pt-3">
              <p className="mb-2.5 text-[11px] leading-5 text-muted">
                این‌ها همان تکه‌هایی هستند که دستیار در آن‌ها جستجو می‌کند. با
                ویرایش هر بخش، امبدینگ آن دوباره ساخته می‌شود.
              </p>

              {loadingChunks && (
                <div role="status" aria-label="در حال بارگذاری بخش‌ها">
                  <SkeletonText lines={3} />
                </div>
              )}

              {!loadingChunks && chunks?.length === 0 && (
                <p className="text-xs text-muted">
                  این منبع هیچ بخشی ندارد.
                </p>
              )}

              {!loadingChunks && chunks && chunks.length > 0 && (
                <ul className="space-y-2">
                  {chunks.map((chunk) => (
                    <ChunkRow
                      key={chunk.id}
                      chunk={chunk}
                      onSaved={(content) =>
                        setChunks((prev) =>
                          prev?.map((c) =>
                            c.id === chunk.id ? { ...c, content } : c
                          ) ?? prev
                        )
                      }
                      onDeleted={() => {
                        setChunks(
                          (prev) => prev?.filter((c) => c.id !== chunk.id) ?? prev
                        );
                        onChunkCountChange(-1);
                      }}
                    />
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.li>
  );
};

const AddSourceModal = ({
  open,
  saving,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: {
    title: string;
    text: string;
    url: string;
    sourceType: SourceType;
    category: string;
  }) => Promise<boolean>;
}) => {
  const { toast } = useToast();
  const [mode, setMode] = React.useState<"text" | "url">("text");
  const [title, setTitle] = React.useState("");
  const [text, setText] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [category, setCategory] = React.useState("general");
  const [reading, setReading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setMode("text");
    setTitle("");
    setText("");
    setUrl("");
    setCategory("general");
  }, [open]);

  const readFile = async (file: File) => {
    setReading(true);
    try {
      const content = await file.text();
      if (!content.trim()) {
        toast({ title: "این فایل خالی است.", variant: "error" });
        return;
      }
      setText(content.slice(0, SOURCE_TEXT_MAX_CHARS));
      if (!title.trim()) setTitle(file.name.replace(/\.[^.]+$/, ""));
      toast({
        title: "فایل خوانده شد",
        description: "متن در کادر زیر قرار گرفت؛ می‌توانید ویرایشش کنید.",
        variant: "success",
      });
    } catch {
      toast({ title: "خواندن فایل ناموفق بود.", variant: "error" });
    } finally {
      setReading(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const ok = await onSave({
      title: title.trim(),
      text,
      url: url.trim(),
      sourceType: mode,
      category,
    });
    if (ok) onOpenChange(false);
  };

  const canSubmit =
    Boolean(title.trim() || mode === "url") &&
    (mode === "url" ? Boolean(url.trim()) : Boolean(text.trim()));

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
    >
      <ModalContent
        size="lg"
        closeDisabled={saving}
        className="max-h-[calc(100dvh-2.5rem)] overflow-hidden p-0"
      >
        <form onSubmit={submit} className="flex max-h-[calc(100dvh-2.5rem)] flex-col">
          <div className="shrink-0 p-7 pb-0">
            <ModalHeader>
              <ModalTitle>منبع دانش جدید</ModalTitle>
              <ModalDescription>
                متن بلند، راهنما یا صفحهٔ سایت‌تان را اضافه کنید؛ دستیار وقتی
                پرسش مرتبطی برسد بخش‌های مرتبط را پیدا می‌کند.
              </ModalDescription>
            </ModalHeader>
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-7 pb-2">
            <div
              role="radiogroup"
              aria-label="نوع منبع"
              className="grid grid-cols-2 gap-1 rounded-2xl bg-background/60 p-1"
            >
              {(
                [
                  { value: "text", label: "متن یا فایل", icon: FileText },
                  { value: "url", label: "نشانی صفحه", icon: Globe },
                ] as const
              ).map((option) => {
                const selected = mode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={saving}
                    onClick={() => setMode(option.value)}
                    className={cn(
                      "flex h-10 items-center justify-center gap-2 rounded-xl text-sm transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                      selected
                        ? "bg-card font-medium text-foreground"
                        : "text-muted hover:text-foreground"
                    )}
                  >
                    <option.icon className="size-4" aria-hidden />
                    {option.label}
                  </button>
                );
              })}
            </div>

            <Input
              label="عنوان"
              hint={
                mode === "url"
                  ? "خالی بگذارید تا از عنوان خود صفحه برداشته شود."
                  : "برای شناسایی این منبع در فهرست."
              }
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={SOURCE_TITLE_MAX_LENGTH}
              disabled={saving}
            />

            {mode === "url" ? (
              <Input
                label="نشانی صفحه"
                placeholder="https://example.com/faq"
                dir="ltr"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                startIcon={<Link2 />}
                disabled={saving}
                required
              />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <label
                    className={cn(
                      "inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-line px-4 text-sm text-muted transition-colors hover:bg-card/60 hover:text-foreground",
                      (saving || reading) && "pointer-events-none opacity-60"
                    )}
                  >
                    {reading ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      <Upload className="size-4" aria-hidden />
                    )}
                    خواندن از فایل
                    <input
                      type="file"
                      accept={ACCEPTED_FILES}
                      className="sr-only"
                      disabled={saving || reading}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = "";
                        if (file) void readFile(file);
                      }}
                    />
                  </label>
                  <span className="text-xs text-muted">
                    فایل‌های متنی: TXT، MD، CSV
                  </span>
                </div>

                <Textarea
                  label="متن سند"
                  placeholder="متن راهنما، شرایط ارسال، توضیح محصول…"
                  rows={7}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  maxLength={SOURCE_TEXT_MAX_CHARS}
                  disabled={saving}
                  required
                />
              </>
            )}

            <Select
              label="دسته"
              hint="به رتبه‌بندی نتایج کمک می‌کند وقتی پرسش مشتری در همین دسته باشد."
              options={CATEGORY_OPTIONS}
              value={category}
              onChange={setCategory}
              disabled={saving}
            />
          </div>

          <div className="shrink-0 border-t border-line px-7 pb-7 pt-4">
            <ModalFooter className="mt-0">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                انصراف
              </Button>
              <Button type="submit" loading={saving} disabled={!canSubmit}>
                افزودن منبع
              </Button>
            </ModalFooter>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
};

export const SourcesEditor = () => {
  const { toast } = useToast();
  const [sources, setSources] = React.useState<KnowledgeSource[]>([]);
  const [usedChunks, setUsedChunks] = React.useState(0);
  const [maxChunks, setMaxChunks] = React.useState(CHUNKS_MAX_PER_USER);
  const [loading, setLoading] = React.useState(true);
  const [setupRequired, setSetupRequired] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [deleting, setDeleting] = React.useState<KnowledgeSource | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await fetch("/api/ai/rag/sources");
      const data = (await res.json()) as SourcesResponse;
      if (data.setupRequired) {
        setSetupRequired(true);
        setSources([]);
        return;
      }
      if (!res.ok) throw new Error(data.error);
      setSources(data.sources ?? []);
      setUsedChunks(data.usedChunks ?? 0);
      setMaxChunks(data.maxChunks ?? CHUNKS_MAX_PER_USER);
    } catch {
      toast({ title: "بارگذاری منابع ناموفق بود", variant: "error" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const addSource = async (draft: {
    title: string;
    text: string;
    url: string;
    sourceType: SourceType;
    category: string;
  }) => {
    setSaving(true);
    try {
      const res = await fetch("/api/ai/rag/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = (await res.json()) as { chunks?: number; error?: string };
      if (!res.ok) throw new Error(data.error || "افزودن منبع ناموفق بود.");
      toast({
        title: "منبع اضافه شد",
        description: `${fa(data.chunks ?? 0)} بخش ساخته و ذخیره شد.`,
        variant: "success",
      });
      await load();
      return true;
    } catch (error) {
      toast({
        title: "افزودن منبع ناموفق بود",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const removeSource = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      const res = await fetch("/api/ai/rag/sources", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleting.id }),
      });
      if (!res.ok) throw new Error();
      setSources((prev) => prev.filter((s) => s.id !== deleting.id));
      setUsedChunks((prev) => Math.max(0, prev - deleting.chunkCount));
      toast({ title: "منبع حذف شد", variant: "success" });
      setDeleting(null);
    } catch {
      toast({ title: "حذف منبع ناموفق بود", variant: "error" });
    } finally {
      setDeleteBusy(false);
    }
  };

  const quotaRatio = maxChunks > 0 ? usedChunks / maxChunks : 0;

  return (
    <>
      <DashboardPageHeader
        title="فایل‌ها و لینک‌ها"
        description="سندهای بلند کسب‌وکارتان. برخلاف اطلاعات پایه که همیشه فرستاده می‌شوند، این‌ها فقط وقتی پرسش مرتبطی برسد جستجو و بازیابی می‌شوند."
        icon={FileText}
        count={sources.length}
        loading={loading}
        action={
          <Button
            type="button"
            startIcon={<Plus className="size-4" />}
            onClick={() => setAddOpen(true)}
            disabled={setupRequired}
            className="w-full sm:w-auto"
          >
            منبع جدید
          </Button>
        }
      />

      <div className="space-y-4">
        {setupRequired && (
          <Alert
            variant="warning"
            title="راه‌اندازی پایگاه دانش کامل نشده است"
            description="اسکریپت rag.sql را در Supabase اجرا کنید تا جدول منابع ساخته شود."
          />
        )}

        {!loading && !setupRequired && quotaRatio >= 0.8 && (
          <Alert
            variant={quotaRatio >= 1 ? "error" : "warning"}
            title={
              quotaRatio >= 1
                ? "سهمیه پایگاه دانش پر شده است"
                : "سهمیه پایگاه دانش رو به پایان است"
            }
            description={`${fa(usedChunks)} از ${fa(
              maxChunks
            )} بخش استفاده شده؛ برای افزودن منبع تازه، سندهای قدیمی را حذف کنید.`}
          />
        )}

        {loading && (
          <div role="status" aria-label="در حال بارگذاری منابع" className="space-y-3">
            {[0, 1].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-line bg-surface/40 p-3"
              >
                <Skeleton className="h-4 w-40" />
                <SkeletonText className="mt-3" lines={1} />
              </div>
            ))}
          </div>
        )}

        {!loading && !setupRequired && sources.length === 0 && (
          <section className="rounded-3xl border border-dashed border-line bg-surface/25 px-6 py-14 text-center">
            <Icon icon={FileText} tile size="lg" tone="accent" />
            <h2 className="mt-5 text-lg font-bold">اولین منبع را اضافه کنید</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-7 text-muted">
              راهنمای محصول، شرایط ارسال یا صفحهٔ پرسش‌های متداول سایت‌تان را
              اضافه کنید تا دستیار بتواند از آن پاسخ بسازد.
            </p>
            <Button
              type="button"
              className="mt-7"
              startIcon={<Plus className="size-4" />}
              onClick={() => setAddOpen(true)}
            >
              افزودن منبع
            </Button>
          </section>
        )}

        {!loading && sources.length > 0 && (
          <>
            <ul className="space-y-2">
              <AnimatePresence initial={false}>
                {sources.map((source) => (
                  <SourceRow
                    key={source.id}
                    source={source}
                    busy={deleteBusy}
                    onDelete={() => setDeleting(source)}
                    onRenamed={(title) =>
                      setSources((prev) =>
                        prev.map((s) =>
                          s.id === source.id ? { ...s, title } : s
                        )
                      )
                    }
                    onChunkCountChange={(delta) => {
                      setSources((prev) =>
                        prev.map((s) =>
                          s.id === source.id
                            ? {
                                ...s,
                                chunkCount: Math.max(0, s.chunkCount + delta),
                              }
                            : s
                        )
                      );
                      setUsedChunks((prev) => Math.max(0, prev + delta));
                    }}
                  />
                ))}
              </AnimatePresence>
            </ul>
            <p className="text-xs text-muted">
              {fa(usedChunks)} از {fa(maxChunks)} بخش استفاده شده است.
            </p>
          </>
        )}
      </div>

      <AddSourceModal
        open={addOpen}
        saving={saving}
        onOpenChange={setAddOpen}
        onSave={addSource}
      />

      <Modal
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!deleteBusy && !open) setDeleting(null);
        }}
      >
        <ModalContent size="sm" closeDisabled={deleteBusy}>
          <ModalHeader>
            <ModalTitle>حذف این منبع؟</ModalTitle>
            <ModalDescription>
              «{deleting?.title}» و {fa(deleting?.chunkCount ?? 0)} بخش آن برای
              همیشه حذف می‌شوند و دیگر در پاسخ‌ها استفاده نخواهند شد.
            </ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleting(null)}
              disabled={deleteBusy}
            >
              انصراف
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={deleteBusy}
              onClick={() => void removeSource()}
            >
              حذف
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export const SourcesPanel = () => <SourcesEditor />;
