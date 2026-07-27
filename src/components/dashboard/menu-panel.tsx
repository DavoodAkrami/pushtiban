"use client";

import * as React from "react";
import { AnimatePresence, motion, Reorder, useDragControls, useReducedMotion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  GitBranch,
  GripVertical,
  LayoutGrid,
  MessageSquareText,
  Plus,
  Save,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { luxe } from "@/components/motion/reveal";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Switch } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { Tooltip } from "@/components/ui/tooltip";
import {
  buildReplyKeyboard,
  MENU_BUTTON_LABEL_MAX_LENGTH,
  MENU_BUTTONS_MAX,
  MENU_BUTTONS_PER_ROW_MAX,
  MENU_PLACEHOLDER_MAX_LENGTH,
  MENU_ROWS_MAX,
  toKeyboardRows,
  type MenuButtonActionType,
  type TelegramMenu,
} from "@/lib/telegram-menu";
import { fa } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { loadAutomations } from "@/store/slices/automations-slice";
import {
  loadTelegramMenu,
  saveTelegramMenu,
} from "@/store/slices/telegram-menu-slice";

// ─── Draft model ─────────────────────────────────────────────────────────────
// Rows are nested here because that is how the owner arranges them; the flat
// rowIndex/position pairs the API stores are derived on save.

type DraftButton = {
  localId: string;
  label: string;
  actionType: MenuButtonActionType;
  flowId: string | null;
  automationId: string | null;
};

type DraftRow = {
  localId: string;
  buttons: DraftButton[];
};

type Draft = {
  isEnabled: boolean;
  isPersistent: boolean;
  oneTimeKeyboard: boolean;
  inputFieldPlaceholder: string;
  rows: DraftRow[];
};

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const menuToDraft = (menu: TelegramMenu): Draft => ({
  isEnabled: menu.isEnabled,
  isPersistent: menu.isPersistent,
  oneTimeKeyboard: menu.oneTimeKeyboard,
  inputFieldPlaceholder: menu.inputFieldPlaceholder,
  rows: toKeyboardRows(menu.buttons).map((row) => ({
    localId: uid(),
    buttons: row.map((button) => ({
      localId: button.id,
      label: button.label,
      actionType: button.actionType,
      flowId: button.flowId,
      automationId: button.automationId,
    })),
  })),
});

const draftToMenu = (draft: Draft): TelegramMenu => ({
  isEnabled: draft.isEnabled,
  isPersistent: draft.isPersistent,
  // Auto-sizing is always on: a keyboard sized to its content is what every
  // owner wants, so it is not worth a control of its own.
  resizeKeyboard: true,
  oneTimeKeyboard: draft.oneTimeKeyboard,
  inputFieldPlaceholder: draft.inputFieldPlaceholder,
  buttons: draft.rows
    .filter((row) => row.buttons.length > 0)
    .flatMap((row, rowIndex) =>
      row.buttons.map((button, position) => ({
        id: button.localId,
        label: button.label,
        rowIndex,
        position,
        actionType: button.actionType,
        flowId: button.flowId,
        automationId: button.automationId,
      }))
    ),
});

const countButtons = (draft: Draft) =>
  draft.rows.reduce((total, row) => total + row.buttons.length, 0);

const targetValue = (button: DraftButton) => {
  if (button.actionType === "flow") return button.flowId ? `flow:${button.flowId}` : "";
  return button.automationId ? `reply:${button.automationId}` : "";
};

/** First problem with the draft, in Persian, or null when it is ready to save. */
const validateDraft = (draft: Draft): string | null => {
  const seen = new Set<string>();

  for (const row of draft.rows) {
    for (const button of row.buttons) {
      const label = button.label.trim();
      if (!label) return "برای همهٔ دکمه‌ها عنوان بنویسید.";
      if (label.startsWith("/"))
        return `عنوان «${label}» نباید با «/» شروع شود؛ تلگرام آن را فرمان می‌خواند.`;
      if (!targetValue(button))
        return `مقصد دکمهٔ «${label}» را انتخاب کنید.`;

      const key = label.toLocaleLowerCase(["fa-IR", "en-US"]);
      if (seen.has(key)) return `عنوان «${label}» برای دو دکمه تکرار شده است.`;
      seen.add(key);
    }
  }

  return null;
};

