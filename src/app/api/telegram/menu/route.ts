import { NextResponse, type NextRequest } from "next/server";
import { normalizeKeyword } from "@/lib/automations";
import {
  DEFAULT_TELEGRAM_MENU,
  MENU_BUTTON_LABEL_MAX_LENGTH,
  MENU_BUTTONS_MAX,
  MENU_BUTTONS_PER_ROW_MAX,
  MENU_PLACEHOLDER_MAX_LENGTH,
  MENU_ROWS_MAX,
  type MenuButtonActionType,
  type MenuTargets,
  type TelegramMenu,
  type TelegramMenuButton,
} from "@/lib/telegram-menu";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 32_000;
const SETUP_ERROR_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

const jsonError = (error: string, status: number, setupRequired = false) =>
  NextResponse.json({ error, setupRequired }, { status });

const setupError = () =>
  jsonError(
    "راه‌اندازی منوی ربات کامل نشده؛ اسکریپت telegram-menu.sql را در Supabase اجرا کنید.",
    503,
    true
  );

const hasValidOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

type MenuRow = {
  id: string;
  is_enabled: boolean;
  is_persistent: boolean;
  resize_keyboard: boolean;
  one_time_keyboard: boolean;
  input_field_placeholder: string | null;
};

type ButtonRow = {
  id: string;
  label: string;
  row_index: number;
  position: number;
  action_type: MenuButtonActionType;
  flow_id: string | null;
  automation_id: string | null;
};

const MENU_SELECT =
  "id, is_enabled, is_persistent, resize_keyboard, one_time_keyboard, input_field_placeholder";
const BUTTON_SELECT =
  "id, label, row_index, position, action_type, flow_id, automation_id";

const toButton = (row: ButtonRow): TelegramMenuButton => ({
  id: row.id,
  label: row.label,
  rowIndex: row.row_index,
  position: row.position,
  actionType: row.action_type,
  flowId: row.flow_id,
  automationId: row.automation_id,
});

type Admin = ReturnType<typeof createAdminClient>;

/** Menu + buttons for a connection, or the default (off, empty) menu. */
const readMenu = async (
  admin: Admin,
  connectionId: string
): Promise<{ menu: TelegramMenu; menuId: string | null } | null> => {
  const { data: menuRow, error: menuError } = await admin
    .from("telegram_menus")
    .select(MENU_SELECT)
    .eq("telegram_connection_id", connectionId)
    .maybeSingle();

  if (menuError) return null;
  if (!menuRow) return { menu: DEFAULT_TELEGRAM_MENU, menuId: null };

  const row = menuRow as MenuRow;
  const { data: buttonRows, error: buttonsError } = await admin
    .from("telegram_menu_buttons")
    .select(BUTTON_SELECT)
    .eq("menu_id", row.id)
    .order("row_index", { ascending: true })
    .order("position", { ascending: true });

  if (buttonsError) return null;

  return {
    menuId: row.id,
    menu: {
      isEnabled: row.is_enabled,
      isPersistent: row.is_persistent,
      resizeKeyboard: row.resize_keyboard,
      oneTimeKeyboard: row.one_time_keyboard,
      inputFieldPlaceholder: row.input_field_placeholder ?? "",
      buttons: (buttonRows as ButtonRow[]).map(toButton),
    },
  };
};

