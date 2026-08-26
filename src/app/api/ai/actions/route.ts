import { NextResponse, type NextRequest } from "next/server";
import {
  ACTION_REGISTRY,
  listSafeActionSettings,
} from "@/lib/ai/actions/registry";
import { isActionSettingsSetupError } from "@/lib/ai/actions/settings";
import {
  BUSINESS_ACTION_CONFIGURATION_SPECS,
  invalidateBusinessActionConfigurations,
  isBusinessActionKey,
  listSafeBusinessActionCatalog,
  parseBusinessActionConfigurationUpdate,
  resolveBusinessActionConfiguration,
} from "@/lib/ai/actions/business-config";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 16_384;

const jsonError = (error: string, status: number, setupRequired = false) =>
  NextResponse.json({ error, setupRequired }, { status });

const hasValidOrigin = (request: NextRequest) => {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
};

/** GET /api/ai/actions — sanitized registry metadata for the signed-in owner. */
export const GET = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("نشست شما تمام شده؛ دوباره وارد شوید.", 401);

  try {
    const [actions, catalog] = await Promise.all([
      listSafeActionSettings(user.id),
      listSafeBusinessActionCatalog(user.id),
    ]);
    return NextResponse.json({
      actions,
      catalog,
      configurationSpecs: BUSINESS_ACTION_CONFIGURATION_SPECS,
    });
  } catch {
    return jsonError("تنظیمات اقدامات بارگذاری نشد.", 500);
  }
};

/** PUT /api/ai/actions — update one explicit, registry-known action only. */
export const PUT = async (request: NextRequest) => {
  if (!hasValidOrigin(request)) {
    return jsonError(
      "درخواست معتبر نیست؛ صفحه را تازه کنید و دوباره تلاش کنید.",
      403
    );
  }
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return jsonError("درخواست بزرگ‌تر از حد مجاز است.", 413);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return jsonError("نشست شما تمام شده؛ دوباره وارد شوید.", 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("تنظیمات اقدام قابل خواندن نیست.", 400);
  }

  if (
    typeof body.actionKey !== "string" ||
    !ACTION_REGISTRY.has(body.actionKey) ||
    typeof body.enabled !== "boolean" ||
    (body.requireConfirmation !== undefined &&
      typeof body.requireConfirmation !== "boolean")
  ) {
    return jsonError("تنظیمات اقدام معتبر نیست.", 400);
  }

  const actionKey = body.actionKey;
  const businessAction = isBusinessActionKey(actionKey);
  const parsedConfiguration =
    businessAction && body.configuration !== undefined
      ? await parseBusinessActionConfigurationUpdate({
          actionKey,
          input: body.configuration,
          userId: user.id,
        })
      : null;
  if (businessAction && body.configuration !== undefined && !parsedConfiguration) {
    return jsonError(
      "منبع یا نگاشت فیلدهای این اقدام کامل و معتبر نیست.",
      400
    );
  }
  const currentCapability =
    businessAction && !parsedConfiguration
      ? await resolveBusinessActionConfiguration(user.id, actionKey)
      : null;
  if (businessAction && body.enabled === true && !parsedConfiguration && !currentCapability) {
    return jsonError(
      "پیش از فعال‌سازی، منبع و فیلدهای لازم این اقدام را تنظیم کنید.",
      409
    );
  }

  const row = {
      user_id: user.id,
      action_key: actionKey,
      is_enabled: body.enabled,
      require_confirmation: body.requireConfirmation === true,
      ...(parsedConfiguration
        ? {
            collection_id: parsedConfiguration.collectionId,
            source_id: parsedConfiguration.sourceId,
            related_collection_id: parsedConfiguration.relatedCollectionId,
            field_mapping: parsedConfiguration.fieldMapping,
            configuration: {
              cancellationValue: parsedConfiguration.cancellationValue,
            },
          }
        : {}),
    };
  const { error } = await supabase.from("business_action_settings").upsert(
    row,
    { onConflict: "user_id,action_key" }
  );

  if (error) {
    const setupRequired = isActionSettingsSetupError(error.code);
    return jsonError(
      setupRequired
        ? "راه‌اندازی اقدامات کامل نشده؛ اسکریپت ai-actions.sql را اجرا کنید."
        : "تنظیمات اقدام ذخیره نشد؛ دوباره تلاش کنید.",
      setupRequired ? 503 : 500,
      setupRequired
    );
  }

  invalidateBusinessActionConfigurations(user.id);
  const actions = await listSafeActionSettings(user.id);
  const action = actions.find((item) => item.key === body.actionKey);
  return action
    ? NextResponse.json({ action })
    : jsonError("تنظیمات اقدام قابل خواندن نیست.", 500);
};
