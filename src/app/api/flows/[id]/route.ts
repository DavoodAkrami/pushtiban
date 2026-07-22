import { NextResponse, type NextRequest } from "next/server";
import {
  cleanKeyword,
  isValidTelegramCommand,
  KEYWORD_MAX_LENGTH,
  normalizeKeyword,
  TELEGRAM_COMMAND_DESCRIPTION_MAX_LENGTH,
  TELEGRAM_COMMANDS_MAX_COUNT,
  toTelegramCommandKeyword,
  type AutomationTriggerType,
} from "@/lib/automations";
import {
  FLOW_BUTTON_LABEL_MAX_LENGTH,
  FLOW_BACK_BUTTON_LABEL_MAX_LENGTH,
  FLOW_BUTTONS_PER_NODE_MAX,
  DEFAULT_FLOW_BACK_BUTTON_LABEL,
  FLOW_NAME_MAX_LENGTH,
  FLOW_NODE_MESSAGE_MAX_LENGTH,
  FLOW_URL_MAX_LENGTH,
  type AutomationFlowDetail,
  type FlowButton,
  type FlowButtonActionType,
  type FlowNode,
} from "@/lib/flows";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  activateTelegramWebhook,
  syncTelegramCommandMenu,
} from "@/lib/telegram/webhook";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 512_000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: { id: string } };

const jsonError = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

const hasValidOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

type ButtonRow = {
  id: string;
  node_id: string;
  flow_id: string;
  label: string;
  action_type: FlowButtonActionType;
  next_node_id: string | null;
  url: string | null;
  position: number;
};

type NodeRow = {
  id: string;
  flow_id: string;
  message_text: string;
  is_root: boolean;
  replace_on_button_click: boolean;
  back_button_enabled: boolean;
  back_button_label: string;
  automation_flow_buttons: ButtonRow[];
};

type FlowDetailRow = {
  id: string;
  trigger_type: AutomationTriggerType;
  trigger_keyword: string;
  name: string;
  command_description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  automation_flow_nodes: NodeRow[];
};

const FLOW_DETAIL_SELECT = `
  id, trigger_type, trigger_keyword, name, command_description, is_active, created_at, updated_at,
  automation_flow_nodes (
    id, flow_id, message_text, is_root, replace_on_button_click, back_button_enabled, back_button_label,
    automation_flow_buttons:automation_flow_buttons!automation_flow_buttons_node_id_fkey (
      id, node_id, flow_id, label, action_type, next_node_id, url, position
    )
  )
`;

const toButton = (row: ButtonRow): FlowButton => ({
  id: row.id,
  nodeId: row.node_id,
  flowId: row.flow_id,
  label: row.label,
  actionType: row.action_type,
  nextNodeId: row.next_node_id,
  url: row.url,
  position: row.position,
});

const toNode = (row: NodeRow): FlowNode => ({
  id: row.id,
  flowId: row.flow_id,
  messageText: row.message_text,
  isRoot: row.is_root,
  replaceOnButtonClick: row.replace_on_button_click,
  backButtonEnabled: row.back_button_enabled,
  backButtonLabel: row.back_button_label,
  buttons: (row.automation_flow_buttons ?? [])
    .sort((a, b) => a.position - b.position)
    .map(toButton),
});

const toFlowDetail = (row: FlowDetailRow): AutomationFlowDetail => ({
  id: row.id,
  triggerType: row.trigger_type,
  triggerKeyword: row.trigger_keyword,
  name: row.name,
  commandDescription: row.command_description,
  isActive: row.is_active,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  nodes: (row.automation_flow_nodes ?? []).map(toNode),
});

// GET /api/flows/[id] — full flow with nodes and buttons
export const GET = async (
  _request: NextRequest,
  { params }: RouteContext
) => {
  if (!UUID_RE.test(params.id))
    return jsonError("فلو موردنظر پیدا نشد.", 404);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return jsonError("نشست شما تمام شده؛ دوباره وارد حساب شوید.", 401);

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("automation_flows")
      .select(FLOW_DETAIL_SELECT)
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) return jsonError("فلو بارگذاری نشد.", 500);
    if (!data) return jsonError("فلو موردنظر پیدا نشد.", 404);

    return NextResponse.json({ flow: toFlowDetail(data as FlowDetailRow) });
  } catch {
    return jsonError("فلو بارگذاری نشد.", 500);
  }
};

