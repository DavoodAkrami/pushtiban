"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ChevronDown,
  ChevronLeft,
  GripVertical,
  Link2,
  MessageSquare,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { luxe } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  FLOW_BUTTON_LABEL_MAX_LENGTH,
  FLOW_BUTTONS_PER_NODE_MAX,
  FLOW_NODE_MESSAGE_MAX_LENGTH,
  FLOW_URL_MAX_LENGTH,
  type AutomationFlowDetail,
  type FlowButtonActionType,
} from "@/lib/flows";
import { useAppDispatch } from "@/store/hooks";
import { updateFlow } from "@/store/slices/flows-slice";

// ─── Draft types ────────────────────────────────────────────────────────────

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
  buttons: DraftButton[];
};

const uid = () => Math.random().toString(36).slice(2);

const flowToTree = (flow: AutomationFlowDetail): DraftNode[] => {
  const idMap = new Map<string, string>();
  const nodes: DraftNode[] = flow.nodes.map((n) => {
    const localId = uid();
    idMap.set(n.id, localId);
    return { localId, messageText: n.messageText, isRoot: n.isRoot, buttons: [] };
  });
  flow.nodes.forEach((n, i) => {
    nodes[i].buttons = n.buttons.map((b) => ({
      localId: uid(),
      label: b.label,
      actionType: b.actionType,
      childLocalId: b.nextNodeId ? (idMap.get(b.nextNodeId) ?? null) : null,
      url: b.url ?? "",
    }));
  });
  return nodes;
};

const treeToApiNodes = (nodes: DraftNode[]) => {
  const indexMap = new Map<string, number>();
  nodes.forEach((n, i) => indexMap.set(n.localId, i));
  return nodes.map((n) => ({
    messageText: n.messageText,
    isRoot: n.isRoot,
    buttons: n.buttons.map((b, pos) => ({
      label: b.label,
      actionType: b.actionType,
      nextNodeIndex:
        b.actionType === "node" && b.childLocalId != null
          ? indexMap.get(b.childLocalId)
          : undefined,
      url: b.actionType === "url" ? b.url : undefined,
      position: pos,
    })),
  }));
};

// ─── Button action options ───────────────────────────────────────────────────

const actionOptions: SelectOption[] = [
  { value: "node", label: "پیام بعدی", description: "به گره بعدی برو" },
  { value: "url", label: "لینک خارجی", description: "باز کردن آدرس اینترنتی" },
  { value: "end", label: "پایان مکالمه", description: "بدون عملکرد بیشتر" },
];

// ─── ButtonEditor ────────────────────────────────────────────────────────────

const ButtonEditor = ({
  btn,
  nodes,
  onChange,
  onRemove,
}: {
  btn: DraftButton;
  nodes: DraftNode[];
  onChange: (b: DraftButton) => void;
  onRemove: () => void;
}) => {
  const childOptions: SelectOption[] = nodes
    .filter((n) => !n.isRoot)
    .map((n) => ({
      value: n.localId,
      label: n.messageText.slice(0, 40) || "پیام بدون متن",
    }));

  return (
    <div className="rounded-2xl border border-line bg-background/60 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <GripVertical className="size-4 shrink-0 text-muted" aria-hidden />
        <Input
          id={`btn-label-${btn.localId}`}
          dir="rtl"
          placeholder="متن دکمه"
          value={btn.label}
          onChange={(e) => onChange({ ...btn, label: e.target.value })}
          maxLength={FLOW_BUTTON_LABEL_MAX_LENGTH}
          className="flex-1"
        />
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded-full p-1 text-muted hover:text-danger transition-colors"
          aria-label="حذف دکمه"
        >
          <X className="size-4" />
        </button>
      </div>
      <Select
        id={`btn-action-${btn.localId}`}
        label="عملکرد"
        options={actionOptions}
        value={btn.actionType}
        onChange={(v) =>
          onChange({ ...btn, actionType: v as FlowButtonActionType, childLocalId: null, url: "" })
        }
      />
      {btn.actionType === "node" && (
        <Select
          id={`btn-child-${btn.localId}`}
          label="پیام مقصد"
          options={childOptions}
          value={btn.childLocalId ?? ""}
          onChange={(v) => onChange({ ...btn, childLocalId: v || null })}
          placeholder="انتخاب پیام..."
        />
      )}
      {btn.actionType === "url" && (
        <Input
          id={`btn-url-${btn.localId}`}
          dir="ltr"
          label="آدرس لینک"
          placeholder="https://example.com"
          value={btn.url}
          onChange={(e) => onChange({ ...btn, url: e.target.value })}
          maxLength={FLOW_URL_MAX_LENGTH}
          startIcon={<Link2 />}
        />
      )}
    </div>
  );
};

// ─── NodeCard ────────────────────────────────────────────────────────────────