// ─── Button editor ───────────────────────────────────────────────────────────

const ButtonEditorCard = ({
  button,
  canMoveEnd,
  canMoveStart,
  onChange,
  onMove,
  onRemove,
  rowOptions,
  rowValue,
  onRowChange,
  targetOptions,
}: {
  button: DraftButton;
  canMoveEnd: boolean;
  canMoveStart: boolean;
  onChange: (button: DraftButton) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  rowOptions: SelectOption[];
  rowValue: string;
  onRowChange: (value: string) => void;
  targetOptions: SelectOption[];
}) => (
  <div className="w-full space-y-3 rounded-2xl border border-accent/40 bg-card p-3.5 shadow-soft">
    <div className="flex items-start gap-2">
      <Input
        id={`menu-button-label-${button.localId}`}
        label="عنوان دکمه"
        placeholder="مثلاً 🛍 محصولات"
        value={button.label}
        onChange={(event) => onChange({ ...button, label: event.target.value })}
        maxLength={MENU_BUTTON_LABEL_MAX_LENGTH}
        hint="همین متن با زدن دکمه برای ربات فرستاده می‌شود."
        className="min-w-0 flex-1"
      />
      <Tooltip content="حذف دکمه" side="top">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          className="mt-8 shrink-0 hover:text-danger"
          aria-label={`حذف دکمهٔ ${button.label || "بدون عنوان"}`}
        >
          <X className="size-4" aria-hidden />
        </Button>
      </Tooltip>
    </div>

    <Select
      id={`menu-button-target-${button.localId}`}
      label="با زدن این دکمه"
      options={targetOptions}
      value={targetValue(button)}
      searchable
      placeholder="یک فلو یا پیام آماده را انتخاب کنید"
      onChange={(value) => {
        const [kind, id] = value.split(":");
        onChange({
          ...button,
          actionType: kind === "reply" ? "reply" : "flow",
          flowId: kind === "flow" ? id : null,
          automationId: kind === "reply" ? id : null,
        });
      }}
    />

    <div className="flex items-end gap-2">
      <Select
        id={`menu-button-row-${button.localId}`}
        label="ردیف"
        options={rowOptions}
        value={rowValue}
        onChange={onRowChange}
        className="min-w-0 flex-1"
      />
      <div className="flex shrink-0 gap-1 pb-0.5">
        <Tooltip content="جابه‌جایی به جایگاه قبلی" side="top">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onMove(-1)}
            disabled={!canMoveStart}
            aria-label="انتقال به جایگاه قبلی در ردیف"
          >
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </Tooltip>
        <Tooltip content="جابه‌جایی به جایگاه بعدی" side="top">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onMove(1)}
            disabled={!canMoveEnd}
            aria-label="انتقال به جایگاه بعدی در ردیف"
          >
            <ChevronLeft className="size-4" aria-hidden />
          </Button>
        </Tooltip>
      </div>
    </div>
  </div>
);

// ─── Row ─────────────────────────────────────────────────────────────────────

