"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { luxe } from "@/components/motion/reveal";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import {
  CATEGORY_OPTIONS,
  categoryLabel,
} from "@/components/dashboard/knowledge/categories";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { Select } from "@/components/ui/select";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { FACTS_MAX_CHARS, FACTS_MAX_COUNT } from "@/lib/ai/limits";
import { fa } from "@/lib/utils";

export type Fact = {
  id: string;
  category: string;
  factText: string;
};

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

  // Mirrors the trim in retrieveRagContext: facts are sent oldest-first until
  // either cap is reached, so anything past that never reaches the assistant.
  const factsOverCap = React.useMemo(() => {
    if (facts.length > FACTS_MAX_COUNT) return true;
    return (
      facts.reduce((total, item) => total + item.factText.length, 0) >
      FACTS_MAX_CHARS
    );
  }, [facts]);

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
      <DashboardPageHeader
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
        {!loading && factsOverCap && (
          <Alert
            variant="warning"
            title="بخشی از اطلاعات به دستیار فرستاده نمی‌شود"
            description={`این اطلاعات در هر پیام به هوش مصنوعی فرستاده می‌شوند، بنابراین حداکثر ${fa(
              FACTS_MAX_COUNT
            )} مورد (و ${fa(
              FACTS_MAX_CHARS
            )} نویسه) ارسال می‌شود. موارد قدیمی‌تر در اولویت هستند؛ نکته‌های جزئی‌تر را به پرسش و پاسخ منتقل کنید.`}
          />
        )}

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

export const FactsPanel = () => (
  <FactsEditor />
);
