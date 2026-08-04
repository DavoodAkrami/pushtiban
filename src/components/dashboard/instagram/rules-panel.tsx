"use client";

import * as React from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowLeft,
  AtSign,
  Hash,
  Images,
  MessageCircle,
  MessageSquareText,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import { TbBrandInstagram } from "react-icons/tb";
import { luxe } from "@/components/motion/reveal";
import {
  InstagramCommentScopeNotice,
  InstagramRequiredNotice,
} from "@/components/dashboard/instagram/notices";
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
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import {
  cleanPhrase,
  INSTAGRAM_PHRASE_MAX_LENGTH,
  INSTAGRAM_REPLY_MAX_LENGTH,
  resolveMatchType,
  triggerNeedsPhrase,
  triggerSupportsMedia,
  triggerSupportsPublicReply,
  type InstagramAutomation,
  type InstagramMatchType,
  type InstagramTriggerType,
} from "@/lib/instagram/automations";
import { CHANNEL_CONNECTION_CHANGED_EVENT } from "@/lib/settings-events";
import { fa } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  createInstagramAutomation,
  deleteInstagramAutomation,
  loadInstagramAutomations,
  updateInstagramAutomation,
  type InstagramRequestError,
  type InstagramRuleScope,
} from "@/store/slices/instagram-automations-slice";

// ---------------------------------------------------------------------------
// The Instagram rule editor, shared by the «کامنت و استوری» page and the
// Instagram side of «کلیدواژه‌ها». One component with a `scope`, because the
// three rule kinds differ only in which fields they show — and a second copy of
// the card, modal and delete flow would drift within a week.
// ---------------------------------------------------------------------------

type MediaItem = {
  id: string;
  caption: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
};

type Draft = {
  triggerType: InstagramTriggerType;
  phrase: string;
  matchType: InstagramMatchType;
  mediaId: string | null;
  replyText: string;
  publicReplyText: string;
};

const TRIGGER_LABELS: Record<InstagramTriggerType, string> = {
  comment: "کامنت",
  dm_keyword: "کلیدواژهٔ دایرکت",
  story_mention: "منشن در استوری",
  story_reply: "پاسخ به استوری",
};

const TRIGGER_ICONS: Record<InstagramTriggerType, typeof Hash> = {
  comment: MessageCircle,
  dm_keyword: Hash,
  story_mention: AtSign,
  story_reply: Sparkles,
};

/** What the customer does, in the words of the card's left column. */
const TRIGGER_SOURCE_LABELS: Record<InstagramTriggerType, string> = {
  comment: "کامنت مشتری",
  dm_keyword: "پیام مشتری",
  story_mention: "منشن شما در استوری مشتری",
  story_reply: "پاسخ مشتری به استوری شما",
};

const SCOPE_TRIGGERS: Record<
  Exclude<InstagramRuleScope, "all">,
  InstagramTriggerType[]
> = {
  comment: ["comment"],
  dm_keyword: ["dm_keyword"],
  story: ["story_mention", "story_reply"],
};

const matchTypeOptions: SelectOption[] = [
  {
    value: "contains",
    label: "شامل باشد",
    description: "هرجای متن که این عبارت بیاید",
  },
  {
    value: "exact",
    label: "دقیقاً برابر باشد",
    description: "کل متن فقط همین عبارت باشد",
  },
];

const errorMessage = (error: unknown) => {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as InstagramRequestError).message === "string"
  ) {
    return (error as InstagramRequestError).message;
  }
  return "درخواست انجام نشد؛ دوباره تلاش کنید.";
};

// ---- Post picker -----------------------------------------------------------

/**
 * "Which post?" for a comment rule.
 *
 * Falls back to every-post silently when the media list cannot be fetched: a
 * business with an unreachable media endpoint should still be able to write a
 * rule, and every-post is the safe reading of an unanswered question.
 */