const MenuRowEditor = ({
  canAddButton,
  index,
  onAddButton,
  onChangeButton,
  onMoveButton,
  onRemoveButton,
  onRemoveRow,
  onRowChangeButton,
  openButtonId,
  reduce,
  row,
  rowOptions,
  setOpenButtonId,
  targetOptions,
}: {
  canAddButton: boolean;
  index: number;
  onAddButton: () => void;
  onChangeButton: (localId: string, button: DraftButton) => void;
  onMoveButton: (localId: string, direction: -1 | 1) => void;
  onRemoveButton: (localId: string) => void;
  onRemoveRow: () => void;
  onRowChangeButton: (localId: string, rowLocalId: string) => void;
  openButtonId: string | null;
  reduce: boolean;
  row: DraftRow;
  rowOptions: SelectOption[];
  setOpenButtonId: (localId: string | null) => void;
  targetOptions: SelectOption[];
}) => {
  const controls = useDragControls();

  return (
    <Reorder.Item
      value={row}
      dragListener={false}
      dragControls={controls}
      className="rounded-2xl border border-line bg-surface/40 p-3"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          onPointerDown={(event) => controls.start(event)}
          aria-label={`جابه‌جایی ردیف ${fa(index + 1)}`}
          className="flex size-7 cursor-grab touch-none items-center justify-center rounded-full text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 active:cursor-grabbing"
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
        <span className="text-xs text-muted">ردیف {fa(index + 1)}</span>
        <span className="ms-auto flex items-center gap-1">
          <Tooltip content="افزودن دکمه به این ردیف" side="top">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onAddButton}
              disabled={!canAddButton}
              aria-label={`افزودن دکمه به ردیف ${fa(index + 1)}`}
            >
              <Plus className="size-4" aria-hidden />
            </Button>
          </Tooltip>
          <Tooltip content="حذف ردیف" side="top">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onRemoveRow}
              className="hover:text-danger"
              aria-label={`حذف ردیف ${fa(index + 1)}`}
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </Tooltip>
        </span>
      </div>

      {row.buttons.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-muted">
          این ردیف خالی است؛ یک دکمه به آن اضافه کنید.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-start gap-2">
          {row.buttons.map((button, buttonIndex) => {
            const open = openButtonId === button.localId;

            return (
              <div key={button.localId} className={open ? "w-full" : ""}>
                <AnimatePresence initial={false} mode="wait">
                  {open ? (
                    <motion.div
                      key="editor"
                      initial={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
                      transition={{ duration: reduce ? 0 : 0.22, ease: luxe }}
                    >
                      <ButtonEditorCard
                        button={button}
                        canMoveStart={buttonIndex > 0}
                        canMoveEnd={buttonIndex < row.buttons.length - 1}
                        onChange={(next) => onChangeButton(button.localId, next)}
                        onMove={(direction) =>
                          onMoveButton(button.localId, direction)
                        }
                        onRemove={() => onRemoveButton(button.localId)}
                        rowOptions={rowOptions}
                        rowValue={row.localId}
                        onRowChange={(value) =>
                          onRowChangeButton(button.localId, value)
                        }
                        targetOptions={targetOptions}
                      />
                    </motion.div>
                  ) : (
                    <motion.button
                      key="chip"
                      type="button"
                      onClick={() => setOpenButtonId(button.localId)}
                      initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: reduce ? 0 : 0.18, ease: luxe }}
                      className="max-w-[13rem] truncate rounded-full border border-line bg-card px-4 py-2 text-sm transition-colors hover:border-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                    >
                      {button.label.trim() || "دکمهٔ بدون عنوان"}
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </Reorder.Item>
  );
};

// ─── Preview ─────────────────────────────────────────────────────────────────

const KeyboardPreview = ({ draft }: { draft: Draft }) => {
  // Previewed as if switched on, so the owner can always see the layout they
  // are building; whether it is live is said in words below.
  const keyboard = buildReplyKeyboard({
    ...draftToMenu(draft),
    isEnabled: true,
  });
  const placeholder = draft.inputFieldPlaceholder.trim();

  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-background">
      <div className="border-b border-line bg-surface/60 px-4 py-3">
        <p className="text-xs text-muted">ربات شما</p>
      </div>

      <div className="space-y-2 px-4 py-5">
        <p className="w-fit max-w-[85%] rounded-2xl rounded-ss-md bg-surface px-3.5 py-2.5 text-sm leading-6">
          سلام! چطور می‌توانم کمکتان کنم؟
        </p>
      </div>

      {keyboard ? (
        <div className="space-y-1.5 border-t border-line bg-surface/40 p-3">
          <div
            className="truncate rounded-2xl border border-line bg-background px-3 py-2 text-xs text-muted"
            aria-hidden
          >
            {placeholder || "پیام"}
          </div>
          {keyboard.keyboard.map((row, rowIndex) => (
            <div key={rowIndex} className="flex gap-1.5">
              {row.map((button, buttonIndex) => (
                <span
                  key={buttonIndex}
                  className="min-w-0 flex-1 truncate rounded-xl bg-card px-3 py-2.5 text-center text-sm"
                >
                  {button.text}
                </span>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div className="border-t border-line bg-surface/40 p-6 text-center">
          <p className="text-xs leading-6 text-muted">
            هنوز دکمه‌ای اضافه نکرده‌اید؛ پیش‌نمایش منو بعد از ساخت اولین دکمه
            اینجا دیده می‌شود.
          </p>
        </div>
      )}
    </div>
  );
};

// ─── Panel ───────────────────────────────────────────────────────────────────

export const MenuPanel = () => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const reduce = useReducedMotion() ?? false;
  const { connected, error, menu, setupRequired, status, targets } =
    useAppSelector((state) => state.telegramMenu);
  const { bot, status: connectionStatus } = useAppSelector(
    (state) => state.automations
  );

  const [draft, setDraft] = React.useState<Draft>(() => menuToDraft(menu));
  const [openButtonId, setOpenButtonId] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (status === "idle") void dispatch(loadTelegramMenu());
    if (connectionStatus === "idle") void dispatch(loadAutomations());
  }, [connectionStatus, dispatch, status]);

  // Adopt the server copy whenever it changes and nothing local is pending.
  React.useEffect(() => {
    if (dirty) return;
    setDraft(menuToDraft(menu));
  }, [dirty, menu]);

  const update = React.useCallback((next: Draft) => {
    setDraft(next);
    setDirty(true);
  }, []);

  const loading = status === "idle" || status === "loading";
  const buttonCount = countButtons(draft);
  const hasTargets = targets.flows.length + targets.replies.length > 0;

  const targetOptions = React.useMemo<SelectOption[]>(
    () => [
      ...targets.flows.map((target) => ({
        value: `flow:${target.id}`,
        label: target.label,
        description: target.hint,
        icon: <GitBranch className="size-4" aria-hidden />,
      })),
      ...targets.replies.map((target) => ({
        value: `reply:${target.id}`,
        label: target.label,
        description: target.hint,
        icon: <MessageSquareText className="size-4" aria-hidden />,
      })),
    ],
    [targets]
  );

  const rowOptions = React.useMemo<SelectOption[]>(
    () =>
      draft.rows.map((row, index) => ({
        value: row.localId,
        label: `ردیف ${fa(index + 1)}`,
      })),
    [draft.rows]
  );

  // ─── Draft operations ──────────────────────────────────────────────────────

  const addRow = () => {
    if (draft.rows.length >= MENU_ROWS_MAX) return;
    update({ ...draft, rows: [...draft.rows, { localId: uid(), buttons: [] }] });
  };

  const addButton = (rowLocalId: string) => {
    if (buttonCount >= MENU_BUTTONS_MAX) return;
    const localId = uid();
    update({
      ...draft,
      rows: draft.rows.map((row) =>
        row.localId === rowLocalId
          ? {
              ...row,
              buttons: [
                ...row.buttons,
                {
                  localId,
                  label: "",
                  actionType: "flow" as MenuButtonActionType,
                  flowId: null,
                  automationId: null,
                },
              ],
            }
          : row
      ),
    });
    setOpenButtonId(localId);
  };

  const mapRow = (rowLocalId: string, map: (row: DraftRow) => DraftRow) =>
    update({
      ...draft,
      rows: draft.rows.map((row) =>
        row.localId === rowLocalId ? map(row) : row
      ),
    });

  const changeButton = (
    rowLocalId: string,
    localId: string,
    button: DraftButton
  ) =>
    mapRow(rowLocalId, (row) => ({
      ...row,
      buttons: row.buttons.map((item) =>
        item.localId === localId ? button : item
      ),
    }));

  const removeButton = (rowLocalId: string, localId: string) => {
    if (openButtonId === localId) setOpenButtonId(null);
    mapRow(rowLocalId, (row) => ({
      ...row,
      buttons: row.buttons.filter((item) => item.localId !== localId),
    }));
  };

  const removeRow = (rowLocalId: string) => {
    const row = draft.rows.find((item) => item.localId === rowLocalId);
    if (row?.buttons.some((button) => button.localId === openButtonId))
      setOpenButtonId(null);
    update({
      ...draft,
      rows: draft.rows.filter((item) => item.localId !== rowLocalId),
    });
  };

  const moveButton = (
    rowLocalId: string,
    localId: string,
    direction: -1 | 1
  ) =>
    mapRow(rowLocalId, (row) => {
      const from = row.buttons.findIndex((item) => item.localId === localId);
      const to = from + direction;
      if (from < 0 || to < 0 || to >= row.buttons.length) return row;
      const buttons = [...row.buttons];
      [buttons[from], buttons[to]] = [buttons[to], buttons[from]];
      return { ...row, buttons };
    });

  const moveButtonToRow = (
    fromRowLocalId: string,
    localId: string,
    toRowLocalId: string
  ) => {
    if (fromRowLocalId === toRowLocalId) return;
    const target = draft.rows.find((row) => row.localId === toRowLocalId);
    if (!target) return;
    if (target.buttons.length >= MENU_BUTTONS_PER_ROW_MAX) {
      toast({
        title: `هر ردیف حداکثر ${fa(MENU_BUTTONS_PER_ROW_MAX)} دکمه دارد`,
        description: "ابتدا یک دکمه از آن ردیف را جابه‌جا یا حذف کنید.",
        variant: "warning",
      });
      return;
    }

    const moving = draft.rows
      .find((row) => row.localId === fromRowLocalId)
      ?.buttons.find((item) => item.localId === localId);
    if (!moving) return;

    update({
      ...draft,
      rows: draft.rows.map((row) => {
        if (row.localId === fromRowLocalId)
          return {
            ...row,
            buttons: row.buttons.filter((item) => item.localId !== localId),
          };
        if (row.localId === toRowLocalId)
          return { ...row, buttons: [...row.buttons, moving] };
        return row;
      }),
    });
  };

  /** Seed one button per flow so the first menu is a single click away. */
  const seedFromFlows = () => {
    const rows: DraftRow[] = [];
    // Two per row: wide enough to read comfortably, tight enough that a short
    // menu still fills the width.
    targets.flows.slice(0, MENU_ROWS_MAX * 2).forEach((target, index) => {
      if (index % 2 === 0) rows.push({ localId: uid(), buttons: [] });
      rows[rows.length - 1].buttons.push({
        localId: uid(),
        label: target.label.slice(0, MENU_BUTTON_LABEL_MAX_LENGTH),
        actionType: "flow",
        flowId: target.id,
        automationId: null,
      });
    });
    update({ ...draft, isEnabled: true, rows: rows.slice(0, MENU_ROWS_MAX) });
  };

  const save = async () => {
    const problem = validateDraft(draft);
    if (problem) {
      toast({ title: "منو آمادهٔ ذخیره نیست", description: problem, variant: "error" });
      return;
    }

    setSaving(true);
    const result = await dispatch(saveTelegramMenu(draftToMenu(draft)));
    setSaving(false);

    if (saveTelegramMenu.fulfilled.match(result)) {
      setDirty(false);
      setOpenButtonId(null);
      toast({
        title: "منو ذخیره شد",
        description: draft.isEnabled
          ? "از اولین پیام بعدی ربات، منو برای هر مخاطب نمایش داده می‌شود."
          : "منو ذخیره شد و خاموش است؛ هر وقت خواستید روشنش کنید.",
        variant: "success",
      });
      return;
    }

    toast({
      title: "منو ذخیره نشد",
      description:
        result.payload?.message ?? "اتصال را بررسی کنید و دوباره تلاش کنید.",
      variant: "error",
    });
  };

  return (
    <div className="mx-auto max-w-6xl">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-black">منوی ربات</h1>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
            دکمه‌هایی که همیشه پایین صفحهٔ چت می‌مانند، جای کیبورد مخاطب. هر
            دکمه را به یک فلو یا پیام آماده وصل کنید تا با یک لمس اجرا شود.
          </p>
        </div>
        <Button
          type="button"
          loading={saving}
          startIcon={<Save className="size-4" />}
          onClick={() => void save()}
          disabled={loading || !connected}
          className="w-full shrink-0 sm:w-auto"
        >
          {dirty ? "ذخیره تغییرات" : "ذخیره منو"}
        </Button>
      </header>

      <div className="mt-8 space-y-5">
        {setupRequired && (
          <Alert
            variant="warning"
            title="راه‌اندازی منوی ربات کامل نشده است"
            description={
              error ??
              "اسکریپت telegram-menu.sql را در Supabase اجرا کنید، سپس دوباره بررسی کنید."
            }
          >
            <Button
              type="button"
              variant="link"
              className="mt-2"
              onClick={() => void dispatch(loadTelegramMenu())}
            >
              بررسی دوباره
            </Button>
          </Alert>
        )}

        {!setupRequired && status === "failed" && (
          <Alert
            variant="error"
            title="منوی ربات بارگذاری نشد"
            description={error ?? "اتصال اینترنت را بررسی کنید."}
          >
            <Button
              type="button"
              variant="link"
              className="mt-2"
              onClick={() => void dispatch(loadTelegramMenu())}
            >
              تلاش دوباره
            </Button>
          </Alert>
        )}

        {!loading && status === "succeeded" && !connected && (
          <Alert
            variant="info"
            title="ابتدا ربات تلگرام را متصل کنید"
            description="از منوی حساب وارد تنظیمات و بخش اتصالات شوید. پس از اتصال ربات، می‌توانید منو را بسازید."
          />
        )}

        {loading && (
          <div
            role="status"
            aria-label="در حال بارگذاری منو"
            className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]"
          >
            <div className="space-y-3 rounded-3xl border border-line bg-surface/25 p-5">
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-14 w-full rounded-2xl" />
              <Skeleton className="h-14 w-full rounded-2xl" />
            </div>
            <Skeleton className="h-64 w-full rounded-3xl" />
          </div>
        )}

        {!loading && connected && (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <section
              aria-labelledby="menu-layout-title"
              className="rounded-3xl border border-line bg-surface/25 p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-4">
                <div className="min-w-0">
                  <h2 id="menu-layout-title" className="text-sm font-bold">
                    چیدمان دکمه‌ها
                  </h2>
                  <p className="mt-1 text-xs text-muted">
                    {fa(buttonCount)} از {fa(MENU_BUTTONS_MAX)} دکمه ·{" "}
                    {fa(draft.rows.length)} از {fa(MENU_ROWS_MAX)} ردیف
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <label
                    htmlFor="menu-enabled"
                    className="text-sm font-medium"
                  >
                    منو فعال است
                  </label>
                  <Switch
                    id="menu-enabled"
                    checked={draft.isEnabled}
                    onChange={(event) =>
                      update({ ...draft, isEnabled: event.target.checked })
                    }
                  />
                </div>
              </div>

              {!hasTargets ? (
                <div className="mt-5 rounded-2xl border border-dashed border-line bg-background/35 px-6 py-12 text-center">
                  <Icon icon={GitBranch} tile size="lg" tone="accent" />
                  <h3 className="mt-5 text-base font-bold">
                    اول یک فلو یا پیام آماده بسازید
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted">
                    هر دکمهٔ منو یکی از آن‌ها را اجرا می‌کند، پس تا وقتی چیزی
                    برای اجرا نباشد منو کاری نمی‌تواند بکند.
                  </p>
                  <Link
                    href="/dashboard/flow"
                    className={buttonVariants({ className: "mt-6" })}
                  >
                    ساخت فلو
                  </Link>
                </div>
              ) : draft.rows.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-line bg-background/35 px-6 py-12 text-center">
                  <Icon icon={LayoutGrid} tile size="lg" tone="accent" />
                  <h3 className="mt-5 text-base font-bold">
                    اولین ردیف را بسازید
                  </h3>
                  <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-muted">
                    دکمه‌ها را ردیف‌به‌ردیف بچینید، دقیقاً همان‌طور که مخاطب
                    آن‌ها را در تلگرام می‌بیند.
                  </p>
                  <div className="mt-6 flex flex-wrap justify-center gap-2">
                    <Button
                      type="button"
                      startIcon={<Plus className="size-4" />}
                      onClick={addRow}
                    >
                      افزودن ردیف
                    </Button>
                    {targets.flows.length > 0 && (
                      <Button
                        type="button"
                        variant="secondary"
                        startIcon={<Sparkles className="size-4" />}
                        onClick={seedFromFlows}
                      >
                        ساخت از فلوهای موجود
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <Reorder.Group
                    axis="y"
                    values={draft.rows}
                    onReorder={(rows) => update({ ...draft, rows })}
                    className="mt-5 space-y-3"
                  >
                    {draft.rows.map((row, index) => (
                      <MenuRowEditor
                        key={row.localId}
                        row={row}
                        index={index}
                        reduce={reduce}
                        openButtonId={openButtonId}
                        setOpenButtonId={setOpenButtonId}
                        rowOptions={rowOptions}
                        targetOptions={targetOptions}
                        canAddButton={
                          row.buttons.length < MENU_BUTTONS_PER_ROW_MAX &&
                          buttonCount < MENU_BUTTONS_MAX
                        }
                        onAddButton={() => addButton(row.localId)}
                        onChangeButton={(localId, button) =>
                          changeButton(row.localId, localId, button)
                        }
                        onMoveButton={(localId, direction) =>
                          moveButton(row.localId, localId, direction)
                        }
                        onRemoveButton={(localId) =>
                          removeButton(row.localId, localId)
                        }
                        onRemoveRow={() => removeRow(row.localId)}
                        onRowChangeButton={(localId, toRowLocalId) =>
                          moveButtonToRow(row.localId, localId, toRowLocalId)
                        }
                      />
                    ))}
                  </Reorder.Group>

                  <Button
                    type="button"
                    variant="ghost"
                    startIcon={<Plus className="size-4" />}
                    onClick={addRow}
                    disabled={draft.rows.length >= MENU_ROWS_MAX}
                    className="mt-3"
                  >
                    افزودن ردیف
                  </Button>
                </>
              )}
            </section>

            <div className="space-y-5">
              <section aria-labelledby="menu-preview-title">
                <h2
                  id="menu-preview-title"
                  className="mb-3 text-sm font-bold"
                >
                  پیش‌نمایش
                </h2>
                <KeyboardPreview draft={draft} />
                <p className="mt-3 text-xs leading-6 text-muted">
                  منوی جدید از اولین پیام بعدی ربات برای هر مخاطب نمایش داده
                  می‌شود؛ تلگرام راهی برای تغییر آنی چت‌های باز نمی‌دهد.
                </p>
              </section>

              <section
                aria-labelledby="menu-settings-title"
                className="rounded-3xl border border-line bg-surface/25 p-4"
              >
                <h2 id="menu-settings-title" className="text-sm font-bold">
                  تنظیمات منو
                </h2>

                <div className="mt-4 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <label
                        htmlFor="menu-persistent"
                        className="text-sm font-medium"
                      >
                        همیشه باز بماند
                      </label>
                      <p
                        id="menu-persistent-description"
                        className="mt-1 text-xs leading-5 text-muted"
                      >
                        منو باز می‌ماند تا مخاطب خودش آن را ببندد.
                      </p>
                    </div>
                    <Switch
                      id="menu-persistent"
                      checked={draft.isPersistent}
                      onChange={(event) =>
                        update({ ...draft, isPersistent: event.target.checked })
                      }
                      aria-describedby="menu-persistent-description"
                    />
                  </div>

                  <div className="flex items-start justify-between gap-4 border-t border-line pt-4">
                    <div className="min-w-0">
                      <label
                        htmlFor="menu-one-time"
                        className="text-sm font-medium"
                      >
                        بستن پس از یک انتخاب
                      </label>
                      <p
                        id="menu-one-time-description"
                        className="mt-1 text-xs leading-5 text-muted"
                      >
                        با زدن هر دکمه، منو جمع می‌شود و کیبورد برمی‌گردد.
                      </p>
                    </div>
                    <Switch
                      id="menu-one-time"
                      checked={draft.oneTimeKeyboard}
                      onChange={(event) =>
                        update({
                          ...draft,
                          oneTimeKeyboard: event.target.checked,
                        })
                      }
                      aria-describedby="menu-one-time-description"
                    />
                  </div>

                  <div className="border-t border-line pt-4">
                    <Input
                      id="menu-placeholder"
                      label="متن راهنمای کادر پیام"
                      placeholder="مثلاً یکی از گزینه‌ها را انتخاب کنید"
                      value={draft.inputFieldPlaceholder}
                      onChange={(event) =>
                        update({
                          ...draft,
                          inputFieldPlaceholder: event.target.value,
                        })
                      }
                      maxLength={MENU_PLACEHOLDER_MAX_LENGTH}
                      hint="اختیاری. جای «پیام» در کادر تایپ نوشته می‌شود."
                    />
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}

        {!loading && connected && bot && (
          <p className="text-xs text-muted">
            منو برای ربات{" "}
            <span dir="ltr" className="font-medium">
              @{bot.username}
            </span>{" "}
            ساخته می‌شود.
          </p>
        )}
      </div>
    </div>
  );
};
