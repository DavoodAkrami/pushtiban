"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { motion, useReducedMotion } from "framer-motion";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  ArrowRight,
  CornerDownLeft,
  Flag,
  GripVertical,
  Link2,
  MessageSquare,
  Plus,
  Save,
  Trash2,
  Workflow,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  FLOW_BACK_BUTTON_LABEL_MAX_LENGTH,
  DEFAULT_FLOW_BACK_BUTTON_LABEL,
  DEFAULT_FLOW_KEYBOARD_ACTION,
  FLOW_URL_MAX_LENGTH,
  countRenderedButtons,
  flowLimits,
  type AutomationFlowDetail,
  type FlowButtonActionType,
  type FlowChannel,
  type FlowKeyboardAction,
} from "@/lib/flows";
import { cn, fa } from "@/lib/utils";
import { useDashboardTitle } from "@/components/dashboard/title-context";
import { useAppDispatch } from "@/store/hooks";
import { updateFlow } from "@/store/slices/flows-slice";

type DraftButton = {
  localId: string;
  label: string;
  actionType: FlowButtonActionType;
  childLocalId: string | null;
  url: string;
};

type DraftNode = {
  localId: string;
  messageText: string;
  isRoot: boolean;
  replaceOnButtonClick: boolean;
  backButtonEnabled: boolean;
  backButtonLabel: string;
  keyboardAction: FlowKeyboardAction;
  buttons: DraftButton[];
};

type ConversationNodeData = {
  draft: DraftNode;
  order: number;
};

type ConversationCanvasNode = Node<ConversationNodeData, "conversation">;

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const flowToDraft = (flow: AutomationFlowDetail): DraftNode[] => {
  const idMap = new Map<string, string>();
  const nodes: DraftNode[] = flow.nodes.map((node) => {
    const localId = node.id;
    idMap.set(node.id, localId);
    return {
      localId,
      messageText: node.messageText,
      isRoot: node.isRoot,
      replaceOnButtonClick: node.replaceOnButtonClick,
      backButtonEnabled: node.backButtonEnabled,
      backButtonLabel:
        node.backButtonLabel || DEFAULT_FLOW_BACK_BUTTON_LABEL,
      keyboardAction: node.keyboardAction ?? DEFAULT_FLOW_KEYBOARD_ACTION,
      buttons: [],
    } satisfies DraftNode;
  });

  flow.nodes.forEach((node, index) => {
    nodes[index].buttons = node.buttons.map((button) => ({
      localId: button.id,
      label: button.label,
      actionType: button.actionType,
      childLocalId: button.nextNodeId
        ? (idMap.get(button.nextNodeId) ?? null)
        : null,
      url: button.url ?? "",
    }));
  });

  return nodes.sort((first, second) => Number(second.isRoot) - Number(first.isRoot));
};

const draftToApiNodes = (nodes: DraftNode[]) => {
  const indexMap = new Map<string, number>();
  nodes.forEach((node, index) => indexMap.set(node.localId, index));

  return nodes.map((node) => ({
    messageText: node.messageText.trim(),
    isRoot: node.isRoot,
    replaceOnButtonClick: node.replaceOnButtonClick,
    backButtonEnabled: node.backButtonEnabled,
    backButtonLabel:
      node.backButtonLabel.trim() || DEFAULT_FLOW_BACK_BUTTON_LABEL,
    keyboardAction: node.keyboardAction,
    buttons: node.buttons.map((button, position) => ({
      label: button.label.trim(),
      actionType: button.actionType,
      nextNodeIndex:
        button.actionType === "node" && button.childLocalId
          ? indexMap.get(button.childLocalId)
          : undefined,
      url: button.actionType === "url" ? button.url.trim() : undefined,
      position,
    })),
  }));
};

const initialPosition = (index: number) => ({
  x: 640 - (index % 3) * 340,
  y: 64 + Math.floor(index / 3) * 320,
});

const actionOptions: SelectOption[] = [
  {
    value: "node",
    label: "پیام بعدی",
    description: "ادامه مکالمه با یک پیام دیگر",
  },
  {
    value: "url",
    label: "باز کردن لینک",
    description: "هدایت کاربر به یک آدرس اینترنتی",
  },
  {
    value: "end",
    label: "پایان مکالمه",
    description: "بستن این مسیر بدون اقدام بعدی",
  },
];