// PATCH /api/flows/[id] — update flow metadata + full node/button tree replacement
export const PATCH = async (
  request: NextRequest,
  { params }: RouteContext
) => {
  if (!hasValidOrigin(request)) return jsonError("درخواست معتبر نیست.", 403);
  if (!UUID_RE.test(params.id)) return jsonError("فلو موردنظر پیدا نشد.", 404);

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES)
    return jsonError("داده‌های ارسالی بیش از حد مجاز است.", 413);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return jsonError("نشست شما تمام شده؛ دوباره وارد حساب شوید.", 401);

  let body: {
    triggerType?: unknown;
    triggerKeyword?: unknown;
    name?: unknown;
    commandDescription?: unknown;
    isActive?: unknown;
    rootMessage?: unknown;
    nodes?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("اطلاعات قابل خواندن نیست.", 400);
  }

  const hasNodes = Object.prototype.hasOwnProperty.call(body, "nodes");
  const hasActive = Object.prototype.hasOwnProperty.call(body, "isActive");
  const hasRootMessage = Object.prototype.hasOwnProperty.call(
    body,
    "rootMessage"
  );

  if (hasActive && typeof body.isActive !== "boolean")
    return jsonError("وضعیت فلو معتبر نیست.", 400);
  if (hasNodes && !Array.isArray(body.nodes))
    return jsonError("پیام‌های فلو معتبر نیستند.", 400);
  if (
    hasRootMessage &&
    (typeof body.rootMessage !== "string" ||
      !body.rootMessage.trim() ||
      body.rootMessage.trim().length > FLOW_NODE_MESSAGE_MAX_LENGTH)
  )
    return jsonError("متن پیام اول نامعتبر است.", 400);

  try {
    const admin = createAdminClient();
    const { data: existing, error: readError } = await admin
      .from("automation_flows")
      .select("id, telegram_connection_id, trigger_type, trigger_keyword, name, command_description, is_active")
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (readError) return jsonError("فلو بارگذاری نشد.", 500);
    if (!existing) return jsonError("فلو موردنظر پیدا نشد.", 404);

    if (hasNodes) {
      const { error: schemaError } = await admin
        .from("automation_flow_nodes")
        .select("replace_on_button_click, back_button_enabled, back_button_label")
        .limit(1);
      if (schemaError) {
        return jsonError(
          "برای ذخیره این تنظیمات، ابتدا نسخه تازه اسکریپت flows.sql را در Supabase اجرا کنید.",
          503
        );
      }
    }

    const triggerType: AutomationTriggerType =
      typeof body.triggerType === "string" &&
      (body.triggerType === "keyword" || body.triggerType === "command")
        ? body.triggerType
        : existing.trigger_type;

    const rawKeyword =
      typeof body.triggerKeyword === "string"
        ? body.triggerKeyword
        : existing.trigger_keyword;
    const triggerKeyword =
      triggerType === "command"
        ? toTelegramCommandKeyword(rawKeyword)
        : cleanKeyword(rawKeyword);
    const triggerKeywordNormalized = normalizeKeyword(triggerKeyword);

    const name =
      typeof body.name === "string" ? body.name.trim() : existing.name;
    const commandDescription =
      triggerType === "command"
        ? typeof body.commandDescription === "string"
          ? body.commandDescription.trim()
          : existing.command_description ?? ""
        : null;
    const isActive = hasActive
      ? (body.isActive as boolean)
      : existing.is_active;

    if (
      triggerType === "keyword" &&
      (!triggerKeyword || triggerKeyword.length > KEYWORD_MAX_LENGTH)
    )
      return jsonError("کلیدواژه باید بین ۱ تا ۸۰ نویسه باشد.", 400);
    if (triggerType === "command" && !isValidTelegramCommand(triggerKeyword))
      return jsonError("فرمان نامعتبر است.", 400);
    if (
      triggerType === "command" &&
      (!commandDescription ||
        commandDescription.length > TELEGRAM_COMMAND_DESCRIPTION_MAX_LENGTH)
    )
      return jsonError("توضیح منوی فرمان باید بین ۱ تا ۲۵۶ نویسه باشد.", 400);
    if (!name || name.length > FLOW_NAME_MAX_LENGTH)
      return jsonError("نام فلو باید بین ۱ تا ۱۰۰ نویسه باشد.", 400);

    if (triggerType === "command" && isActive) {
      const { count, error: countError } = await admin
        .from("automation_flows")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("telegram_connection_id", existing.telegram_connection_id)
        .eq("trigger_type", "command")
        .eq("is_active", true)
        .neq("id", existing.id);
      if (countError) return jsonError("فرمان‌های ربات بررسی نشدند.", 500);
      if ((count ?? 0) >= TELEGRAM_COMMANDS_MAX_COUNT)
        return jsonError("هر ربات حداکثر ۱۰۰ فرمان فعال می‌تواند داشته باشد.", 409);
    }

    const { error: updateError } = await admin
      .from("automation_flows")
      .update({
        trigger_type: triggerType,
        trigger_keyword: triggerKeyword,
        trigger_keyword_normalized: triggerKeywordNormalized,
        name,
        command_description: commandDescription,
        is_active: isActive,
      })
      .eq("id", params.id)
      .eq("user_id", user.id);

    if (updateError) {
      if (updateError.code === "23505")
        return jsonError("برای این کلیدواژه قبلاً یک فلو ساخته‌اید.", 409);
      return jsonError("تغییرات ذخیره نشد.", 500);
    }

    if (hasRootMessage) {
      const { error: rootMessageError } = await admin
        .from("automation_flow_nodes")
        .update({ message_text: (body.rootMessage as string).trim() })
        .eq("flow_id", params.id)
        .eq("user_id", user.id)
        .eq("is_root", true);

      if (rootMessageError)
        return jsonError("متن پیام اول ذخیره نشد.", 500);
    }

    // Replace node/button tree if provided
    if (hasNodes && Array.isArray(body.nodes)) {
      type ButtonInput = {
        label: string;
        actionType: FlowButtonActionType;
        nextNodeIndex?: number;
        url?: string;
        position: number;
      };
      type NodeInput = {
        messageText: string;
        isRoot: boolean;
        replaceOnButtonClick: boolean;
        backButtonEnabled: boolean;
        backButtonLabel: string;
        buttons: ButtonInput[];
      };
      const nodes = body.nodes as NodeInput[];

      // Validate
      if (nodes.length === 0 || nodes.filter((node) => node.isRoot).length !== 1)
        return jsonError("فلو باید دقیقاً یک پیام شروع داشته باشد.", 400);
      for (const node of nodes) {
        if (
          typeof node.messageText !== "string" ||
          !node.messageText.trim() ||
          node.messageText.length > FLOW_NODE_MESSAGE_MAX_LENGTH
        )
          return jsonError("متن پیام نامعتبر است.", 400);
        if (!Array.isArray(node.buttons))
          return jsonError("دکمه‌ها نامعتبر هستند.", 400);
        if (
          typeof node.replaceOnButtonClick !== "boolean" ||
          typeof node.backButtonEnabled !== "boolean"
        )
          return jsonError("تنظیمات رفتار پیام معتبر نیست.", 400);
        if (
          typeof node.backButtonLabel !== "string" ||
          !node.backButtonLabel.trim() ||
          node.backButtonLabel.trim().length > FLOW_BACK_BUTTON_LABEL_MAX_LENGTH
        )
          return jsonError("عنوان دکمه بازگشت نامعتبر است.", 400);
        if (node.buttons.length > FLOW_BUTTONS_PER_NODE_MAX)
          return jsonError(`هر پیام حداکثر ${FLOW_BUTTONS_PER_NODE_MAX} دکمه می‌تواند داشته باشد.`, 400);
        for (const btn of node.buttons) {
          if (
            typeof btn.label !== "string" ||
            !btn.label.trim() ||
            btn.label.length > FLOW_BUTTON_LABEL_MAX_LENGTH
          )
            return jsonError("برچسب دکمه نامعتبر است.", 400);
          if (!["node", "url", "end"].includes(btn.actionType))
            return jsonError("نوع عملکرد دکمه نامعتبر است.", 400);
          if (
            btn.actionType === "url" &&
            (typeof btn.url !== "string" || btn.url.length > FLOW_URL_MAX_LENGTH)
          )
            return jsonError("آدرس لینک نامعتبر است.", 400);
        }
      }

      // Delete existing nodes (cascade deletes buttons)
      await admin
        .from("automation_flow_nodes")
        .delete()
        .eq("flow_id", params.id);

      // Insert new nodes
      const { data: insertedNodes, error: nodesError } = await admin
        .from("automation_flow_nodes")
        .insert(
          nodes.map((n) => ({
            flow_id: params.id,
            user_id: user.id,
            message_text: n.messageText.trim(),
            is_root: n.isRoot,
            replace_on_button_click: n.replaceOnButtonClick,
            back_button_enabled: n.backButtonEnabled,
            back_button_label:
              n.backButtonLabel.trim() || DEFAULT_FLOW_BACK_BUTTON_LABEL,
          }))
        )
        .select("id");

      if (nodesError || !insertedNodes)
        return jsonError("گره‌های فلو ذخیره نشدند.", 500);

      // Insert buttons with resolved next_node_id
      const allButtons: object[] = [];
      nodes.forEach((node, nodeIdx) => {
        const nodeId = insertedNodes[nodeIdx]?.id;
        if (!nodeId) return;
        node.buttons.forEach((btn) => {
          const nextNodeId =
            btn.actionType === "node" &&
            typeof btn.nextNodeIndex === "number" &&
            insertedNodes[btn.nextNodeIndex]
              ? insertedNodes[btn.nextNodeIndex].id
              : null;
          allButtons.push({
            node_id: nodeId,
            flow_id: params.id,
            user_id: user.id,
            label: btn.label.trim(),
            action_type: btn.actionType,
            next_node_id: nextNodeId,
            url: btn.actionType === "url" ? btn.url ?? null : null,
            position: btn.position,
          });
        });
      });

      if (allButtons.length > 0) {
        const { error: btnsError } = await admin
          .from("automation_flow_buttons")
          .insert(allButtons);
        if (btnsError) return jsonError("دکمه‌های فلو ذخیره نشدند.", 500);
      }
    }

    const [webhookActive, commandsSynced] = await Promise.all([
      isActive
        ? activateTelegramWebhook({
            connectionId: existing.telegram_connection_id,
            requestUrl: request.url,
            userId: user.id,
          })
        : Promise.resolve(true),
      existing.trigger_type === "command" || triggerType === "command"
        ? syncTelegramCommandMenu({
            connectionId: existing.telegram_connection_id,
            userId: user.id,
          })
        : Promise.resolve(true),
    ]);

    // Re-fetch updated flow
    const { data: updated, error: updatedError } = await admin
      .from("automation_flows")
      .select(FLOW_DETAIL_SELECT)
      .eq("id", params.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (updatedError || !updated)
      return jsonError("فلو ذخیره شد، اما نسخه تازه آن بارگذاری نشد.", 500);

    return NextResponse.json({
      flow: toFlowDetail(updated as FlowDetailRow),
      webhookActive,
      commandsSynced,
    });
  } catch {
    return jsonError("تغییرات ذخیره نشد.", 500);
  }
};

// DELETE /api/flows/[id]
export const DELETE = async (
  request: NextRequest,
  { params }: RouteContext
) => {
  if (!hasValidOrigin(request)) return jsonError("درخواست معتبر نیست.", 403);
  if (!UUID_RE.test(params.id)) return jsonError("فلو موردنظر پیدا نشد.", 404);

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return jsonError("نشست شما تمام شده؛ دوباره وارد حساب شوید.", 401);

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("automation_flows")
      .delete()
      .eq("id", params.id)
      .eq("user_id", user.id)
      .select("id, telegram_connection_id, trigger_type")
      .maybeSingle();

    if (error) return jsonError("فلو حذف نشد.", 500);
    if (!data) return jsonError("فلو موردنظر پیدا نشد.", 404);

    const commandsSynced =
      data.trigger_type === "command"
        ? await syncTelegramCommandMenu({
            connectionId: data.telegram_connection_id,
            userId: user.id,
          })
        : true;

    return NextResponse.json({ ok: true, commandsSynced });
  } catch {
    return jsonError("فلو حذف نشد.", 500);
  }
};
