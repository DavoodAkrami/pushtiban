import { NextResponse, type NextRequest } from "next/server";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { putMessengerProfile } from "@/lib/instagram/api";
import {
  buildMenuPayload,
  DM_MENU_MAX_COUNT,
  ICE_BREAKERS_MAX_COUNT,
  INSTAGRAM_REPLY_MAX_LENGTH,
  menuTitleMaxLength,
  type InstagramMenuItem,
} from "@/lib/instagram/automations";
import {
  hasValidOrigin,
  isSetupError,
  jsonError,
  readBody,
  requireConnection,
  SETUP_MESSAGE,
} from "@/lib/instagram/automations-api";

export const runtime = "nodejs";

type MenuRow = {
  ice_breakers_enabled: boolean;
  persistent_menu_enabled: boolean;
};

type ItemRow = {
  id: string;
  kind: "ice_breaker" | "menu";
  title: string;
  reply_text: string;
  position: number;
};

const toItem = (row: ItemRow): InstagramMenuItem => ({
  id: row.id,
  kind: row.kind,
  title: row.title,
  replyText: row.reply_text,
  position: row.position,
});

/** GET /api/instagram/dm-menu — ice breakers, persistent menu and their state. */
export const GET = async () => {
  const resolved = await requireConnection();
  if ("error" in resolved) return resolved.error;

  const { account, admin, userId } = resolved;
  if (!account) {
    return NextResponse.json({ account: null, menu: null });
  }

  const [menuResult, itemsResult] = await Promise.all([
    admin
      .from("instagram_dm_menus")
      .select("ice_breakers_enabled, persistent_menu_enabled")
      .eq("user_id", userId)
      .maybeSingle(),
    admin
      .from("instagram_dm_menu_items")
      .select("id, kind, title, reply_text, position")
      .eq("user_id", userId)
      .order("kind", { ascending: true })
      .order("position", { ascending: true })
      .limit(50),
  ]);

  const error = menuResult.error ?? itemsResult.error;
  if (error) {
    const setupRequired = isSetupError(error.code);
    return jsonError(
      setupRequired ? SETUP_MESSAGE : "منوی دایرکت بارگذاری نشد.",
      setupRequired ? 503 : 500,
      setupRequired
    );
  }

  const menuRow = menuResult.data as MenuRow | null;

  return NextResponse.json({
    account,
    menu: {
      iceBreakersEnabled: menuRow?.ice_breakers_enabled ?? false,
      persistentMenuEnabled: menuRow?.persistent_menu_enabled ?? false,
      items: ((itemsResult.data as ItemRow[] | null) ?? []).map(toItem),
    },
  });
};

type DraftItem = {
  kind: "ice_breaker" | "menu";
  title: string;
  replyText: string;
  position: number;
};

/**
 * Validate the whole menu at once.
 *
 * Meta stores the messenger profile as a single document, so a partial save has
 * no meaning: either the list the owner sees is what Instagram shows, or the
 * request failed.
 */
const parseItems = (
  value: unknown
): { items: DraftItem[] } | { message: string } => {
  if (!Array.isArray(value)) return { message: "فهرست دکمه‌ها معتبر نیست." };

  const items: DraftItem[] = [];
  const counts = { ice_breaker: 0, menu: 0 };

  for (const raw of value) {
    if (!raw || typeof raw !== "object") {
      return { message: "یکی از دکمه‌ها معتبر نیست." };
    }
    const entry = raw as Record<string, unknown>;

    const kind = entry.kind;
    if (kind !== "ice_breaker" && kind !== "menu") {
      return { message: "نوع دکمه معتبر نیست." };
    }

    const title = typeof entry.title === "string" ? entry.title.trim() : "";
    if (!title) return { message: "برای هر دکمه یک عنوان بنویسید." };
    if (title.length > menuTitleMaxLength(kind)) {
      return {
        message:
          kind === "menu"
            ? "عنوان گزینهٔ منو حداکثر ۳۰ نویسه است."
            : "عنوان سوال آماده حداکثر ۸۰ نویسه است.",
      };
    }

    const replyText =
      typeof entry.replyText === "string" ? entry.replyText.trim() : "";
    if (!replyText) return { message: "برای هر دکمه یک پاسخ بنویسید." };
    if (replyText.length > INSTAGRAM_REPLY_MAX_LENGTH) {
      return { message: "متن پاسخ حداکثر ۱۰۰۰ نویسه است." };
    }

    counts[kind] += 1;
    items.push({ kind, title, replyText, position: counts[kind] - 1 });
  }

  if (counts.ice_breaker > ICE_BREAKERS_MAX_COUNT) {
    return { message: "اینستاگرام حداکثر ۴ سوال آماده را نمایش می‌دهد." };
  }
  if (counts.menu > DM_MENU_MAX_COUNT) {
    return { message: "منوی دایرکت حداکثر ۵ گزینه دارد." };
  }

  return { items };
};