const NodeCard = ({
  node,
  allNodes,
  isRoot,
  onChange,
  onRemove,
}: {
  node: DraftNode;
  allNodes: DraftNode[];
  isRoot: boolean;
  onChange: (n: DraftNode) => void;
  onRemove: () => void;
}) => {
  const reduce = useReducedMotion();
  const [open, setOpen] = React.useState(true);

  const addButton = () => {
    if (node.buttons.length >= FLOW_BUTTONS_PER_NODE_MAX) return;
    onChange({
      ...node,
      buttons: [
        ...node.buttons,
        { localId: uid(), label: "", actionType: "end", childLocalId: null, url: "" },
      ],
    });
  };

  const updateButton = (idx: number, b: DraftButton) => {
    const buttons = [...node.buttons];
    buttons[idx] = b;
    onChange({ ...node, buttons });
  };

  const removeButton = (idx: number) => {
    onChange({ ...node, buttons: node.buttons.filter((_, i) => i !== idx) });
  };

  return (
    <motion.div
      layout={!reduce}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
      transition={{ duration: reduce ? 0 : 0.25, ease: luxe }}
      className="rounded-3xl border border-line bg-surface/35"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3 text-start"
      >
        <Icon icon={MessageSquare} tile size="xs" tone={isRoot ? "accent" : "muted"} />
        <span className="flex-1 truncate text-sm font-medium">
          {isRoot ? "پیام اول (ریشه)" : node.messageText.slice(0, 50) || "پیام بدون متن"}
        </span>
        <motion.span
          animate={{ rotate: open ? 0 : -90 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 text-muted"
        >
          <ChevronDown className="size-4" />
        </motion.span>
        {!isRoot && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="shrink-0 rounded-full p-1 text-muted hover:text-danger transition-colors"
            aria-label="حذف گره"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: reduce ? 0 : 0.25, ease: luxe }}
            className="overflow-hidden"
          >
            <div className="space-y-4 px-4 pb-4">
              <Textarea
                id={`node-msg-${node.localId}`}
                dir="rtl"
                label="متن پیام"
                placeholder="پیام ربات را بنویسید…"
                value={node.messageText}
                onChange={(e) => onChange({ ...node, messageText: e.target.value })}
                maxLength={FLOW_NODE_MESSAGE_MAX_LENGTH}
                showCount
                rows={4}
              />

              {node.buttons.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted">دکمه‌ها</p>
                  {node.buttons.map((btn, idx) => (
                    <ButtonEditor
                      key={btn.localId}
                      btn={btn}
                      nodes={allNodes}
                      onChange={(b) => updateButton(idx, b)}
                      onRemove={() => removeButton(idx)}
                    />
                  ))}
                </div>
              )}

              {node.buttons.length < FLOW_BUTTONS_PER_NODE_MAX && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  startIcon={<Plus className="size-3.5" />}
                  onClick={addButton}
                >
                  افزودن دکمه
                </Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ─── FlowBuilder ─────────────────────────────────────────────────────────────

export const FlowBuilder = ({
  flow,
  onClose,
}: {
  flow: AutomationFlowDetail;
  onClose: () => void;
}) => {
  const dispatch = useAppDispatch();
  const { toast } = useToast();
  const [nodes, setNodes] = React.useState<DraftNode[]>(() => flowToTree(flow));
  const [saving, setSaving] = React.useState(false);

  const addNode = () => {
    setNodes((prev) => [
      ...prev,
      { localId: uid(), messageText: "", isRoot: false, buttons: [] },
    ]);
  };

  const updateNode = (localId: string, updated: DraftNode) => {
    setNodes((prev) => prev.map((n) => (n.localId === localId ? updated : n)));
  };

  const removeNode = (localId: string) => {
    setNodes((prev) => {
      const filtered = prev.filter((n) => n.localId !== localId);
      return filtered.map((n) => ({
        ...n,
        buttons: n.buttons.map((b) =>
          b.childLocalId === localId ? { ...b, childLocalId: null } : b
        ),
      }));
    });
  };

  const save = async () => {
    const root = nodes.find((n) => n.isRoot);
    if (!root?.messageText.trim()) {
      toast({ title: "پیام اول را بنویسید.", variant: "error" });
      return;
    }
    setSaving(true);
    const result = await dispatch(
      updateFlow({ id: flow.id, changes: { nodes: treeToApiNodes(nodes) } })
    );
    setSaving(false);
    if (updateFlow.fulfilled.match(result)) {
      toast({ title: "فلو ذخیره شد." });
      if (!result.payload.commandsSynced) {
        toast({ title: "منوی فرمان‌های تلگرام به‌روز نشد؛ اتصال را بررسی کنید.", variant: "warning" });
      }
    } else {
      const msg =
        result.payload && typeof result.payload === "object" && "message" in result.payload
          ? (result.payload as { message: string }).message
          : "ذخیره انجام نشد؛ دوباره تلاش کنید.";
      toast({ title: msg, variant: "error" });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-muted hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-4" />
          بازگشت
        </button>
        <span className="text-muted">/</span>
        <span className="text-sm font-medium truncate">{flow.name}</span>
      </div>

      <div className="space-y-3">
        <AnimatePresence initial={false}>
          {nodes.map((node) => (
            <NodeCard
              key={node.localId}
              node={node}
              allNodes={nodes}
              isRoot={node.isRoot}
              onChange={(updated) => updateNode(node.localId, updated)}
              onRemove={() => removeNode(node.localId)}
            />
          ))}
        </AnimatePresence>
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          startIcon={<Plus className="size-4" />}
          onClick={addNode}
        >
          افزودن پیام جدید
        </Button>
        <Button
          type="button"
          loading={saving}
          startIcon={<Save className="size-4" />}
          onClick={() => void save()}
          className="ms-auto"
        >
          ذخیره فلو
        </Button>
      </div>
    </div>
  );
};
