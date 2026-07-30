"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Building2,
  Check,
  Heart,
  List,
  Smile,
  Sparkles,
  Wand2,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { luxe } from "@/components/motion/reveal";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { KnowledgePageHeader } from "@/components/dashboard/ai-assistance-panel";
import { cn } from "@/lib/utils";

// ---- Types -----------------------------------------------------------------

export type StyleLevel = "less" | "default" | "more";

export type PersonaDraft = {
  intro: string;
  instructions: string;
  warmth: StyleLevel;
  enthusiasm: StyleLevel;
  structure: StyleLevel;
  emoji: StyleLevel;
};

type AiPersonaPanelProps = {
  initialPersona: PersonaDraft;
  businessName: string;
  businessCategory: string;
  loadError: boolean;
  setupRequired: boolean;
};

const INTRO_MAX = 1500;
const INSTRUCTIONS_MAX = 1500;

/** The four style dials, in the order they read best top-to-bottom. */
const STYLE_FIELDS: Array<{
  key: keyof Pick<
    PersonaDraft,
    "warmth" | "enthusiasm" | "structure" | "emoji"
  >;
  icon: LucideIcon;
  label: string;
  description: string;
  /** Persian labels for less / default / more, tuned per dial. */
  options: [string, string, string];
}> = [
  {
    key: "warmth",
    icon: Heart,
    label: "صمیمیت",
    description: "چقدر گرم و خودمانی با مشتری حرف بزند.",
    options: ["رسمی‌تر", "پیش‌فرض", "صمیمی‌تر"],
  },
  {
    key: "enthusiasm",
    icon: Zap,
    label: "شور و اشتیاق",
    description: "چقدر پرانرژی و مشتاق پاسخ بدهد.",
    options: ["آرام‌تر", "پیش‌فرض", "پرانرژی‌تر"],
  },
  {
    key: "structure",
    icon: List,
    label: "تیتر و فهرست",
    description: "پاسخ‌ها را با تیتر و لیست مرتب کند یا ساده و روان بنویسد.",
    options: ["کمتر", "پیش‌فرض", "بیشتر"],
  },
  {
    key: "emoji",
    icon: Smile,
    label: "ایموجی",
    description: "چقدر در پاسخ‌ها ایموجی به کار ببرد.",
    options: ["بدون ایموجی", "پیش‌فرض", "بیشتر"],
  },
];

const LEVELS: StyleLevel[] = ["less", "default", "more"];

const samePersona = (a: PersonaDraft, b: PersonaDraft) =>
  a.intro === b.intro &&
  a.instructions === b.instructions &&
  a.warmth === b.warmth &&
  a.enthusiasm === b.enthusiasm &&
  a.structure === b.structure &&
  a.emoji === b.emoji;

// ---- Panel -----------------------------------------------------------------

