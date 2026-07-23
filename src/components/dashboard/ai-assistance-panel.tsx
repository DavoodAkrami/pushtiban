"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Bot, Plus, Pencil, Trash2, X, Loader2, BookOpen, HelpCircle, type LucideIcon } from "lucide-react";
import { luxe } from "@/components/motion/reveal";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, type SelectOption } from "@/components/ui/select";
import { Switch } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

// ---- Types ----------------------------------------------------------------

type AiAssistancePanelProps = {
  initialEnabled: boolean;
  loadError: boolean;
  providerConfigured: boolean;
  setupRequired: boolean;
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

// ---- Main panel ------------------------------------------------------------

export const AiAssistancePanel = ({
  initialEnabled,
  loadError,
  providerConfigured,
  setupRequired,
}: AiAssistancePanelProps) => {
  const reduce = useReducedMotion() ?? false;
  const { toast } = useToast();
  const [enabled, setEnabled] = React.useState(initialEnabled);
  const [saving, setSaving] = React.useState(false);

  const unavailable = setupRequired || loadError || !providerConfigured;

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
            description="اسکریپت تنظیمات دستیار را اجرا کنید تا کلید روشن و خاموش فعال شود."
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

        {/* AI toggle */}
        <ToggleSection
          enabled={enabled}
          saving={saving}
          unavailable={unavailable}
          reduce={reduce}
          onToggle={updateEnabled}
        />

        <AnimatePresence initial={false}>
          {enabled && (
            <motion.div
              key="knowledge-editors"
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: reduce ? 0 : 0.3, ease: luxe }}
              className="space-y-4"
            >
              <FactsEditor />
              <QaEditor />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

// ---- Toggle section (extracted from original) -----------------------------

type ToggleSectionProps = {
  enabled: boolean;
  saving: boolean;
  unavailable: boolean;
  reduce: boolean;
  onToggle: (next: boolean) => void;
};

const ToggleSection = ({
  enabled,
  saving,
  unavailable,
  reduce,
  onToggle,
}: ToggleSectionProps) => (
  <section
    aria-labelledby="ai-toggle-title"
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
        icon={Bot}
        tile
        size="md"
        tone={enabled ? "accent" : "muted"}
        className="shrink-0"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id="ai-toggle-title" className="font-bold">
            پاسخ‌گویی هوشمند
          </h2>
          <Badge variant={enabled ? "success" : "muted"} dot>
            {enabled ? "روشن" : "خاموش"}
          </Badge>
        </div>
        <p className="mt-2 max-w-xl text-sm leading-7 text-muted">
          وقتی روشن باشد، پیام‌های عادی که با فلو یا کلیدواژه فعال
          تطبیق ندارند به دستیار فرستاده می‌شوند. فرمان‌های تلگرام هرگز
          به هوش مصنوعی فرستاده نمی‌شوند.
        </p>
      </div>
      <Switch
        id="ai-assistant-enabled"
        checked={enabled}
        disabled={saving || unavailable}
        aria-label="روشن کردن دستیار هوش مصنوعی"
        aria-busy={saving}
        onChange={(event) => void onToggle(event.target.checked)}
      />
    </div>
  </section>
);

// ---- Facts editor ----------------------------------------------------------

type FactFormState = {
  factText: string;
  category: string;
};

const EMPTY_FACT_FORM: FactFormState = { factText: "", category: "general" };

const FactsEditor = () => {
  const { toast } = useToast();
  const [facts, setFacts] = React.useState<Fact[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [form, setForm] = React.useState<FactFormState>(EMPTY_FACT_FORM);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

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

  const handleSubmit = async () => {
    if (!form.factText.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/ai/knowledge/facts", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          editingId
            ? { id: editingId, ...form }
            : form
        ),
      });
      const data = (await res.json()) as { fact?: Fact; error?: string };
      if (!res.ok || !data.fact) {
        throw new Error(data.error || "ذخیره ناموفق بود.");
      }
      if (editingId) {
        setFacts((prev) =>
          prev.map((f) => (f.id === editingId ? data.fact! : f))
        );
        setEditingId(null);
      } else {
        setFacts((prev) => [...prev, data.fact!]);
      }
      setForm(EMPTY_FACT_FORM);
      toast({
        title: editingId ? "اطلاعات به‌روز شد" : "اطلاعات افزوده شد",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "ذخیره ناموفق بود",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (fact: Fact) => {
    setEditingId(fact.id);
    setForm({ factText: fact.factText, category: fact.category });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_FACT_FORM);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch("/api/ai/knowledge/facts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
      setFacts((prev) => prev.filter((f) => f.id !== id));
      toast({ title: "اطلاعات حذف شد", variant: "success" });
    } catch {
      toast({
        title: "حذف ناموفق بود",
        description: "دوباره تلاش کنید.",
        variant: "error",
      });
    }
  };

  return (
    <KnowledgeSection
      icon={BookOpen}
      title="اطلاعات کسب‌وکار"
      description="هر چیزی که می‌خواهید هوش مصنوعی همیشه بداند؛ همیشه در دستیار تزریق می‌شود."
      loading={loading}
      count={facts.length}
    >
      {/* Add/edit form */}
      <div className="space-y-3 rounded-2xl border border-line bg-background/40 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[160px] flex-1">
            <Input
              label={editingId ? "ویرایش اطلاعات" : "اطلاعه جدید"}
              value={form.factText}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, factText: e.target.value }))
              }
              placeholder="مثال: ساعت کاری ما ۹ تا ۲۱ است."
              disabled={submitting}
            />
          </div>
          <div className="w-[160px]">
            <Select
              label="دسته"
              options={CATEGORY_OPTIONS}
              value={form.category}
              onChange={(v) =>
                setForm((prev) => ({ ...prev, category: v ?? "general" }))
              }
            />
          </div>
          <div className="flex gap-2">
            {editingId && (
              <Button
                variant="ghost"
                size="md"
                onClick={cancelEdit}
                disabled={submitting}
                aria-label="انصراف"
              >
                <X className="size-4" />
              </Button>
            )}
            <Button
              size="md"
              loading={submitting}
              disabled={!form.factText.trim()}
              onClick={handleSubmit}
            >
              {editingId ? (
                <>
                  <Pencil className="size-4" />
                  به‌روزرسانی
                </>
              ) : (
                <>
                  <Plus className="size-4" />
                  افزودن
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* List */}
      <FactList
        facts={facts}
        editingId={editingId}
        onEdit={startEdit}
        onDelete={handleDelete}
      />
    </KnowledgeSection>
  );
};