/**
 * PUT /api/instagram/dm-menu — replace the menu and push it to Instagram.
 *
 * Rows are rewritten before the push because the payload Instagram receives
 * carries our own row ids: a tap comes back as an opaque payload, and the
 * webhook looks the reply up rather than trusting what came over the wire.
 */
export const PUT = async (request: NextRequest) => {
  if (!hasValidOrigin(request)) return jsonError("درخواست معتبر نیست.", 403);

  const body = await readBody(request);
  if (!body) return jsonError("اطلاعات قابل خواندن نیست.", 400);

  const resolved = await requireConnection();
  if ("error" in resolved) return resolved.error;

  const { account, admin, userId } = resolved;
  if (!account) {
    return jsonError("ابتدا حساب اینستاگرام خود را وصل کنید.", 400);
  }

  const parsed = parseItems(body.items);
  if ("message" in parsed) return jsonError(parsed.message, 400);

  const iceBreakersEnabled = body.iceBreakersEnabled === true;
  const persistentMenuEnabled = body.persistentMenuEnabled === true;

  const { error: menuError } = await admin.from("instagram_dm_menus").upsert(
    {
      user_id: userId,
      instagram_connection_id: account.id,
      ice_breakers_enabled: iceBreakersEnabled,
      persistent_menu_enabled: persistentMenuEnabled,
    },
    { onConflict: "instagram_connection_id" }
  );

  if (menuError) {
    const setupRequired = isSetupError(menuError.code);
    return jsonError(
      setupRequired ? SETUP_MESSAGE : "تنظیمات منو ذخیره نشد.",
      setupRequired ? 503 : 500,
      setupRequired
    );
  }

  // Replace rather than diff: the list is at most nine rows, and a diff would
  // buy nothing but a way to get the positions wrong.
  await admin.from("instagram_dm_menu_items").delete().eq("user_id", userId);

  let saved: ItemRow[] = [];
  if (parsed.items.length) {
    const { data, error } = await admin
      .from("instagram_dm_menu_items")
      .insert(
        parsed.items.map((item) => ({
          user_id: userId,
          instagram_connection_id: account.id,
          kind: item.kind,
          title: item.title,
          reply_text: item.replyText,
          position: item.position,
        }))
      )
      .select("id, kind, title, reply_text, position");

    if (error) {
      return jsonError("دکمه‌های منو ذخیره نشدند.", 500);
    }
    saved = (data as ItemRow[] | null) ?? [];
  }

  // Push to Meta. A failure here leaves the rows saved and reports honestly,
  // because the owner's next save is the retry and losing their text is worse.
  const { data: connectionRow } = await admin
    .from("instagram_connections")
    .select("token_ciphertext")
    .eq("id", account.id)
    .maybeSingle();

  let synced = false;
  const tokenRow = connectionRow as { token_ciphertext: string } | null;
  if (tokenRow) {
    try {
      synced = await putMessengerProfile({
        iceBreakers: iceBreakersEnabled
          ? saved
              .filter((row) => row.kind === "ice_breaker")
              .sort((a, b) => a.position - b.position)
              .map((row) => ({
                question: row.title,
                payload: buildMenuPayload(row.id),
              }))
          : [],
        persistentMenu: persistentMenuEnabled
          ? saved
              .filter((row) => row.kind === "menu")
              .sort((a, b) => a.position - b.position)
              .map((row) => ({
                title: row.title,
                payload: buildMenuPayload(row.id),
              }))
          : [],
        token: decryptSecret(tokenRow.token_ciphertext),
      });
    } catch {
      synced = false;
    }
  }

  return NextResponse.json({
    menu: {
      iceBreakersEnabled,
      persistentMenuEnabled,
      items: saved.map(toItem),
    },
    synced,
  });
};