/** Flows and prepared replies a button can point at. */
const readTargets = async (
  admin: Admin,
  { connectionId, userId }: { connectionId: string; userId: string }
): Promise<MenuTargets> => {
  const [flowResult, replyResult] = await Promise.all([
    admin
      .from("automation_flows")
      .select("id, name, trigger_type, trigger_keyword")
      .eq("user_id", userId)
      .eq("telegram_connection_id", connectionId)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    admin
      .from("telegram_keyword_automations")
      .select("id, keyword, reply_text")
      .eq("user_id", userId)
      .eq("telegram_connection_id", connectionId)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
  ]);

  type FlowTargetRow = {
    id: string;
    name: string;
    trigger_type: string;
    trigger_keyword: string;
  };
  type ReplyTargetRow = { id: string; keyword: string; reply_text: string };

  return {
    flows: ((flowResult.data as FlowTargetRow[] | null) ?? []).map((row) => ({
      id: row.id,
      label: row.name,
      hint:
        row.trigger_type === "command"
          ? `فرمان ${row.trigger_keyword}`
          : `کلیدواژه «${row.trigger_keyword}»`,
    })),
    replies: ((replyResult.data as ReplyTargetRow[] | null) ?? []).map(
      (row) => ({
        id: row.id,
        label: row.keyword,
        hint: row.reply_text.slice(0, 64),
      })
    ),
  };
};

// GET /api/telegram/menu — the menu plus everything a button can point at.
export const GET = async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return jsonError("نشست شما تمام شده؛ دوباره وارد حساب شوید.", 401);

  try {
    const admin = createAdminClient();
    const { data: connection, error: connectionError } = await admin
      .from("telegram_connections")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (connectionError) return jsonError("اطلاعات ربات بارگذاری نشد.", 500);
    if (!connection) {
      return NextResponse.json({
        connected: false,
        menu: DEFAULT_TELEGRAM_MENU,
        targets: { flows: [], replies: [] },
      });
    }

    const [stored, targets] = await Promise.all([
      readMenu(admin, connection.id),
      readTargets(admin, { connectionId: connection.id, userId: user.id }),
    ]);

    if (!stored) return setupError();

    return NextResponse.json({
      connected: true,
      menu: stored.menu,
      targets,
    });
  } catch {
    return jsonError("منوی ربات بارگذاری نشد.", 500);
  }
};

type ButtonInput = {
  label?: unknown;
  rowIndex?: unknown;
  position?: unknown;
  actionType?: unknown;
  flowId?: unknown;
  automationId?: unknown;
};

type ValidButton = {
  label: string;
  labelNormalized: string;
  rowIndex: number;
  position: number;
  actionType: MenuButtonActionType;
  flowId: string | null;
  automationId: string | null;
};

