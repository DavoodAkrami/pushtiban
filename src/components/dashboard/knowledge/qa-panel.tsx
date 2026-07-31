"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { HelpCircle, Pencil, Plus, Trash2 } from "lucide-react";
import { luxe } from "@/components/motion/reveal";
import { DashboardPageHeader } from "@/components/dashboard/page-header";
import {
  CATEGORY_OPTIONS,
  categoryLabel,
} from "@/components/dashboard/knowledge/categories";
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
import { Select } from "@/components/ui/select";
import { Icon } from "@/components/ui/icon";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { fa } from "@/lib/utils";

export type Qa = {
  id: string;
  category: string;
  question: string;
  answer: string;
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
      <DashboardPageHeader
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

export const QaPanel = () => (
  <QaEditor />
);
