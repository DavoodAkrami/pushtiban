import type { Metadata } from "next";
import {
  AiPersonaPanel,
  type PersonaDraft,
  type StyleLevel,
} from "@/components/dashboard/ai-persona-panel";
import { businessCategoryLabel } from "@/lib/business-categories";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "شخصیت دستیار — پشتیبان",
};

const SETUP_ERROR_CODES = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

const LEVELS = new Set<StyleLevel>(["less", "default", "more"]);
const asLevel = (value: unknown): StyleLevel =>
  typeof value === "string" && LEVELS.has(value as StyleLevel)
    ? (value as StyleLevel)
    : "default";

const DEFAULT_DRAFT: PersonaDraft = {
  intro: "",
  instructions: "",
  warmth: "default",
  enthusiasm: "default",
  structure: "default",
  emoji: "default",
};

const AiPersonaPage = async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [personaResult, profileResult] = await Promise.all([
    user
      ? supabase
          .from("ai_assistant_settings")
          .select(
            "business_intro, assistant_instructions, tone_warmth, tone_enthusiasm, format_structure, format_emoji"
          )
          .eq("user_id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    user
      ? supabase
          .from("profiles")
          .select("business_name, business_category")
          .eq("id", user.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const row = personaResult.data as Record<string, unknown> | null;
  const profile = profileResult.data as {
    business_name?: string;
    business_category?: string;
  } | null;

  const initialPersona: PersonaDraft = row
    ? {
        intro: typeof row.business_intro === "string" ? row.business_intro : "",
        instructions:
          typeof row.assistant_instructions === "string"
            ? row.assistant_instructions
            : "",
        warmth: asLevel(row.tone_warmth),
        enthusiasm: asLevel(row.tone_enthusiasm),
        structure: asLevel(row.format_structure),
        emoji: asLevel(row.format_emoji),
      }
    : DEFAULT_DRAFT;

  return (
    <>
      <AiPersonaPanel
        initialPersona={initialPersona}
        businessName={profile?.business_name ?? ""}
        businessCategory={businessCategoryLabel(
          profile?.business_category ?? ""
        )}
        loadError={Boolean(personaResult.error)}
        setupRequired={Boolean(
          personaResult.error &&
            SETUP_ERROR_CODES.has(personaResult.error.code)
        )}
      />
    </>
  );
};

export default AiPersonaPage;
