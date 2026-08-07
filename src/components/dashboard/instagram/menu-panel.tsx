"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  IceCream,
  LayoutGrid,
  MessageCircle,
  Pencil,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { luxe } from "@/components/motion/reveal";
import {
  InstagramRequiredNotice,
  InstagramComingSoonNotice,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import {
  ICE_BREAKERS_MAX_COUNT,
  INSTAGRAM_REPLY_MAX_LENGTH,
  DM_MENU_MAX_COUNT,
  menuTitleMaxLength,
  type InstagramMenuItem,
} from "@/lib/instagram/automations";
import { CHANNEL_CONNECTION_CHANGED_EVENT } from "@/lib/settings-events";
import { fa } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  loadInstagramMenu,
  saveInstagramMenu,
  type InstagramMenuRequestError,
} from "@/store/slices/instagram-menu-slice";

// ---------------------------------------------------------------------------
// Ice-breakers are the tappable questions shown in an empty DM thread;
// the persistent menu is the list behind the hamburger icon inside the thread.
// Both features are in this one panel because they share the same API route,
// the same items table, and the same push-to-Meta flow — and the owner needs
// to see them together to understand why their account has at most four ice
// breakers and five menu entries.
// ---------------------------------------------------------------------------

type DraftItem = {
  localId: string;
  kind: "ice_breaker" | "menu";
  title: string;
  replyText: string;
};

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const errorMessage = (error: unknown) => {
  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as InstagramMenuRequestError).message === "string"
  ) {
    return (error as InstagramMenuRequestError).message;
  }
  return "درخواست انجام نشد؛ دوباره تلاش کنید.";
};

// ---- Item editor modal -----------------------------------------------------

const ItemEditorModal = ({
  item,
  open,
  onOpenChange,
  onSave,
}: {
  item: DraftItem | null;
  /** The kind a new item should have; ignored when editing an existing one. */
  defaultKind: "ice_breaker" | "menu";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (item: DraftItem) => void;
}) => {
  const isEditing = Boolean(item);
  const kind = item?.kind ?? "ice_breaker";
  const titleMax = menuTitleMaxLength(kind);
  const [title, setTitle] = React.useState("");
  const [replyText, setReplyText] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!open) return;
    setTitle(item?.title ?? "");
    setReplyText(item?.replyText ?? "");
    setErrors({});
  }, [item, open]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    const trimTitle = title.trim();
    const trimReply = replyText.trim();
    if (!trimTitle) errs.title = "یک عنوان بنویسید.";
    else if (trimTitle.length > titleMax)
      errs.title = `عنوان حداکثر ${fa(titleMax)} نویسه است.`;
    if (!trimReply) errs.replyText = "متن پاسخ را بنویسید.";
    else if (trimReply.length > INSTAGRAM_REPLY_MAX_LENGTH)
      errs.replyText = "پاسخ حداکثر ۱۰۰۰ نویسه است.";
    if (Object.keys(errs).length) { setErrors(errs); return; }

    onSave({
      localId: item?.localId ?? uid(),
      kind,
      title: trimTitle,
      replyText: trimReply,
    });
    onOpenChange(false);
  };

  const kindLabel = kind === "ice_breaker" ? "سوال آماده" : "گزینهٔ منو";
  const titlePlaceholder =
    kind === "ice_breaker"
      ? "مثلاً: چطور می‌توانم سفارش بدهم؟"
      : "مثلاً: مشاهده محصولات";

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent size="md">
        <ModalHeader>
          <ModalTitle>
            {isEditing ? `ویرایش ${kindLabel}` : `${kindLabel} جدید`}
          </ModalTitle>
          <ModalDescription>
            {kind === "ice_breaker"
              ? "سوالی که مشتری می‌تواند در ابتدای مکالمه روی آن بزند."
              : "گزینه‌ای که در منوی ثابت دایرکت نمایش داده می‌شود."}
          </ModalDescription>
        </ModalHeader>
        <form onSubmit={submit} noValidate>
          <div className="space-y-4 px-5 pb-4 pt-1 sm:px-6">
            <Input
              id="ig-menu-item-title"
              dir="rtl"
              label={kind === "ice_breaker" ? "متن سوال" : "عنوان گزینه"}
              placeholder={titlePlaceholder}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (errors.title) setErrors((p) => ({ ...p, title: "" }));
              }}
              error={errors.title}
              maxLength={titleMax}
              required
            />
            <Textarea
              id="ig-menu-item-reply"
              dir="rtl"
              label="پاسخ اتوماتیک"
              hint="وقتی مشتری روی این مورد بزند، این پیام برایشان ارسال می‌شود."
              placeholder="سلام! برای ثبت سفارش می‌توانید از این لینک استفاده کنید…"
              value={replyText}
              onChange={(e) => {
                setReplyText(e.target.value);
                if (errors.replyText)
                  setErrors((p) => ({ ...p, replyText: "" }));
              }}
              error={errors.replyText}
              maxLength={INSTAGRAM_REPLY_MAX_LENGTH}
              showCount
              rows={4}
              required
            />
          </div>
          <ModalFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
            >
              انصراف
            </Button>
            <Button type="submit">
              {isEditing ? "ذخیره تغییرات" : `افزودن ${kindLabel}`}
            </Button>
          </ModalFooter>
        </form>
      </ModalContent>
    </Modal>
  );
};

