import { NextResponse } from "next/server";
import {
  getConfiguredProviders,
  OPENAI_MODELS,
  NVIDIA_NIM_MODELS,
  listOpenRouterFreeModels,
} from "@/configs";
import { requireSiteAdmin } from "@/lib/auth/site-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const guardError = (status: 401 | 403) =>
  NextResponse.json(
    {
      error:
        status === 401
          ? "نشست شما تمام شده؛ دوباره وارد حساب شوید."
          : "دسترسی به آزمایش مستقیم مدل مخصوص مدیر سایت است.",
    },
    { status }
  );

export const GET = async () => {
  const guard = await requireSiteAdmin();
  if (!guard.ok) return guardError(guard.status);

  try {
    const providers = getConfiguredProviders();
    const models: Record<string, string[]> = {};

    for (const providerId of providers) {
      switch (providerId) {
        case "openai":
          models.openai = [...OPENAI_MODELS];
          break;
        case "nvidia-nim":
          models["nvidia-nim"] = [...NVIDIA_NIM_MODELS];
          break;
        case "openrouter":
          models.openrouter = await listOpenRouterFreeModels();
          break;
      }
    }

    return NextResponse.json({ models, providers });
  } catch (error) {
    console.error("Models API error:", error);
    return NextResponse.json(
      { models: {}, providers: [] },
      { status: 500 }
    );
  }
};