// PUT /api/telegram/menu — replaces the whole menu in one shot.
export const PUT = async (request: NextRequest) => {
  if (!hasValidOrigin(request)) return jsonError("درخواست معتبر نیست.", 403);

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
    isEnabled?: unknown;
    isPersistent?: unknown;
    resizeKeyboard?: unknown;
    oneTimeKeyboard?: unknown;
    inputFieldPlaceholder?: unknown;
    buttons?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return jsonError("اطلاعات قابل خواندن نیست.", 400);
  }

  if (!Array.isArray(body.buttons))
    return jsonError("دکمه‌های منو معتبر نیستند.", 400);
  if (body.buttons.length > MENU_BUTTONS_MAX)
    return jsonError(`منو حداکثر ${MENU_BUTTONS_MAX} دکمه می‌تواند داشته باشد.`, 400);

  const placeholder =
    typeof body.inputFieldPlaceholder === "string"
      ? body.inputFieldPlaceholder.trim()
      : "";
  if (placeholder.length > MENU_PLACEHOLDER_MAX_LENGTH)
    return jsonError(
      `متن راهنمای کادر پیام حداکثر ${MENU_PLACEHOLDER_MAX_LENGTH} نویسه است.`,
      400
    );

  // Shape + label validation.
  const buttons: ValidButton[] = [];
  const seenLabels = new Set<string>();
  const rowCounts = new Map<number, number>();

  for (const raw of body.buttons as ButtonInput[]) {
    const label = typeof raw.label === "string" ? raw.label.trim() : "";
    if (!label) return jsonError("برای همه دکمه‌ها عنوان بنویسید.", 400);
    if (label.length > MENU_BUTTON_LABEL_MAX_LENGTH)
      return jsonError(
        `عنوان دکمه «${label.slice(0, 20)}» بیش از ${MENU_BUTTON_LABEL_MAX_LENGTH} نویسه است.`,
        400
      );
    // Telegram reads a leading slash as a command, which is routed before the
    // menu ever gets a look at the message.
    if (label.startsWith("/"))
      return jsonError(`عنوان دکمه نباید با «/» شروع شود: «${label}»`, 400);

    const labelNormalized = normalizeKeyword(label);
    if (!labelNormalized || labelNormalized.length > MENU_BUTTON_LABEL_MAX_LENGTH)
      return jsonError(`عنوان دکمه «${label}» معتبر نیست.`, 400);
    if (seenLabels.has(labelNormalized))
      return jsonError(`عنوان «${label}» برای دو دکمه تکرار شده است.`, 400);
    seenLabels.add(labelNormalized);

    if (raw.actionType !== "flow" && raw.actionType !== "reply")
      return jsonError(`مقصد دکمه «${label}» را انتخاب کنید.`, 400);
    const actionType = raw.actionType as MenuButtonActionType;

    const flowId =
      actionType === "flow" && typeof raw.flowId === "string" ? raw.flowId : null;
    const automationId =
      actionType === "reply" && typeof raw.automationId === "string"
        ? raw.automationId
        : null;
    if (actionType === "flow" && !flowId)
      return jsonError(`فلوی مقصد دکمه «${label}» را انتخاب کنید.`, 400);
    if (actionType === "reply" && !automationId)
      return jsonError(`پیام آمادهٔ دکمه «${label}» را انتخاب کنید.`, 400);

    const rowIndex =
      typeof raw.rowIndex === "number" && Number.isInteger(raw.rowIndex)
        ? raw.rowIndex
        : 0;
    const position =
      typeof raw.position === "number" && Number.isInteger(raw.position)
        ? raw.position
        : 0;
    if (rowIndex < 0 || rowIndex >= MENU_ROWS_MAX || position < 0)
      return jsonError("چیدمان دکمه‌ها معتبر نیست.", 400);

    const rowCount = (rowCounts.get(rowIndex) ?? 0) + 1;
    if (rowCount > MENU_BUTTONS_PER_ROW_MAX)
      return jsonError(
        `هر ردیف حداکثر ${MENU_BUTTONS_PER_ROW_MAX} دکمه می‌تواند داشته باشد.`,
        400
      );
    rowCounts.set(rowIndex, rowCount);

    buttons.push({
      label,
      labelNormalized,
      rowIndex,
      position,
      actionType,
      flowId,
      automationId,
    });
  }

  if (rowCounts.size > MENU_ROWS_MAX)
    return jsonError(`منو حداکثر ${MENU_ROWS_MAX} ردیف می‌تواند داشته باشد.`, 400);

  try {
    const admin = createAdminClient();
    const { data: connection, error: connectionError } = await admin
      .from("telegram_connections")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (connectionError) return jsonError("اطلاعات ربات بررسی نشد.", 500);
    if (!connection) return jsonError("ابتدا ربات تلگرام را متصل کنید.", 409);

    // Targets must exist and belong to this owner. The same lookup gives us the
    // trigger keywords, which is what the collision guard below needs: a menu
    // label arrives as plain text, so a label that matches a *different* rule's
    // keyword would be resolved by that rule instead of by the button.
    const [flowResult, replyResult] = await Promise.all([
      admin
        .from("automation_flows")
        .select("id, trigger_keyword, trigger_keyword_normalized")
        .eq("user_id", user.id)
        .eq("telegram_connection_id", connection.id),
      admin
        .from("telegram_keyword_automations")
        .select("id, keyword, keyword_normalized")
        .eq("user_id", user.id)
        .eq("telegram_connection_id", connection.id),
    ]);

    if (flowResult.error || replyResult.error)
      return jsonError("فلوها و پیام‌های آماده بررسی نشدند.", 500);

    type KeywordRow = { id: string; normalized: string; keyword: string };
    const flows: KeywordRow[] = (
      (flowResult.data as
        | { id: string; trigger_keyword: string; trigger_keyword_normalized: string }[]
        | null) ?? []
    ).map((row) => ({
      id: row.id,
      keyword: row.trigger_keyword,
      normalized: row.trigger_keyword_normalized,
    }));
    const replies: KeywordRow[] = (
      (replyResult.data as
        | { id: string; keyword: string; keyword_normalized: string }[]
        | null) ?? []
    ).map((row) => ({
      id: row.id,
      keyword: row.keyword,
      normalized: row.keyword_normalized,
    }));

    const flowIds = new Set(flows.map((row) => row.id));
    const replyIds = new Set(replies.map((row) => row.id));

    for (const button of buttons) {
      if (button.flowId && !flowIds.has(button.flowId))
        return jsonError(`فلوی دکمهٔ «${button.label}» پیدا نشد.`, 400);
      if (button.automationId && !replyIds.has(button.automationId))
        return jsonError(`پیام آمادهٔ دکمهٔ «${button.label}» پیدا نشد.`, 400);

      const clashingFlow = flows.find(
        (row) =>
          row.normalized === button.labelNormalized && row.id !== button.flowId
      );
      if (clashingFlow)
        return jsonError(
          `عنوان «${button.label}» با کلیدواژهٔ یک فلوی دیگر یکی است؛ عنوان دیگری بنویسید.`,
          409
        );

      const clashingReply = replies.find(
        (row) =>
          row.normalized === button.labelNormalized &&
          row.id !== button.automationId
      );
      if (clashingReply)
        return jsonError(
          `عنوان «${button.label}» با کلیدواژهٔ یک پیام آمادهٔ دیگر یکی است؛ عنوان دیگری بنویسید.`,
          409
        );
    }

    const { data: savedMenu, error: menuError } = await admin
      .from("telegram_menus")
      .upsert(
        {
          user_id: user.id,
          telegram_connection_id: connection.id,
          is_enabled: body.isEnabled === true,
          is_persistent: body.isPersistent !== false,
          resize_keyboard: body.resizeKeyboard !== false,
          one_time_keyboard: body.oneTimeKeyboard === true,
          input_field_placeholder: placeholder || null,
        },
        { onConflict: "telegram_connection_id" }
      )
      .select("id")
      .single();

    if (menuError || !savedMenu) {
      if (menuError && SETUP_ERROR_CODES.has(menuError.code)) return setupError();
      return jsonError("منو ذخیره نشد.", 500);
    }

    const { error: clearError } = await admin
      .from("telegram_menu_buttons")
      .delete()
      .eq("menu_id", savedMenu.id);
    if (clearError) return jsonError("منو ذخیره نشد.", 500);

    if (buttons.length > 0) {
      const { error: insertError } = await admin
        .from("telegram_menu_buttons")
        .insert(
          buttons.map((button) => ({
            menu_id: savedMenu.id,
            user_id: user.id,
            telegram_connection_id: connection.id,
            label: button.label,
            label_normalized: button.labelNormalized,
            row_index: button.rowIndex,
            position: button.position,
            action_type: button.actionType,
            flow_id: button.flowId,
            automation_id: button.automationId,
          }))
        );

      if (insertError) {
        if (insertError.code === "23505")
          return jsonError("دو دکمه عنوان یکسان دارند.", 409);
        return jsonError("دکمه‌های منو ذخیره نشدند.", 500);
      }
    }

    const stored = await readMenu(admin, connection.id);
    if (!stored)
      return jsonError("منو ذخیره شد، اما نسخهٔ تازهٔ آن بارگذاری نشد.", 500);

    return NextResponse.json({ menu: stored.menu });
  } catch {
    return jsonError("منو ذخیره نشد.", 500);
  }
};
