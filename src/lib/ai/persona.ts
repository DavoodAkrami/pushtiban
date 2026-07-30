import "server-only";

import { businessCategoryLabel } from "@/lib/business-categories";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Per-business assistant persona: who the business is (name + category +
// owner-written intro) and how the assistant should sound (owner instructions
// + four style levels). Injected at the top of every system prompt so replies
// — introductions above all — are specific to the business instead of generic.
//
// Every read FAILS OPEN with defaults: a missing table/column or an
// unreachable database degrades to the previous generic prompt rather than
// breaking the reply.
// ---------------------------------------------------------------------------

export type StyleLevel = "less" | "default" | "more";

export const STYLE_LEVELS: readonly StyleLevel[] = ["less", "default", "more"];

export const isStyleLevel = (value: unknown): value is StyleLevel =>
  typeof value === "string" && STYLE_LEVELS.includes(value as StyleLevel);

export type BusinessPersona = {
  /** From profiles.business_name. */
  businessName: string;
  /** Persian label resolved from profiles.business_category (never the slug). */
  businessCategory: string;
  /** Owner-written description of the business. */
  intro: string;
  /** Owner-written instructions on how the assistant should behave. */
  instructions: string;
  warmth: StyleLevel;
  enthusiasm: StyleLevel;
  structure: StyleLevel;
  emoji: StyleLevel;
};

export const DEFAULT_PERSONA: BusinessPersona = {
  businessName: "",
  businessCategory: "",
  intro: "",
  instructions: "",
  warmth: "default",
  enthusiasm: "default",
  structure: "default",
  emoji: "default",
};

export const PERSONA_INTRO_MAX = 1500;
export const PERSONA_INSTRUCTIONS_MAX = 1500;

const asStyleLevel = (value: unknown): StyleLevel =>
  isStyleLevel(value) ? value : "default";

const asText = (value: unknown, max: number): string =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

// The persona changes only when the owner edits it, but it is read on every
// customer message. Cache briefly, mirroring getGlobalAiSettings in usage.ts.
const PERSONA_CACHE_TTL_MS = 60_000;
const personaCache = new Map<
  string,
  { value: BusinessPersona; expiresAt: number }
>();

export const invalidateBusinessPersonaCache = (userId?: string) => {
  if (userId) personaCache.delete(userId);
  else personaCache.clear();
};

/**
 * Load the persona for a business owner. Reads profiles (name + category) and
 * ai_assistant_settings (intro, instructions, style levels) in parallel.
 */
export const getBusinessPersona = async (
  userId: string
): Promise<BusinessPersona> => {
  const now = Date.now();
  const cached = personaCache.get(userId);
  if (cached && cached.expiresAt > now) return cached.value;

  let value = DEFAULT_PERSONA;
  try {
    const admin = createAdminClient();
    const [profileResult, settingsResult] = await Promise.all([
      admin
        .from("profiles")
        .select("business_name, business_category")
        .eq("id", userId)
        .maybeSingle(),
      admin
        .from("ai_assistant_settings")
        .select(
          "business_intro, assistant_instructions, tone_warmth, tone_enthusiasm, format_structure, format_emoji"
        )
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const profile = profileResult.data as {
      business_name?: string;
      business_category?: string;
    } | null;
    const settings = settingsResult.data as Record<string, unknown> | null;

    value = {
      businessName: asText(profile?.business_name, 120),
      businessCategory: businessCategoryLabel(profile?.business_category ?? ""),
      intro: asText(settings?.business_intro, PERSONA_INTRO_MAX),
      instructions: asText(
        settings?.assistant_instructions,
        PERSONA_INSTRUCTIONS_MAX
      ),
      warmth: asStyleLevel(settings?.tone_warmth),
      enthusiasm: asStyleLevel(settings?.tone_enthusiasm),
      structure: asStyleLevel(settings?.format_structure),
      emoji: asStyleLevel(settings?.format_emoji),
    };
  } catch {
    value = DEFAULT_PERSONA;
  }

  personaCache.set(userId, { value, expiresAt: now + PERSONA_CACHE_TTL_MS });
  return value;
};

// ---------------------------------------------------------------------------
// Prompt fragments. Token discipline: a level of "default" emits NOTHING, and
// all style directives collapse into a single comma-joined line, so an
// untouched persona costs zero extra tokens beyond the business identity line.
// ---------------------------------------------------------------------------

const STYLE_DIRECTIVES: Record<
  keyof Pick<
    BusinessPersona,
    "warmth" | "enthusiasm" | "structure" | "emoji"
  >,
  { less: string; more: string }
> = {
  warmth: {
    less: "neutral and matter-of-fact",
    more: "warm and personable",
  },
  enthusiasm: {
    less: "calm and understated",
    more: "upbeat and enthusiastic",
  },
  structure: {
    less: "no headings or bullet lists, plain sentences only",
    more: "short headings and bullet lists where they help",
  },
  emoji: {
    less: "no emojis",
    more: "emojis where they fit naturally",
  },
};

/** The identity line — the part that makes introductions business-specific. */
export const buildPersonaIdentity = (persona: BusinessPersona): string => {
  const { businessName, businessCategory } = persona;
  if (!businessName && !businessCategory) {
    return "You are the customer-support assistant for a business using Pushtiban.";
  }
  const label = businessCategory
    ? `${businessName || "this business"} (${businessCategory})`
    : businessName;
  return `You are the customer-support assistant for ${label}.`;
};

/**
 * The owner-authored and style lines that follow the identity line. Returns an
 * empty array when the owner has customized nothing.
 */
export const buildPersonaLines = (persona: BusinessPersona): string[] => {
  const lines: string[] = [];

  if (persona.intro) lines.push(`About the business: ${persona.intro}`);
  if (persona.instructions) {
    lines.push(`Owner's instructions: ${persona.instructions}`);
  }

  const style = (
    Object.keys(STYLE_DIRECTIVES) as Array<keyof typeof STYLE_DIRECTIVES>
  )
    .map((key) => {
      const level = persona[key];
      return level === "default" ? null : STYLE_DIRECTIVES[key][level];
    })
    .filter((directive): directive is string => Boolean(directive));

  if (style.length) lines.push(`Style: ${style.join("; ")}.`);

  return lines;
};