const MediaPicker = ({
  disabled,
  media,
  onChange,
  value,
}: {
  disabled: boolean;
  media: MediaItem[];
  onChange: (mediaId: string | null) => void;
  value: string | null;
}) => (
  <div>
    <p className="mb-2 text-sm font-medium">این قانون روی کدام پست کار کند؟</p>
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(null)}
        aria-pressed={value === null}
        className={`flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
          value === null
            ? "border-accent/40 bg-accent/10 text-accent"
            : "border-line bg-surface/40 hover:bg-surface/70"
        }`}
      >
        <Images className="size-4" aria-hidden />
        همهٔ پست‌ها
      </button>

      {media.map((item) => (
        <button
          key={item.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(item.id)}
          aria-pressed={value === item.id}
          title={item.caption ?? undefined}
          className={`relative size-16 overflow-hidden rounded-2xl border transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
            value === item.id
              ? "border-accent"
              : "border-line hover:border-accent/40"
          }`}
        >
          {item.thumbnailUrl ? (
            <Image
              src={item.thumbnailUrl}
              alt={item.caption?.slice(0, 60) ?? "پست اینستاگرام"}
              fill
              sizes="64px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <span className="flex size-full items-center justify-center bg-surface/60">
              <Images className="size-4 text-muted" aria-hidden />
            </span>
          )}
        </button>
      ))}
    </div>
    {!media.length && (
      <p className="mt-2 text-xs leading-6 text-muted">
        فهرست پست‌ها در دسترس نیست؛ این قانون روی همهٔ پست‌ها کار می‌کند.
      </p>
    )}
  </div>
);

// ---- Editor modal ----------------------------------------------------------

