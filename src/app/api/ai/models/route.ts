import { NextResponse } from "next/server";
import {
  getConfiguredProviders,
  OPENAI_MODELS,
  NVIDIA_NIM_MODELS,
  listOpenRouterFreeModels,
} from "@/configs";

export const runtime = "nodejs";

export const GET = async () => {
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