const FactList = ({
  facts,
  editingId,
  onEdit,
  onDelete,
}: {
  facts: Fact[];
  editingId: string | null;
  onEdit: (fact: Fact) => void;
  onDelete: (id: string) => void;
}) => {
  if (!facts.length) {
    return (
      <p className="py-4 text-center text-sm text-muted">
        هنوز هیچ اطلاعه‌ای ثبت نشده. اولین مورد را اضافه کنید.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {facts.map((fact) => (
        <FactRow
          key={fact.id}
          fact={fact}
          editing={editingId === fact.id}
          onEdit={() => onEdit(fact)}
          onDelete={() => onDelete(fact.id)}
        />
      ))}
    </ul>
  );
};

const FactRow = ({
  fact,
  editing,
  onEdit,
  onDelete,
}: {
  fact: Fact;
  editing: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) => (
  <li
    className={cn(
      "flex items-start gap-3 rounded-2xl border bg-surface/40 p-3",
      editing ? "border-accent/40" : "border-line"
    )}
  >
    <div className="min-w-0 flex-1">
      <p className="text-sm">{fact.factText}</p>
      <Badge variant="muted" className="mt-1.5 text-[10px]">
        {categoryLabel(fact.category)}
      </Badge>
    </div>
    <div className="flex shrink-0 gap-1">
      <button
        type="button"
        onClick={onEdit}
        disabled={editing}
        aria-label="ویرایش"
        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-accent/10 hover:text-accent disabled:opacity-40"
      >
        <Pencil className="size-4" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="حذف"
        className="rounded-lg p-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  </li>
);

// ---- Q&A editor ------------------------------------------------------------

type QaFormState = {
  question: string;
  answer: string;
  category: string;
};

const EMPTY_QA_FORM: QaFormState = {
  question: "",
  answer: "",
  category: "general",
};

const QaEditor = () => {
  const { toast } = useToast();
  const [qa, setQa] = React.useState<Qa[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [form, setForm] = React.useState<QaFormState>(EMPTY_QA_FORM);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

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

  const handleSubmit = async () => {
    if (!form.question.trim() || !form.answer.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/ai/knowledge/qa", {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...form } : form),
      });
      const data = (await res.json()) as { qa?: Qa; error?: string };
      if (!res.ok || !data.qa) {
        throw new Error(data.error || "ذخیره ناموفق بود.");
      }
      if (editingId) {
        setQa((prev) => prev.map((q) => (q.id === editingId ? data.qa! : q)));
        setEditingId(null);
      } else {
        setQa((prev) => [...prev, data.qa!]);
      }
      setForm(EMPTY_QA_FORM);
      toast({
        title: editingId ? "پرسش به‌روز شد" : "پرسش افزوده شد",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "ذخیره ناموفق بود",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (item: Qa) => {
    setEditingId(item.id);
    setForm({
      question: item.question,
      answer: item.answer,
      category: item.category,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setForm(EMPTY_QA_FORM);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch("/api/ai/knowledge/qa", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error();
      setQa((prev) => prev.filter((q) => q.id !== id));
      toast({ title: "پرسش حذف شد", variant: "success" });
    } catch {
      toast({
        title: "حذف ناموفق بود",
        description: "دوباره تلاش کنید.",
        variant: "error",
      });
    }
  };

  return (
    <KnowledgeSection
      icon={HelpCircle}
      title="پرسش و پاسخ آماده"
      description="پرسش‌های متداول و پاسخ دقیق آن‌ها؛ هوش مصنوعی این زوج‌ها را اولویت بالاتری می‌دهد."
      loading={loading}
      count={qa.length}
    >
      <div className="space-y-3 rounded-2xl border border-line bg-background/40 p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Input
            label="پرسش"
            value={form.question}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, question: e.target.value }))
            }
            placeholder="مثال: هزینه ارسال چقدر است؟"
            disabled={submitting}
          />
          <Select
            label="دسته"
            options={CATEGORY_OPTIONS}
            value={form.category}
            onChange={(v) =>
              setForm((prev) => ({ ...prev, category: v ?? "general" }))
            }
          />
        </div>
        <Textarea
          label="پاسخ"
          value={form.answer}
          onChange={(e) =>
            setForm((prev) => ({ ...prev, answer: e.target.value }))
          }
          placeholder="پاسخ دقیق پرسش…"
          rows={2}
          disabled={submitting}
        />
        <div className="flex gap-2">
          {editingId && (
            <Button
              variant="ghost"
              size="md"
              onClick={cancelEdit}
              disabled={submitting}
              aria-label="انصراف"
            >
              <X className="size-4" />
            </Button>
          )}
          <Button
            size="md"
            loading={submitting}
            disabled={!form.question.trim() || !form.answer.trim()}
            onClick={handleSubmit}
          >
            {editingId ? (
              <>
                <Pencil className="size-4" />
                به‌روزرسانی
              </>
            ) : (
              <>
                <Plus className="size-4" />
                افزودن
              </>
            )}
          </Button>
        </div>
      </div>

      <QaList
        qa={qa}
        editingId={editingId}
        onEdit={startEdit}
        onDelete={handleDelete}
      />
    </KnowledgeSection>
  );
};

const QaList = ({
  qa,
  editingId,
  onEdit,
  onDelete,
}: {
  qa: Qa[];
  editingId: string | null;
  onEdit: (item: Qa) => void;
  onDelete: (id: string) => void;
}) => {
  if (!qa.length) {
    return (
      <p className="py-4 text-center text-sm text-muted">
        هنوز هیچ پرسش آماده‌ای ثبت نشده. اولین مورد را اضافه کنید.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {qa.map((item) => (
        <QaRow
          key={item.id}
          item={item}
          editing={editingId === item.id}
          onEdit={() => onEdit(item)}
          onDelete={() => onDelete(item.id)}
        />
      ))}
    </ul>
  );
};

const QaRow = ({
  item,
  editing,
  onEdit,
  onDelete,
}: {
  item: Qa;
  editing: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) => (
  <li
    className={cn(
      "rounded-2xl border bg-surface/40 p-3",
      editing ? "border-accent/40" : "border-line"
    )}
  >
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">س: {item.question}</p>
        <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
          پ: {item.answer}
        </p>
        <Badge variant="muted" className="mt-1.5 text-[10px]">
          {categoryLabel(item.category)}
        </Badge>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          onClick={onEdit}
          disabled={editing}
          aria-label="ویرایش"
          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-accent/10 hover:text-accent disabled:opacity-40"
        >
          <Pencil className="size-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label="حذف"
          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <Trash2 className="size-4" />
        </button>
      </div>
    </div>
  </li>
);

// ---- Shared section wrapper -----------------------------------------------

type KnowledgeSectionProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  loading: boolean;
  count: number;
  children: React.ReactNode;
};

const KnowledgeSection = ({
  icon: SectionIcon,
  title,
  description,
  loading,
  count,
  children,
}: KnowledgeSectionProps) => (
  <section
    aria-labelledby={`${title}-title`}
    className="rounded-3xl border border-line bg-surface/25 p-5 sm:p-6"
  >
    <div className="mb-4 flex items-start gap-4">
      <Icon icon={SectionIcon} tile size="sm" tone="muted" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={`${title}-title`} className="font-bold">
            {title}
          </h2>
          {loading ? (
            <Loader2 className="size-3.5 animate-spin text-muted" />
          ) : (
            <Badge variant="muted" className="text-[10px]">
              {count}
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm leading-6 text-muted">{description}</p>
      </div>
    </div>
    <div className="space-y-3">{children}</div>
  </section>
);