const RuleEditorModal = ({
  automation,
  media,
  onOpenChange,
  onSave,
  open,
  triggers,
}: {
  automation: InstagramAutomation | null;
  media: MediaItem[];
  onOpenChange: (open: boolean) => void;
  onSave: (draft: Draft) => Promise<boolean>;
  open: boolean;
  triggers: InstagramTriggerType[];
}) => {
  const [triggerType, setTriggerType] = React.useState<InstagramTriggerType>(
    triggers[0]
  );
  const [phrase, setPhrase] = React.useState("");
  const [matchType, setMatchType] =
    React.useState<InstagramMatchType>("contains");
  const [mediaId, setMediaId] = React.useState<string | null>(null);
  const [replyText, setReplyText] = React.useState("");
  const [publicReplyText, setPublicReplyText] = React.useState("");
  const [phraseError, setPhraseError] = React.useState("");
  const [replyError, setReplyError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const editing = Boolean(automation);

  React.useEffect(() => {
    if (!open) return;
    setTriggerType(automation?.triggerType ?? triggers[0]);
    setPhrase(automation?.phrase ?? "");
    setMatchType(automation?.matchType ?? "contains");
    setMediaId(automation?.mediaId ?? null);
    setReplyText(automation?.replyText ?? "");
    setPublicReplyText(automation?.publicReplyText ?? "");
    setPhraseError("");
    setReplyError("");
  }, [automation, open, triggers]);

  const needsPhrase = triggerNeedsPhrase(triggerType);
  const supportsMedia = triggerSupportsMedia(triggerType);
  const supportsPublicReply = triggerSupportsPublicReply(triggerType);
  // A DM keyword is always an exact match, so offering the choice would be a lie.
  const matchTypeLocked = triggerType === "dm_keyword";

  const triggerOptions: SelectOption[] = triggers.map((trigger) => ({
    value: trigger,
    label: TRIGGER_LABELS[trigger],
    description:
      trigger === "story_mention"
        ? "برای هر منشن، بدون توجه به متن"
        : trigger === "story_reply"
          ? "وقتی مشتری به استوری شما جواب می‌دهد"
          : trigger === "comment"
            ? "وقتی مشتری زیر پست کامنت می‌گذارد"
            : "وقتی متن دایرکت دقیقاً برابر عبارت باشد",
    icon: React.createElement(TRIGGER_ICONS[trigger], {
      className: "size-4",
      "aria-hidden": true,
    }),
  }));

  const saveRule = async (event: React.FormEvent) => {
    event.preventDefault();
    const cleanedPhrase = cleanPhrase(phrase);
    const cleanedReply = replyText.trim();
    let valid = true;

    if (needsPhrase) {
      if (!cleanedPhrase) {
        setPhraseError(
          triggerType === "comment"
            ? "عبارتی که باید در کامنت باشد را بنویسید."
            : "یک کلیدواژه وارد کنید."
        );
        valid = false;
      } else if (cleanedPhrase.length > INSTAGRAM_PHRASE_MAX_LENGTH) {
        setPhraseError("عبارت حداکثر ۸۰ نویسه است.");
        valid = false;
      }
    }

    if (!cleanedReply) {
      setReplyError("متن دایرکت را بنویسید.");
      valid = false;
    } else if (cleanedReply.length > INSTAGRAM_REPLY_MAX_LENGTH) {
      setReplyError("متن دایرکت حداکثر ۱۰۰۰ نویسه است.");
      valid = false;
    }

    if (!valid) return;

    setSaving(true);
    const saved = await onSave({
      triggerType,
      phrase: needsPhrase ? cleanedPhrase : "",
      matchType: resolveMatchType(triggerType, matchType),
      mediaId: supportsMedia ? mediaId : null,
      replyText: cleanedReply,
      publicReplyText: supportsPublicReply ? publicReplyText.trim() : "",
    });
    setSaving(false);
    if (saved) onOpenChange(false);
  };

  const previewTrigger = needsPhrase
    ? cleanPhrase(phrase) || "قیمت"
    : "منشن شما در استوری";
  const previewReply =
    replyText.trim() || "سلام! لیست قیمت‌ها را همین‌جا برایتان می‌فرستم…";

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
            {editing ? "ویرایش قانون" : "قانون جدید اینستاگرام"}
          </ModalTitle>
          <ModalDescription>
            {triggerType === "comment"
              ? "وقتی مشتری زیر پست شما کامنت می‌گذارد، پشتیبان همان لحظه برایش دایرکت می‌فرستد."
              : triggerType === "dm_keyword"
                ? "وقتی متن دایرکت دقیقاً برابر کلیدواژه باشد، پاسخ آماده فرستاده می‌شود."
                : "وقتی مشتری در استوری با شما تعامل می‌کند، پاسخ آماده برایش می‌رود."}
          </ModalDescription>
        </ModalHeader>

        <form
          onSubmit={saveRule}
          noValidate
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 pb-6 pt-1 sm:px-7">
            {triggers.length > 1 && (
              <Select
                id="instagram-trigger-type"
                label="نوع محرک"
                options={triggerOptions}
                value={triggerType}
                onChange={(value) => {
                  setTriggerType(value as InstagramTriggerType);
                  setPhraseError("");
                }}
                disabled={saving}
              />
            )}

            {needsPhrase && (
              <>
                <Input
                  id="instagram-phrase"
                  dir="rtl"
                  label={triggerType === "comment" ? "عبارت کامنت" : "کلیدواژه"}
                  hint="بزرگی حروف، فاصله‌های اضافی و «ی/ك» عربی نادیده گرفته می‌شود."
                  placeholder="قیمت"
                  value={phrase}
                  onChange={(event) => {
                    setPhrase(event.target.value);
                    if (phraseError) setPhraseError("");
                  }}
                  error={phraseError}
                  maxLength={INSTAGRAM_PHRASE_MAX_LENGTH}
                  startIcon={<Hash />}
                  autoComplete="off"
                  disabled={saving}
                  required
                />

                {!matchTypeLocked && (
                  <Select
                    id="instagram-match-type"
                    label="نحوهٔ تطبیق"
                    options={matchTypeOptions}
                    value={matchType}
                    onChange={(value) =>
                      setMatchType(value as InstagramMatchType)
                    }
                    disabled={saving}
                  />
                )}
              </>
            )}

            {supportsMedia && (
              <MediaPicker
                disabled={saving}
                media={media}
                onChange={setMediaId}
                value={mediaId}
              />
            )}

            <Textarea
              id="instagram-reply"
              dir="rtl"
              label="متن دایرکت"
              hint="اینستاگرام متن دایرکت را حداکثر ۱۰۰۰ نویسه می‌پذیرد و هیچ قالب‌بندی‌ای نشان نمی‌دهد."
              placeholder="سلام! لیست قیمت‌ها را همین‌جا برایتان می‌فرستم…"
              value={replyText}
              onChange={(event) => {
                setReplyText(event.target.value);
                if (replyError) setReplyError("");
              }}
              error={replyError}
              maxLength={INSTAGRAM_REPLY_MAX_LENGTH}
              showCount
              rows={5}
              disabled={saving}
              required
            />

            {supportsPublicReply && (
              <Textarea
                id="instagram-public-reply"
                dir="rtl"
                label="پاسخ عمومی زیر کامنت (اختیاری)"
                hint="بقیهٔ بازدیدکنندگان این را می‌بینند و می‌فهمند حسابتان پاسخ می‌دهد. خالی بگذارید تا پاسخ عمومی فرستاده نشود."
                placeholder="جوابتون رو دایرکت فرستادم ✅"
                value={publicReplyText}
                onChange={(event) => setPublicReplyText(event.target.value)}
                maxLength={INSTAGRAM_REPLY_MAX_LENGTH}
                rows={2}
                disabled={saving}
              />
            )}

            <section
              aria-label="پیش‌نمایش عملکرد قانون"
              className="rounded-3xl border border-line bg-background/55 p-4 sm:p-5"
            >
              <p className="mb-3 text-xs font-medium text-muted">
                پیش‌نمایش عملکرد
              </p>
              <div className="grid items-stretch gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.25fr)] sm:items-center">
                <div className="rounded-2xl bg-surface/70 p-4">
                  <span className="flex items-center gap-2 text-xs text-muted">
                    <MessageSquareText className="size-4" aria-hidden />
                    {TRIGGER_SOURCE_LABELS[triggerType]}
                  </span>
                  <code
                    dir="auto"
                    className="mt-2 block break-words text-sm font-bold text-foreground"
                  >
                    {previewTrigger}
                  </code>
                </div>

                <ArrowLeft
                  className="mx-auto hidden size-4 text-muted sm:block"
                  aria-hidden
                />

                <div className="rounded-2xl bg-surface/70 p-4">
                  <span className="flex items-center gap-2 text-xs text-muted">
                    <Send className="size-4" aria-hidden />
                    دایرکت ارسال می‌شود
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
            <Button type="submit" loading={saving} className="w-full sm:w-auto">
              {editing ? "ذخیره تغییرات" : "ساخت قانون"}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

// ---- Rule card -------------------------------------------------------------

const RuleCard = ({
  automation,
  busy,
  onDelete,
  onEdit,
  onToggle,
}: {
  automation: InstagramAutomation;
  busy: boolean;
  onDelete: () => void;
  onEdit: () => void;
  onToggle: (active: boolean) => void;
}) => {
  const reduce = useReducedMotion();
  const TriggerIcon = TRIGGER_ICONS[automation.triggerType];

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
            icon={TriggerIcon}
            tile
            size="sm"
            tone={automation.isActive ? "accent" : "muted"}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold">
              {TRIGGER_LABELS[automation.triggerType]}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge variant={automation.isActive ? "success" : "muted"} dot>
                {automation.isActive ? "فعال" : "متوقف"}
              </Badge>
              {automation.triggerType === "comment" && (
                <Badge variant="muted">
                  {automation.mediaId ? "یک پست" : "همهٔ پست‌ها"}
                </Badge>
              )}
              {automation.publicReplyText && (
                <Badge variant="muted">پاسخ عمومی دارد</Badge>
              )}
            </div>
          </div>
        </div>
        <Switch
          aria-label={`${automation.isActive ? "توقف" : "فعال‌سازی"} قانون ${
            automation.phrase ?? TRIGGER_LABELS[automation.triggerType]
          }`}
          checked={automation.isActive}
          disabled={busy}
          onChange={(event) => onToggle(event.target.checked)}
        />
      </header>

      <div className="mt-5 grid gap-3 border-y border-line py-5 md:grid-cols-[minmax(0,0.9fr)_auto_minmax(0,1.35fr)] md:items-center">
        <div className="min-w-0 rounded-2xl bg-background/45 p-4">
          <p className="flex items-center gap-2 text-xs text-muted">
            <TriggerIcon className="size-4 shrink-0" aria-hidden />
            {TRIGGER_SOURCE_LABELS[automation.triggerType]}
          </p>
          <code
            dir="auto"
            className="mt-2 block truncate text-sm font-bold text-foreground"
          >
            {automation.phrase ?? "هر منشن"}
          </code>
          {automation.phrase && (
            <p className="mt-1.5 text-xs text-muted">
              {automation.matchType === "exact"
                ? "تطبیق دقیق"
                : "هرجای متن بیاید"}
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
            دایرکت ارسال می‌شود
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
            aria-label="ویرایش قانون"
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
            aria-label="حذف قانون"
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

// ---- Panel -----------------------------------------------------------------

export const InstagramRulesPanel = ({
  emptyDescription,
  emptyTitle,
  scope,
}: {
  emptyDescription: string;
  emptyTitle: string;
  scope: Exclude<InstagramRuleScope, "all">;
}) => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const { account, error, items, setupRequired, status } = useAppSelector(
    (state) => state.instagramAutomations
  );
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editingRule, setEditingRule] =
    React.useState<InstagramAutomation | null>(null);
  const [deletingRule, setDeletingRule] =
    React.useState<InstagramAutomation | null>(null);
  const [busyRuleId, setBusyRuleId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [media, setMedia] = React.useState<MediaItem[]>([]);

  const triggers = SCOPE_TRIGGERS[scope];
  const needsCommentScope = triggers.includes("comment");

  React.useEffect(() => {
    void dispatch(loadInstagramAutomations(scope));
  }, [dispatch, scope]);

  React.useEffect(() => {
    const refresh = () => void dispatch(loadInstagramAutomations(scope));
    window.addEventListener(CHANNEL_CONNECTION_CHANGED_EVENT, refresh);
    return () =>
      window.removeEventListener(CHANNEL_CONNECTION_CHANGED_EVENT, refresh);
  }, [dispatch, scope]);

  // The post list is only worth fetching for comment rules, and only once the
  // account is known to be connected.
  React.useEffect(() => {
    if (!account || !needsCommentScope || !account.canManageComments) return;

    const loadMedia = async () => {
      try {
        const response = await fetch("/api/instagram/media", {
          cache: "no-store",
        });
        if (!response.ok) return;
        const data = (await response.json()) as { media: MediaItem[] };
        setMedia(data.media ?? []);
      } catch {
        // The picker degrades to "every post", which is a fine default.
      }
    };

    void loadMedia();
  }, [account, needsCommentScope]);

  const openCreate = () => {
    setEditingRule(null);
    setEditorOpen(true);
  };

  const saveRule = async (draft: Draft) => {
    const payload = {
      triggerType: draft.triggerType,
      phrase: draft.phrase || null,
      matchType: draft.matchType,
      mediaId: draft.mediaId,
      replyText: draft.replyText,
      publicReplyText: draft.publicReplyText || null,
    };

    try {
      const result = editingRule
        ? await dispatch(
            updateInstagramAutomation({ id: editingRule.id, changes: payload })
          ).unwrap()
        : await dispatch(createInstagramAutomation(payload)).unwrap();

      toast({
        title: editingRule ? "تغییرات ذخیره شد" : "قانون ساخته شد",
        description: result.webhookActive
          ? "قانون روی حساب اینستاگرام فعال است."
          : "قانون ذخیره شد، اما دریافت رویدادهای اینستاگرام فعال نشد؛ یک‌بار حساب را دوباره وصل کنید.",
        variant: result.webhookActive ? "success" : "warning",
      });
      return true;
    } catch (requestError) {
      toast({
        title: "قانون ذخیره نشد",
        description: errorMessage(requestError),
        variant: "error",
      });
      return false;
    }
  };

  const toggleRule = async (
    automation: InstagramAutomation,
    isActive: boolean
  ) => {
    setBusyRuleId(automation.id);
    try {
      await dispatch(
        updateInstagramAutomation({ id: automation.id, changes: { isActive } })
      ).unwrap();
      toast({
        title: isActive ? "قانون فعال شد" : "قانون متوقف شد",
        description: isActive
          ? "از این پس این قانون پاسخ می‌دهد."
          : "این قانون فعلاً پاسخی نمی‌فرستد.",
        variant: "success",
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
      await dispatch(deleteInstagramAutomation(deletingRule.id)).unwrap();
      setDeletingRule(null);
      toast({
        title: "قانون حذف شد",
        description: "پشتیبان دیگر به این محرک پاسخ نمی‌دهد.",
        variant: "success",
      });
    } catch (requestError) {
      toast({
        title: "قانون حذف نشد",
        description: errorMessage(requestError),
        variant: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  const loading = status === "idle" || status === "loading";
  const scopeBlocked = needsCommentScope && account && !account.canManageComments;
  const canCreate =
    status === "succeeded" && Boolean(account) && !setupRequired && !scopeBlocked;

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button
          type="button"
          startIcon={<Plus className="size-4" />}
          onClick={openCreate}
          disabled={!canCreate}
          className="w-full shrink-0 sm:w-auto"
        >
          قانون جدید
        </Button>
      </div>

      {setupRequired && (
        <Alert
          variant="warning"
          title="راه‌اندازی اتوماسیون اینستاگرام کامل نشده است"
          description="اسکریپت پایگاه دادهٔ اینستاگرام را اجرا کنید، سپس این صفحه را دوباره بارگذاری کنید."
        >
          <Button
            type="button"
            variant="link"
            className="mt-2"
            onClick={() => void dispatch(loadInstagramAutomations(scope))}
          >
            بررسی دوباره
          </Button>
        </Alert>
      )}

      {!setupRequired && status === "failed" && (
        <Alert
          variant="error"
          title="قانون‌ها بارگذاری نشدند"
          description={error ?? "اتصال اینترنت را بررسی کنید و دوباره تلاش کنید."}
        >
          <Button
            type="button"
            variant="link"
            className="mt-2"
            onClick={() => void dispatch(loadInstagramAutomations(scope))}
          >
            تلاش دوباره
          </Button>
        </Alert>
      )}

      {!loading && status === "succeeded" && !account && (
        <InstagramRequiredNotice />
      )}

      {scopeBlocked && <InstagramCommentScopeNotice />}

      {account && status === "succeeded" && (
        <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface/30 px-4 py-3 sm:flex-row sm:items-center">
          <span className="flex min-w-0 items-center gap-3">
            <Icon icon={TbBrandInstagram} tile size="xs" tone="accent" />
            <span className="min-w-0">
              <span className="block text-xs text-muted">حساب متصل</span>
              <span
                dir="ltr"
                className="block truncate text-start text-sm font-medium"
              >
                @{account.username}
              </span>
            </span>
          </span>
          <span className="text-xs leading-6 text-muted sm:ms-auto">
            {scope === "comment"
              ? "پاسخ کامنت به‌صورت دایرکت خصوصی فرستاده می‌شود و برای هر کامنت فقط یک‌بار امکان‌پذیر است."
              : scope === "story"
                ? "منشن و پاسخ استوری هر دو به‌شکل دایرکت به پشتیبان می‌رسند."
                : "کلیدواژه‌ها با متن کامل دایرکت تطبیق دارند و پیش از دستیار بررسی می‌شوند."}
          </span>
        </div>
      )}

      {loading && (
        <div
          role="status"
          aria-label="در حال بارگذاری قانون‌ها"
          className="space-y-4"
        >
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

      {!loading &&
        status === "succeeded" &&
        account &&
        !scopeBlocked &&
        items.length === 0 && (
          <section className="rounded-3xl border border-dashed border-line bg-surface/25 px-6 py-14 text-center">
            <Icon icon={MessageCircle} tile size="lg" tone="accent" />
            <h2 className="mt-5 text-lg font-bold">{emptyTitle}</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-7 text-muted">
              {emptyDescription}
            </p>
            <Button
              type="button"
              className="mt-7"
              startIcon={<Plus className="size-4" />}
              onClick={openCreate}
            >
              ساخت اولین قانون
            </Button>
          </section>
        )}

      {!loading && status === "succeeded" && items.length > 0 && (
        <section aria-labelledby="instagram-rules-heading">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 id="instagram-rules-heading" className="text-sm font-bold">
              قانون‌های فعال
            </h2>
            <Badge variant="muted">{fa(items.length)} قانون</Badge>
          </div>
          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {items.map((automation) => (
                <RuleCard
                  key={automation.id}
                  automation={automation}
                  busy={busyRuleId === automation.id}
                  onEdit={() => {
                    setEditingRule(automation);
                    setEditorOpen(true);
                  }}
                  onDelete={() => setDeletingRule(automation)}
                  onToggle={(active) => void toggleRule(automation, active)}
                />
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      <RuleEditorModal
        automation={editingRule}
        media={media}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSave={saveRule}
        triggers={triggers}
      />

      <Modal
        open={Boolean(deletingRule)}
        onOpenChange={(open) => {
          if (!deleting && !open) setDeletingRule(null);
        }}
      >
        <ModalContent size="sm" closeDisabled={deleting}>
          <ModalHeader>
            <ModalTitle>حذف قانون؟</ModalTitle>
            <ModalDescription>
              پس از حذف، پشتیبان دیگر به «
              {deletingRule?.phrase ??
                (deletingRule
                  ? TRIGGER_LABELS[deletingRule.triggerType]
                  : "")}
              » پاسخ نمی‌دهد.
            </ModalDescription>
          </ModalHeader>
          <ModalFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeletingRule(null)}
              disabled={deleting}
            >
              انصراف
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={deleting}
              onClick={() => void confirmDelete()}
            >
              حذف قانون
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
};