const actionLabels: Record<FlowButtonActionType, string> = {
  node: "پیام",
  url: "لینک",
  end: "پایان",
};

const keyboardActionOptions: SelectOption[] = [
  {
    value: "inherit",
    label: "بدون تغییر",
    description: "منو همان‌طور که هست روی صفحهٔ مخاطب می‌ماند",
  },
  {
    value: "show",
    label: "نمایش منو",
    description: "منوی ربات را پایین صفحه برمی‌گرداند",
  },
  {
    value: "remove",
    label: "برداشتن منو",
    description: "منو را پنهان می‌کند تا مخاطب فقط تایپ کند",
  },
];

const ConversationNode = React.memo(
  ({ data, selected }: NodeProps<ConversationCanvasNode>) => {
    const { draft, order } = data;

    return (
      <article
      className={cn(
        "w-[17.5rem] rounded-3xl border bg-card p-4 shadow-soft transition-colors duration-300",
        selected ? "border-accent/70" : "border-line"
      )}
      aria-label={draft.isRoot ? "پیام شروع فلو" : `پیام ${fa(order + 1)}`}
    >
      <Handle
        type="target"
        position={Position.Right}
        className="!size-3 !border-2 !border-card !bg-accent"
      />

      <header className="flex items-center gap-2.5">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-2xl",
            draft.isRoot
              ? "bg-accent/15 text-accent"
              : "bg-surface text-muted"
          )}
        >
          <MessageSquare className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs text-muted">
            {draft.isRoot ? "شروع مکالمه" : `پیام ${fa(order + 1)}`}
          </span>
          <span className="mt-0.5 block truncate text-sm font-bold">
            {draft.messageText.trim() || "پیام بدون متن"}
          </span>
        </span>
        <GripVertical className="size-4 shrink-0 text-muted" aria-hidden />
      </header>

      <p
        dir="auto"
        className="mt-3 line-clamp-3 min-h-[3.75rem] whitespace-pre-wrap text-sm leading-6 text-muted"
      >
        {draft.messageText.trim() || "متن این پیام را از پنل ویرایش بنویسید."}
      </p>

      {(draft.replaceOnButtonClick ||
        draft.backButtonEnabled ||
        draft.keyboardAction !== "inherit") && (
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-muted">
          {draft.replaceOnButtonClick && (
            <span className="rounded-full bg-accent/10 px-2 py-1 text-accent">
              جایگزینی پیام
            </span>
          )}
          {draft.backButtonEnabled && (
            <span className="rounded-full bg-surface px-2 py-1">
              دکمه بازگشت
            </span>
          )}
          {draft.keyboardAction === "show" && (
            <span className="rounded-full bg-surface px-2 py-1">
              نمایش منو
            </span>
          )}
          {draft.keyboardAction === "remove" && (
            <span className="rounded-full bg-surface px-2 py-1">
              برداشتن منو
            </span>
          )}
        </div>
      )}

      <div className="mt-3 border-t border-line pt-3">
        {draft.buttons.length > 0 ? (
          <div className="space-y-1.5">
            {draft.buttons.slice(0, 3).map((button) => (
              <div
                key={button.localId}
                className="flex items-center gap-2 rounded-2xl bg-surface/70 px-3 py-2 text-xs"
              >
                <span className="min-w-0 flex-1 truncate">
                  {button.label || "دکمه بدون عنوان"}
                </span>
                <span className="shrink-0 text-muted">
                  {actionLabels[button.actionType]}
                </span>
              </div>
            ))}
            {draft.buttons.length > 3 && (
              <p className="px-2 text-xs text-muted">
                {fa(draft.buttons.length - 3)} دکمه دیگر
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted">بدون دکمه</p>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Left}
        className="!size-3 !border-2 !border-card !bg-accent"
      />
      </article>
    );
  }
);
ConversationNode.displayName = "ConversationNode";

const nodeTypes = { conversation: ConversationNode };

const ButtonEditor = ({
  button,
  channel,
  node,
  nodes,
  onChange,
  onRemove,
}: {
  button: DraftButton;
  channel: FlowChannel;
  node: DraftNode;
  nodes: DraftNode[];
  onChange: (button: DraftButton) => void;
  onRemove: () => void;
}) => {
  const destinationOptions: SelectOption[] = nodes
    .filter((item) => item.localId !== node.localId)
    .map((item, index) => ({
      value: item.localId,
      label: item.isRoot
        ? "پیام شروع"
        : item.messageText.trim().slice(0, 42) || `پیام ${fa(index + 1)}`,
    }));

  return (
    <div className="space-y-3 rounded-2xl border border-line bg-background/55 p-3">
      <div className="flex items-start gap-2">
        <Input
          id={`flow-button-label-${button.localId}`}
          label="عنوان دکمه"
          placeholder="مثلاً مشاهده محصولات"
          value={button.label}
          onChange={(event) =>
            onChange({ ...button, label: event.target.value })
          }
          maxLength={flowLimits(channel).buttonLabelMaxLength}
          className="min-w-0 flex-1"
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="حذف دکمه"
          className="mt-8 flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/60"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <Select
        id={`flow-button-action-${button.localId}`}
        label="عملکرد دکمه"
        options={actionOptions}
        value={button.actionType}
        onChange={(value) =>
          onChange({
            ...button,
            actionType: value as FlowButtonActionType,
            childLocalId: null,
            url: "",
          })
        }
      />

      {button.actionType === "node" && (
        <Select
          id={`flow-button-destination-${button.localId}`}
          label="پیام مقصد"
          options={destinationOptions}
          value={button.childLocalId ?? ""}
          onChange={(value) =>
            onChange({ ...button, childLocalId: value || null })
          }
          placeholder="یک پیام را انتخاب کنید"
        />
      )}

      {button.actionType === "url" && (
        <Input
          id={`flow-button-url-${button.localId}`}
          dir="ltr"
          label="آدرس لینک"
          placeholder="https://example.com"
          value={button.url}
          onChange={(event) =>
            onChange({ ...button, url: event.target.value })
          }
          maxLength={FLOW_URL_MAX_LENGTH}
          startIcon={<Link2 />}
        />
      )}
    </div>
  );
};

const NodeInspector = ({
  channel,
  node,
  nodes,
  onChange,
  onRemove,
}: {
  channel: FlowChannel;
  node: DraftNode;
  nodes: DraftNode[];
  onChange: (node: DraftNode) => void;
  onRemove: () => void;
}) => {
  const limits = flowLimits(channel);
  // On Instagram the back button is one of the three buttons Meta allows, so it
  // is counted here rather than being a free extra row like Telegram's.
  const buttonsSpent = countRenderedButtons(channel, node);
  const buttonsFull = buttonsSpent >= limits.buttonsPerNodeMax;

  const addButton = () => {
    if (buttonsFull) return;
    onChange({
      ...node,
      buttons: [
        ...node.buttons,
        {
          localId: uid(),
          label: "",
          actionType: "end",
          childLocalId: null,
          url: "",
        },
      ],
    });
  };

  // Telegram carries either inline buttons or a reply keyboard on a message,
  // and editMessageText cannot touch the reply keyboard at all — so a message
  // that does either of those can't also change the menu.
  const keyboardLocked =
    node.buttons.length > 0 || node.replaceOnButtonClick;
  const keyboardLockReason =
    node.buttons.length > 0
      ? "این پیام دکمهٔ زیرمتنی دارد؛ تلگرام اجازهٔ نمایش هم‌زمان دکمه و منو را نمی‌دهد."
      : "این پیام جای پیام قبلی را می‌گیرد و تلگرام در این حالت منو را تغییر نمی‌دهد.";

  const updateButton = (localId: string, button: DraftButton) => {
    onChange({
      ...node,
      buttons: node.buttons.map((item) =>
        item.localId === localId ? button : item
      ),
    });
  };

  return (
    <aside className="max-h-[44rem] overflow-y-auto border-t border-line bg-surface/75 p-4 lg:border-s lg:border-t-0 lg:p-5">
      <header className="flex items-start gap-3 border-b border-line pb-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent">
          <MessageSquare className="size-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">
            {node.isRoot ? "پیام شروع" : "ویرایش پیام"}
          </span>
          <span className="mt-1 block text-xs leading-5 text-muted">
            متن پیام و مسیر هر دکمه را تنظیم کنید.
          </span>
        </span>
        {!node.isRoot && (
          <button
            type="button"
            onClick={onRemove}
            aria-label="حذف پیام"
            className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/60"
          >
            <Trash2 className="size-4" aria-hidden />
          </button>
        )}
      </header>

      <div className="mt-5 space-y-5">
        <Textarea
          id={`flow-node-message-${node.localId}`}
          dir="rtl"
          label="متن پیام"
          placeholder="پیامی که ربات می‌فرستد…"
          value={node.messageText}
          onChange={(event) =>
            onChange({ ...node, messageText: event.target.value })
          }
          maxLength={limits.messageMaxLength}
          hint={
            channel === "instagram"
              ? "اینستاگرام روی پیام دکمه‌دار حداکثر ۶۴۰ نویسه را نمایش می‌دهد."
              : undefined
          }
          showCount
          rows={6}
        />

        <section
          aria-labelledby={`flow-navigation-title-${node.localId}`}
          className="rounded-2xl border border-line bg-background/55 p-3.5"
        >
          <h2
            id={`flow-navigation-title-${node.localId}`}
            className="text-sm font-bold"
          >
            رفتار مسیر
          </h2>
          <p className="mt-1 text-xs leading-5 text-muted">
            نحوه نمایش پیام بعدی و مسیر برگشت را مشخص کنید.
          </p>

          <div className="mt-4 space-y-4">
            {/* Instagram cannot rewrite a message it has already sent, so the
                option is absent there rather than present and inert. */}
            {limits.supportsReplace && (
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <label
                    htmlFor={`flow-node-replace-${node.localId}`}
                    className="text-sm font-medium"
                  >
                    جایگزینی همین پیام
                  </label>
                  <p
                    id={`flow-node-replace-description-${node.localId}`}
                    className="mt-1 text-xs leading-5 text-muted"
                  >
                    با انتخاب دکمه، متن فعلی به پیام مقصد تبدیل می‌شود.
                  </p>
                </div>
                <Switch
                  id={`flow-node-replace-${node.localId}`}
                  checked={node.replaceOnButtonClick}
                  onChange={(event) =>
                    onChange({
                      ...node,
                      replaceOnButtonClick: event.target.checked,
                    })
                  }
                  aria-describedby={`flow-node-replace-description-${node.localId}`}
                />
              </div>
            )}

            <div
              className={
                limits.supportsReplace ? "border-t border-line pt-4" : ""
              }
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <label
                    htmlFor={`flow-node-back-${node.localId}`}
                    className="text-sm font-medium"
                  >
                    نمایش دکمه بازگشت
                  </label>
                  <p
                    id={`flow-node-back-description-${node.localId}`}
                    className="mt-1 text-xs leading-5 text-muted"
                  >
                    {channel === "instagram"
                      ? "وقتی مشتری از پیام دیگری به اینجا برسد، می‌تواند برگردد. در اینستاگرام این دکمه یکی از سه دکمهٔ پیام است."
                      : "وقتی کاربر از پیام دیگری به اینجا برسد، می‌تواند برگردد."}
                  </p>
                </div>
                <Switch
                  id={`flow-node-back-${node.localId}`}
                  checked={node.backButtonEnabled}
                  onChange={(event) =>
                    onChange({
                      ...node,
                      backButtonEnabled: event.target.checked,
                    })
                  }
                  aria-describedby={`flow-node-back-description-${node.localId}`}
                />
              </div>

              {node.backButtonEnabled && (
                <Input
                  id={`flow-node-back-label-${node.localId}`}
                  label="متن دکمه بازگشت"
                  placeholder={DEFAULT_FLOW_BACK_BUTTON_LABEL}
                  value={node.backButtonLabel}
                  onChange={(event) =>
                    onChange({ ...node, backButtonLabel: event.target.value })
                  }
                  maxLength={Math.min(
                    FLOW_BACK_BUTTON_LABEL_MAX_LENGTH,
                    limits.buttonLabelMaxLength
                  )}
                  className="mt-3"
                />
              )}
            </div>

            {/* There is no bot-wide keyboard on Instagram for a message to
                show or take away; the DM menu is account-wide and lives on
                its own page. */}
            {limits.supportsKeyboardAction && (
              <div className="border-t border-line pt-4">
                <Select
                  id={`flow-node-keyboard-${node.localId}`}
                  label="منوی ربات"
                  options={keyboardActionOptions}
                  value={node.keyboardAction}
                  onChange={(value) =>
                    onChange({
                      ...node,
                      keyboardAction: value as FlowKeyboardAction,
                    })
                  }
                  disabled={keyboardLocked}
                  hint={
                    keyboardLocked
                      ? keyboardLockReason
                      : "منوی دکمه‌ای پایین صفحهٔ چت را در این پیام نشان بدهید یا بردارید."
                  }
                />
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby={`flow-buttons-title-${node.localId}`}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2
                id={`flow-buttons-title-${node.localId}`}
                className="text-sm font-bold"
              >
                دکمه‌ها
              </h2>
              <p className="mt-1 text-xs text-muted">
                {fa(buttonsSpent)} از {fa(limits.buttonsPerNodeMax)}
                {channel === "instagram" && node.backButtonEnabled
                  ? " (با دکمهٔ بازگشت)"
                  : ""}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              startIcon={<Plus className="size-3.5" />}
              onClick={addButton}
              disabled={buttonsFull}
            >
              افزودن دکمه
            </Button>
          </div>

          {node.buttons.length > 0 ? (
            <div className="mt-3 space-y-3">
              {node.buttons.map((button) => (
                <ButtonEditor
                  key={button.localId}
                  button={button}
                  channel={channel}
                  node={node}
                  nodes={nodes}
                  onChange={(updated) =>
                    updateButton(button.localId, updated)
                  }
                  onRemove={() =>
                    onChange({
                      ...node,
                      buttons: node.buttons.filter(
                        (item) => item.localId !== button.localId
                      ),
                    })
                  }
                />
              ))}
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-dashed border-line bg-background/35 p-5 text-center">
              <CornerDownLeft
                className="mx-auto size-5 text-muted"
                aria-hidden
              />
              <p className="mt-2 text-xs leading-6 text-muted">
                برای ساخت مسیر بعدی، یک دکمه به این پیام اضافه کنید.
              </p>
            </div>
          )}
        </section>
      </div>
    </aside>
  );
};

const validateDraft = (nodes: DraftNode[], channel: FlowChannel) => {
  if (nodes.length === 0 || nodes.filter((node) => node.isRoot).length !== 1) {
    return "فلو باید دقیقاً یک پیام شروع داشته باشد.";
  }

  const limits = flowLimits(channel);

  for (const node of nodes) {
    if (!node.messageText.trim()) return "متن همه پیام‌ها را بنویسید.";
    if (node.messageText.trim().length > limits.messageMaxLength) {
      return `متن پیام‌ها حداکثر ${fa(limits.messageMaxLength)} نویسه است.`;
    }
    if (node.backButtonEnabled && !node.backButtonLabel.trim()) {
      return "متن دکمه بازگشت را بنویسید.";
    }
    if (countRenderedButtons(channel, node) > limits.buttonsPerNodeMax) {
      return channel === "instagram"
        ? "اینستاگرام روی هر پیام حداکثر ۳ دکمه نمایش می‌دهد؛ دکمهٔ بازگشت هم یکی از آن‌هاست."
        : `هر پیام حداکثر ${fa(limits.buttonsPerNodeMax)} دکمه می‌تواند داشته باشد.`;
    }

    for (const button of node.buttons) {
      if (!button.label.trim()) return "برای همه دکمه‌ها عنوان بنویسید.";
      if (button.label.trim().length > limits.buttonLabelMaxLength) {
        return `عنوان دکمه‌ها حداکثر ${fa(limits.buttonLabelMaxLength)} نویسه است.`;
      }
      if (button.actionType === "node" && !button.childLocalId) {
        return `پیام مقصد دکمه «${button.label.trim()}» را انتخاب کنید.`;
      }
      if (button.actionType === "url") {
        try {
          const url = new URL(button.url.trim());
          if (url.protocol !== "https:" && url.protocol !== "http:") {
            return `آدرس دکمه «${button.label.trim()}» باید با http یا https شروع شود.`;
          }
        } catch {
          return `آدرس دکمه «${button.label.trim()}» معتبر نیست.`;
        }
      }
    }
  }

  return null;
};

export const FlowBuilder = ({ flow }: { flow: AutomationFlowDetail }) => {
  const channel = flow.channel;
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { resolvedTheme } = useTheme();
  const reduce = useReducedMotion();
  const { toast } = useToast();
  // This route's title is the flow's name, which no route manifest can know.
  useDashboardTitle(flow.name);
  const initialDraft = React.useMemo(() => flowToDraft(flow), [flow]);
  const [nodes, setNodes] = React.useState<DraftNode[]>(initialDraft);
  const initialCanvasNodes = React.useMemo<ConversationCanvasNode[]>(
    () =>
      initialDraft.map((node, index) => ({
        id: node.localId,
        type: "conversation",
        position: initialPosition(index),
        data: { draft: node, order: index },
        selected: index === 0,
      })),
    [initialDraft]
  );
  const [canvasNodes, setCanvasNodes, onCanvasNodesChange] =
    useNodesState<ConversationCanvasNode>(initialCanvasNodes);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string | null>(
    initialDraft[0]?.localId ?? null
  );
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    setNodes(initialDraft);
    setCanvasNodes(initialCanvasNodes);
    setSelectedNodeId(initialDraft[0]?.localId ?? null);
    setDirty(false);
  }, [flow.id, initialCanvasNodes, initialDraft, setCanvasNodes]);

  React.useEffect(() => {
    setCanvasNodes((currentCanvasNodes) =>
      nodes.map((node, index) => {
        const current = currentCanvasNodes.find(
          (canvasNode) => canvasNode.id === node.localId
        );

        return {
          ...(current ?? {
            id: node.localId,
            type: "conversation" as const,
            position: initialPosition(index),
          }),
          data: { draft: node, order: index },
          selected: selectedNodeId === node.localId,
        };
      })
    );
  }, [nodes, selectedNodeId, setCanvasNodes]);

  const updateNode = React.useCallback((updatedNode: DraftNode) => {
    setNodes((current) =>
      current.map((node) =>
        node.localId === updatedNode.localId ? updatedNode : node
      )
    );
    setDirty(true);
  }, []);

  const removeNode = React.useCallback((localId: string) => {
    setNodes((current) =>
      current
        .filter((node) => node.localId !== localId)
        .map((node) => ({
          ...node,
          buttons: node.buttons.map((button) =>
            button.childLocalId === localId
              ? { ...button, childLocalId: null }
              : button
          ),
        }))
    );
    setSelectedNodeId((current) => (current === localId ? null : current));
    setDirty(true);
  }, []);

  const addNode = () => {
    const localId = uid();
    const nextNode: DraftNode = {
      localId,
      messageText: "",
      isRoot: false,
      replaceOnButtonClick: false,
      backButtonEnabled: false,
      backButtonLabel: DEFAULT_FLOW_BACK_BUTTON_LABEL,
      keyboardAction: DEFAULT_FLOW_KEYBOARD_ACTION,
      buttons: [],
    };
    setNodes((current) => [...current, nextNode]);
    setSelectedNodeId(localId);
    setDirty(true);
  };

  const edges = React.useMemo<Edge[]>(
    () =>
      nodes.flatMap((node) =>
        node.buttons.flatMap((button) => {
          if (button.actionType !== "node" || !button.childLocalId) return [];
          return [
            {
              id: `${node.localId}-${button.localId}`,
              source: node.localId,
              target: button.childLocalId,
              type: "smoothstep",
              label: button.label || "ادامه",
              markerEnd: {
                type: MarkerType.ArrowClosed,
                color: "rgb(var(--accent))",
              },
              style: {
                stroke: "rgb(var(--accent) / 0.72)",
                strokeWidth: 1.5,
              },
              labelStyle: {
                fill: "rgb(var(--foreground))",
                fontFamily: "inherit",
                fontSize: 11,
              },
              labelBgStyle: {
                fill: "rgb(var(--card))",
                fillOpacity: 0.96,
              },
              labelBgPadding: [7, 4] as [number, number],
              labelBgBorderRadius: 8,
            },
          ];
        })
      ),
    [nodes]
  );

  const save = async () => {
    const validationError = validateDraft(nodes, channel);
    if (validationError) {
      toast({ title: "فلو آماده ذخیره نیست", description: validationError, variant: "error" });
      return;
    }

    setSaving(true);
    const result = await dispatch(
      updateFlow({ id: flow.id, changes: { nodes: draftToApiNodes(nodes) } })
    );
    setSaving(false);

    if (updateFlow.fulfilled.match(result)) {
      setDirty(false);
      toast({
        title: "فلو ذخیره شد",
        description: result.payload.commandsSynced
          ? "پیام‌ها، دکمه‌ها و مسیرهای مکالمه به‌روز شدند."
          : "فلو ذخیره شد، اما منوی فرمان‌های تلگرام به‌روز نشد.",
        variant: result.payload.commandsSynced ? "success" : "warning",
      });
      return;
    }

    toast({
      title: "فلو ذخیره نشد",
      description:
        result.payload?.message ?? "اتصال را بررسی کنید و دوباره تلاش کنید.",
      variant: "error",
    });
  };

  const selectedNode =
    nodes.find((node) => node.localId === selectedNodeId) ?? nodes[0] ?? null;

  return (
    <div className="mx-auto max-w-[96rem]">
      <header className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() =>
              router.push(`/dashboard/automation?channel=${channel}`)
            }
            className="flex items-center gap-2 rounded-full text-sm text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            <ArrowRight className="size-4" aria-hidden />
            بازگشت به فلوها
          </button>
          <div className="mt-3 flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent/15 text-accent">
              <Workflow className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-black sm:text-2xl">
                {flow.name}
              </h1>
              <p className="mt-1 truncate text-xs text-muted sm:text-sm">
                {flow.triggerType === "command"
                  ? `فرمان ${flow.triggerKeyword}`
                  : `کلیدواژه «${flow.triggerKeyword}»`}
                {channel === "instagram" ? " — دایرکت اینستاگرام" : ""}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            loading={saving}
            startIcon={<Save className="size-4" />}
            onClick={() => void save()}
            className="min-w-0 flex-1 sm:flex-none"
          >
            {dirty ? "ذخیره تغییرات" : "ذخیره فلو"}
          </Button>
        </div>
      </header>

      <motion.section
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.35 }}
        className="grid min-h-[44rem] overflow-hidden rounded-3xl border border-line bg-background shadow-soft lg:grid-cols-[minmax(0,1fr)_23rem]"
        aria-label="بوم طراحی فلو"
      >
        <div className="relative min-h-[60dvh] bg-background lg:min-h-[44rem]">
          <ReactFlow<ConversationCanvasNode>
            nodes={canvasNodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onCanvasNodesChange}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onPaneClick={() => setSelectedNodeId(null)}
            nodesConnectable={false}
            deleteKeyCode={null}
            fitView
            fitViewOptions={{ padding: 0.2, minZoom: 0.45, maxZoom: 1 }}
            minZoom={0.25}
            maxZoom={1.6}
            colorMode={resolvedTheme === "dark" ? "dark" : "light"}
            className="flow-canvas"
            proOptions={{ hideAttribution: true }}
            aria-label="بوم دیداری پیام‌ها و مسیرهای فلو"
          >
            <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
            <Controls
              position="bottom-right"
              showInteractive={false}
              aria-label="کنترل‌های بزرگ‌نمایی بوم"
            />
            <MiniMap
              position="bottom-left"
              pannable
              zoomable
              nodeColor="rgb(var(--accent) / 0.7)"
              maskColor="rgb(var(--background) / 0.72)"
              ariaLabel="نمای کلی فلو"
            />
          </ReactFlow>

          <div className="absolute start-4 top-4 z-10">
            <Button
              type="button"
              size="sm"
              startIcon={<Plus className="size-4" />}
              onClick={addNode}
              className="shadow-lift"
            >
              افزودن پیام جدید
            </Button>
          </div>

          <div className="pointer-events-none absolute end-4 top-4 z-10 hidden max-w-xs rounded-2xl border border-line bg-surface/90 px-3 py-2 text-xs leading-5 text-muted shadow-soft backdrop-blur-sm sm:block">
            پیام‌ها را جابه‌جا کنید و برای ویرایش هر پیام روی آن بزنید.
          </div>
        </div>

        {selectedNode ? (
          <NodeInspector
            key={selectedNode.localId}
            channel={channel}
            node={selectedNode}
            nodes={nodes}
            onChange={updateNode}
            onRemove={() => removeNode(selectedNode.localId)}
          />
        ) : (
          <aside className="flex min-h-72 flex-col items-center justify-center border-t border-line bg-surface/75 p-8 text-center lg:border-s lg:border-t-0">
            <Flag className="size-6 text-muted" aria-hidden />
            <p className="mt-3 text-sm font-bold">یک پیام را انتخاب کنید</p>
            <p className="mt-2 text-xs leading-6 text-muted">
              با انتخاب پیام، متن، دکمه‌ها و عملکردهای آن اینجا نمایش داده می‌شوند.
            </p>
          </aside>
        )}
      </motion.section>
    </div>
  );
};