// ---- Delete confirmation ---------------------------------------------------

const DeleteItemModal = ({
  item,
  deleting,
  onConfirm,
  onOpenChange,
}: {
  item: DraftItem | null;
  deleting: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
}) => (
  <Modal open={Boolean(item)} onOpenChange={(o) => { if (!deleting) onOpenChange(o); }}>
    <ModalContent size="sm" closeDisabled={deleting}>
      <ModalHeader>
        <ModalTitle>حذف مورد؟</ModalTitle>
        <ModalDescription>
          «{item?.title}» از فهرست حذف می‌شود. برای اعمال روی اینستاگرام باید
          ذخیره کنید.
        </ModalDescription>
      </ModalHeader>
      <ModalFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={deleting}>
          انصراف
        </Button>
        <Button type="button" variant="danger" loading={deleting} onClick={onConfirm}>
          حذف
        </Button>
      </ModalFooter>
    </ModalContent>
  </Modal>
);

// ---- Single item row -------------------------------------------------------

const ItemRow = ({
  item,
  onEdit,
  onDelete,
}: {
  item: DraftItem;
  onEdit: () => void;
  onDelete: () => void;
}) => {
  const reduce = useReducedMotion();
  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
      transition={{ duration: reduce ? 0 : 0.25, ease: luxe }}
      className="flex items-center gap-3 rounded-2xl border border-line bg-surface/35 px-4 py-3"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted">{item.replyText}</p>
      </div>
      <Tooltip content="ویرایش" side="top">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onEdit}
          aria-label={`ویرایش «${item.title}»`}
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
          className="hover:text-danger"
          aria-label={`حذف «${item.title}»`}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </Tooltip>
    </motion.div>
  );
};

// ---- Section ---------------------------------------------------------------

const MenuSection = ({
  addLabel,
  atMax,
  children,
  count,
  description,
  enabled,
  icon,
  max,
  onAdd,
  onToggle,
  savingToggle,
  title,
}: {
  addLabel: string;
  atMax: boolean;
  children: React.ReactNode;
  count: number;
  description: string;
  enabled: boolean;
  icon: typeof IceCream;
  max: number;
  onAdd: () => void;
  onToggle: (next: boolean) => void;
  savingToggle: boolean;
  title: string;
}) => {
  const titleId = React.useId();
  return (
    <section
      aria-labelledby={titleId}
      className="rounded-3xl border border-line bg-surface/35 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start gap-4">
        <Icon icon={icon} tile size="md" tone={enabled ? "accent" : "muted"} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={titleId} className="font-bold">{title}</h2>
            <Badge variant={enabled ? "success" : "muted"} dot>
              {enabled ? "فعال" : "غیرفعال"}
            </Badge>
          </div>
          <p className="mt-2 max-w-xl text-sm leading-7 text-muted">
            {description}
          </p>
        </div>
        <Switch
          checked={enabled}
          disabled={savingToggle}
          aria-label={`فعال‌سازی ${title}`}
          aria-busy={savingToggle}
          onChange={(e) => onToggle(e.target.checked)}
        />
      </div>

      {enabled && (
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted">
              {fa(count)} از {fa(max)}
            </span>
            <Button
              type="button"
              size="sm"
              startIcon={<Plus className="size-3.5" />}
              disabled={atMax}
              onClick={onAdd}
            >
              {addLabel}
            </Button>
          </div>
          <AnimatePresence initial={false}>
            {children}
          </AnimatePresence>
          {count === 0 && (
            <p className="rounded-2xl border border-dashed border-line bg-surface/25 px-4 py-5 text-center text-sm text-muted">
              هنوز موردی اضافه نشده است.
            </p>
          )}
        </div>
      )}
    </section>
  );
};

// ---- Main panel ------------------------------------------------------------