export const AiPersonaPanel = ({
  initialPersona,
  businessName,
  businessCategory,
  loadError,
  setupRequired,
}: AiPersonaPanelProps) => {
  const reduce = useReducedMotion() ?? false;
  const { toast } = useToast();
  const [saved, setSaved] = React.useState(initialPersona);
  const [draft, setDraft] = React.useState(initialPersona);
  const [saving, setSaving] = React.useState(false);

  const dirty = !samePersona(draft, saved);
  const disabled = saving || setupRequired || loadError;

  const update = <K extends keyof PersonaDraft>(
    key: K,
    value: PersonaDraft[K]
  ) => setDraft((prev) => ({ ...prev, [key]: value }));

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!dirty || disabled) return;

    const payload: PersonaDraft = {
      ...draft,
      intro: draft.intro.trim(),
      instructions: draft.instructions.trim(),
    };

    setSaving(true);
    try {
      const response = await fetch("/api/ai/persona", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json().catch(() => ({}))) as {
        persona?: PersonaDraft;
        error?: string;
      };
      if (!response.ok || !result.persona) {
        throw new Error(result.error || "ذخیره ناموفق بود؛ دوباره تلاش کنید.");
      }
      setSaved(result.persona);
      setDraft(result.persona);
      toast({
        title: "شخصیت دستیار ذخیره شد",
        description: "پاسخ‌های بعدی با همین لحن و اطلاعات داده می‌شوند.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "ذخیره ناموفق بود",
        description: error instanceof Error ? error.message : undefined,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} noValidate>
      <KnowledgePageHeader
        title="شخصیت و لحن دستیار"
        description="به دستیار بگویید کسب‌وکار شما چیست و چطور باید حرف بزند؛ این تنظیمات در همهٔ پاسخ‌ها — به‌ویژه معرفی کسب‌وکار — به کار می‌رود."
        icon={Wand2}
      />

      <div className="space-y-4">
        {setupRequired && (
          <Alert
            variant="warning"
            title="راه‌اندازی پایگاه داده کامل نشده است"
            description="اسکریپت ai-persona.sql را در Supabase اجرا کنید تا این تنظیمات ذخیره شوند."
          />
        )}
        {!setupRequired && loadError && (
          <Alert
            variant="error"
            title="تنظیمات شخصیت بارگذاری نشد"
            description="صفحه را تازه کنید و دوباره تلاش کنید."
          />
        )}

        {/* Business identity — read-only; edited in account settings. */}
        <section
          aria-labelledby="persona-identity-title"
          className="rounded-3xl border border-line bg-surface/25 p-5 sm:p-6"
        >
          <div className="flex items-start gap-4">
            <Icon icon={Building2} tile size="sm" tone="muted" className="shrink-0" />
            <div className="min-w-0 flex-1">
              <h2 id="persona-identity-title" className="font-bold">
                کسب‌وکار شما
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                دستیار همیشه این دو را می‌داند و در معرفی خود از آن‌ها استفاده
                می‌کند. برای ویرایش، به تنظیمات حساب بروید.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {businessName ? (
                  <Badge variant="accent">{businessName}</Badge>
                ) : (
                  <Badge variant="warning" dot>
                    نام کسب‌وکار ثبت نشده
                  </Badge>
                )}
                {businessCategory ? (
                  <Badge variant="muted">{businessCategory}</Badge>
                ) : (
                  <Badge variant="warning" dot>
                    دسته ثبت نشده
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Free-text: what the business is + how the assistant should behave. */}
        <section
          aria-labelledby="persona-text-title"
          className="rounded-3xl border border-line bg-surface/25 p-5 sm:p-6"
        >
          <div className="mb-5 flex items-start gap-4">
            <Icon icon={Sparkles} tile size="sm" tone="accent" className="shrink-0" />
            <div className="min-w-0 flex-1">
              <h2 id="persona-text-title" className="font-bold">
                معرفی و دستورالعمل
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                هرچه دقیق‌تر بنویسید، پاسخ‌ها به کسب‌وکار شما نزدیک‌تر می‌شوند.
              </p>
            </div>
          </div>

          <div className="space-y-5">
            <Textarea
              id="persona-intro"
              dir="rtl"
              label="معرفی کسب‌وکار"
              hint="در چند جمله بگویید چه می‌فروشید یا چه خدمتی می‌دهید، برای چه کسانی و چه چیزی شما را متمایز می‌کند."
              placeholder="مثال: ما یک فروشگاه اینترنتی قهوهٔ تخصصی هستیم که دانه‌های تازه‌رست را مستقیم از مزرعه تهیه می‌کنیم و در سراسر ایران ارسال داریم."
              value={draft.intro}
              onChange={(event) => update("intro", event.target.value)}
              maxLength={INTRO_MAX}
              showCount
              rows={5}
              disabled={disabled}
            />
            <Textarea
              id="persona-instructions"
              dir="rtl"
              label="دستیار چطور رفتار کند"
              hint="قاعده‌های رفتاری دستیار؛ مثلاً چه چیزی را هرگز نگوید، مشتری را چطور خطاب کند یا کِی به شما ارجاع بدهد."
              placeholder="مثال: همیشه مشتری را با «شما» خطاب کن، دربارهٔ تخفیف‌های خارج از سایت قول نده و در پایان پاسخ بپرس آیا کمک دیگری لازم است."
              value={draft.instructions}
              onChange={(event) => update("instructions", event.target.value)}
              maxLength={INSTRUCTIONS_MAX}
              showCount
              rows={5}
              disabled={disabled}
            />
          </div>
        </section>

        {/* Four style dials. */}
        <section
          aria-labelledby="persona-style-title"
          className="rounded-3xl border border-line bg-surface/25 p-5 sm:p-6"
        >
          <div className="mb-5 flex items-start gap-4">
            <Icon icon={Heart} tile size="sm" tone="muted" className="shrink-0" />
            <div className="min-w-0 flex-1">
              <h2 id="persona-style-title" className="font-bold">
                لحن پاسخ‌ها
              </h2>
              <p className="mt-1 text-sm leading-6 text-muted">
                روی «پیش‌فرض» رفتار متعادل دستیار حفظ می‌شود؛ فقط چیزهایی را که
                تغییر می‌دهید به دستیار گفته می‌شود.
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {STYLE_FIELDS.map((field) => (
              <StyleLevelPicker
                key={field.key}
                icon={field.icon}
                label={field.label}
                description={field.description}
                options={field.options}
                value={draft[field.key]}
                disabled={disabled}
                onChange={(next) => update(field.key, next)}
              />
            ))}
          </div>
        </section>
      </div>

      {/* Save bar — appears only when there is something to save. */}
      <AnimatePresence initial={false}>
        {dirty && (
          <motion.div
            key="persona-save-bar"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
            transition={{ duration: reduce ? 0 : 0.28, ease: luxe }}
            className="sticky bottom-4 z-10 mt-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-accent/30 bg-card/95 p-4 shadow-lg backdrop-blur">
              <p className="text-sm text-muted">تغییرات ذخیره نشده‌اند.</p>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setDraft(saved)}
                  disabled={saving}
                >
                  بازگرداندن
                </Button>
                <Button type="submit" loading={saving} disabled={disabled}>
                  ذخیره تغییرات
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
};

// ---- Three-way style picker (کم / پیش‌فرض / زیاد) --------------------------

const StyleLevelPicker = ({
  icon: FieldIcon,
  label,
  description,
  options,
  value,
  disabled,
  onChange,
}: {
  icon: LucideIcon;
  label: string;
  description: string;
  options: [string, string, string];
  value: StyleLevel;
  disabled: boolean;
  onChange: (next: StyleLevel) => void;
}) => {
  const groupName = React.useId();
  const titleId = `${groupName}-title`;

  return (
    <div className="rounded-2xl border border-line bg-background/40 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <FieldIcon className="mt-0.5 size-4 shrink-0 text-muted" aria-hidden />
          <div className="min-w-0">
            <p id={titleId} className="text-sm font-bold">
              {label}
            </p>
            <p className="mt-1 text-xs leading-6 text-muted">{description}</p>
          </div>
        </div>

        <div
          role="radiogroup"
          aria-labelledby={titleId}
          className="grid w-full shrink-0 grid-cols-3 gap-1 rounded-2xl bg-surface/60 p-1 sm:w-72"
        >
          {LEVELS.map((level, index) => {
            const selected = value === level;
            return (
              <label
                key={level}
                className={cn(
                  "relative flex h-10 items-center justify-center rounded-xl px-2 text-xs transition-colors duration-300",
                  disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                  selected
                    ? "bg-card font-bold text-foreground"
                    : "text-muted",
                  !selected && !disabled && "hover:bg-card/50 hover:text-foreground"
                )}
              >
                <input
                  type="radio"
                  name={groupName}
                  value={level}
                  checked={selected}
                  disabled={disabled}
                  onChange={() => onChange(level)}
                  className="peer sr-only"
                />
                <span className="truncate">{options[index]}</span>
                {selected && (
                  <Check
                    className="absolute end-1.5 top-1.5 size-3 text-accent"
                    aria-hidden
                  />
                )}
                <span
                  className="pointer-events-none absolute inset-0 rounded-xl peer-focus-visible:ring-2 peer-focus-visible:ring-accent/60"
                  aria-hidden
                />
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
};