export const InstagramMenuPanel = () => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const { account, menu, status, error, setupRequired } = useAppSelector(
    (state) => state.instagramMenu
  );

  // Local draft — replaces the server state only after a successful save.
  const [iceBreakersEnabled, setIceBreakersEnabled] = React.useState(false);
  const [persistentMenuEnabled, setPersistentMenuEnabled] = React.useState(false);
  const [iceBreakers, setIceBreakers] = React.useState<DraftItem[]>([]);
  const [menuItems, setMenuItems] = React.useState<DraftItem[]>([]);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  // Item editor state
  const [editingItem, setEditingItem] = React.useState<DraftItem | null>(null);
  const [addingKind, setAddingKind] = React.useState<"ice_breaker" | "menu">(
    "ice_breaker"
  );
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [deletingItem, setDeletingItem] = React.useState<DraftItem | null>(null);
  const [confirmingDelete, setConfirmingDelete] = React.useState(false);

  // Sync local draft with server state when the load completes.
  React.useEffect(() => {
    if (status !== "succeeded") return;
    setIceBreakersEnabled(menu.iceBreakersEnabled);
    setPersistentMenuEnabled(menu.persistentMenuEnabled);
    setIceBreakers(
      menu.items
        .filter((item) => item.kind === "ice_breaker")
        .map((item) => ({ ...item, localId: item.id }))
    );
    setMenuItems(
      menu.items
        .filter((item) => item.kind === "menu")
        .map((item) => ({ ...item, localId: item.id }))
    );
    setDirty(false);
  }, [menu, status]);

  React.useEffect(() => {
    if (status === "idle") void dispatch(loadInstagramMenu());
  }, [dispatch, status]);

  React.useEffect(() => {
    const refresh = () => void dispatch(loadInstagramMenu());
    window.addEventListener(CHANNEL_CONNECTION_CHANGED_EVENT, refresh);
    return () =>
      window.removeEventListener(CHANNEL_CONNECTION_CHANGED_EVENT, refresh);
  }, [dispatch]);

  const openAdd = (kind: "ice_breaker" | "menu") => {
    setAddingKind(kind);
    setEditingItem(null);
    setEditorOpen(true);
  };

  const openEdit = (item: DraftItem) => {
    setEditingItem(item);
    setEditorOpen(true);
  };

  const handleSaveItem = (saved: DraftItem) => {
    if (saved.kind === "ice_breaker") {
      setIceBreakers((prev) =>
        prev.some((item) => item.localId === saved.localId)
          ? prev.map((item) =>
              item.localId === saved.localId ? saved : item
            )
          : [...prev, saved]
      );
    } else {
      setMenuItems((prev) =>
        prev.some((item) => item.localId === saved.localId)
          ? prev.map((item) =>
              item.localId === saved.localId ? saved : item
            )
          : [...prev, saved]
      );
    }
    setDirty(true);
  };

  const confirmDelete = () => {
    if (!deletingItem) return;
    setConfirmingDelete(true);
    const { kind, localId } = deletingItem;
    if (kind === "ice_breaker") {
      setIceBreakers((prev) => prev.filter((item) => item.localId !== localId));
    } else {
      setMenuItems((prev) => prev.filter((item) => item.localId !== localId));
    }
    setDirty(true);
    setDeletingItem(null);
    setConfirmingDelete(false);
  };

  const handleToggle = (
    kind: "ice_breakers" | "menu",
    next: boolean
  ) => {
    if (kind === "ice_breakers") setIceBreakersEnabled(next);
    else setPersistentMenuEnabled(next);
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    const result = await dispatch(
      saveInstagramMenu({
        iceBreakersEnabled,
        persistentMenuEnabled,
        items: [
          ...iceBreakers.map(({ kind, title, replyText }) => ({
            kind,
            title,
            replyText,
          })),
          ...menuItems.map(({ kind, title, replyText }) => ({
            kind,
            title,
            replyText,
          })),
        ],
      })
    );
    setSaving(false);

    if (saveInstagramMenu.fulfilled.match(result)) {
      setDirty(false);
      toast({
        title: "منوی دایرکت ذخیره شد",
        description: result.payload.synced
          ? "تغییرات روی اینستاگرام هم اعمال شدند."
          : "تغییرات ذخیره شدند، اما اعمال روی اینستاگرام انجام نشد؛ دوباره ذخیره کنید.",
        variant: result.payload.synced ? "success" : "warning",
      });
    } else {
      toast({
        title: "منوی دایرکت ذخیره نشد",
        description: errorMessage(result.payload),
        variant: "error",
      });
    }
  };

  const loading = status === "idle" || status === "loading";

  return (
    <div>
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-black">منوی دایرکت</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
            سوال‌های آماده را مشتری قبل از شروع مکالمه می‌بیند؛ منوی ثابت
            همیشه داخل مکالمه در دسترس است. هر دو به یک پاسخ آماده وصلند.
          </p>
        </div>
        <Button
          type="button"
          startIcon={<Save className="size-4" />}
          onClick={() => void save()}
          loading={saving}
          disabled={!dirty || loading || !account}
          className="w-full shrink-0 sm:w-auto"
        >
          {dirty ? "ذخیره تغییرات" : "ذخیره منو"}
        </Button>
      </header>

      <div className="mt-8 space-y-5">
        <InstagramComingSoonNotice />
        {setupRequired && (
          <Alert
            variant="warning"
            title="راه‌اندازی منوی دایرکت کامل نشده است"
            description="اسکریپت instagram-automations.sql را در Supabase SQL Editor اجرا کنید."
          >
            <Button
              type="button"
              variant="link"
              className="mt-2"
              onClick={() => void dispatch(loadInstagramMenu())}
            >
              بررسی دوباره
            </Button>
          </Alert>
        )}

        {!setupRequired && status === "failed" && (
          <Alert
            variant="error"
            title="منوی دایرکت بارگذاری نشد"
            description={error ?? "اتصال اینترنت را بررسی کنید."}
          >
            <Button
              type="button"
              variant="link"
              className="mt-2"
              onClick={() => void dispatch(loadInstagramMenu())}
            >
              تلاش دوباره
            </Button>
          </Alert>
        )}

        {!loading && !account && <InstagramRequiredNotice />}

        {loading && (
          <div className="space-y-4" role="status" aria-label="در حال بارگذاری">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="rounded-3xl border border-line bg-surface/35 p-5"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="size-10 rounded-2xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-4 w-64" />
                  </div>
                  <Skeleton className="h-6 w-11 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && account && (
          <>
            <MenuSection
              icon={IceCream}
              title="سوال‌های آماده (Ice Breakers)"
              description="تا ۴ سوال که مشتری قبل از شروع مکالمه می‌بیند و می‌تواند روی آن‌ها بزند. با زدن هر سوال، پاسخ آماده شما برایشان ارسال می‌شود."
              enabled={iceBreakersEnabled}
              count={iceBreakers.length}
              max={ICE_BREAKERS_MAX_COUNT}
              atMax={iceBreakers.length >= ICE_BREAKERS_MAX_COUNT}
              addLabel="سوال جدید"
              onAdd={() => openAdd("ice_breaker")}
              onToggle={(next) => handleToggle("ice_breakers", next)}
              savingToggle={false}
            >
              {iceBreakers.map((item) => (
                <ItemRow
                  key={item.localId}
                  item={item}
                  onEdit={() => openEdit(item)}
                  onDelete={() => setDeletingItem(item)}
                />
              ))}
            </MenuSection>

            <MenuSection
              icon={LayoutGrid}
              title="منوی ثابت دایرکت"
              description="تا ۵ گزینه که در همبرگر منوی داخل مکالمه نمایش داده می‌شوند. مشتری می‌تواند هر زمان به آن‌ها دسترسی داشته باشد."
              enabled={persistentMenuEnabled}
              count={menuItems.length}
              max={DM_MENU_MAX_COUNT}
              atMax={menuItems.length >= DM_MENU_MAX_COUNT}
              addLabel="گزینه جدید"
              onAdd={() => openAdd("menu")}
              onToggle={(next) => handleToggle("menu", next)}
              savingToggle={false}
            >
              {menuItems.map((item) => (
                <ItemRow
                  key={item.localId}
                  item={item}
                  onEdit={() => openEdit(item)}
                  onDelete={() => setDeletingItem(item)}
                />
              ))}
            </MenuSection>

            <p className="text-xs leading-6 text-muted">
              <MessageCircle className="me-1 inline size-3.5" aria-hidden />
              سوال‌های آماده فقط در نسخهٔ موبایل اینستاگرام نمایش داده می‌شوند.
              منوی ثابت در همهٔ سطوح در دسترس است.
            </p>
          </>
        )}
      </div>

      <ItemEditorModal
        item={editingItem}
        defaultKind={addingKind}
        open={editorOpen}
        onOpenChange={setEditorOpen}
        onSave={handleSaveItem}
      />
      <DeleteItemModal
        item={deletingItem}
        deleting={confirmingDelete}
        onConfirm={confirmDelete}
        onOpenChange={(o) => { if (!o) setDeletingItem(null); }}
      />
    </div>
  );
};
