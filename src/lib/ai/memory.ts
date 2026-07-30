import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Short-term chat memory.
//
// A Telegram chat is a SESSION: while the customer keeps messaging (gaps under
// SESSION_WINDOW_MS) the recent turns travel with each request, so the model
// can resolve follow-ups and knows it has already introduced itself. After a
// gap longer than the window the chat is cold — the next message starts fresh
// with no memory, and the assistant introduces itself again.
//
// Deliberately small: history is the only part of the prompt that grows with
// conversation length, so it is capped by turn count AND by characters, and
// the oldest turns are dropped first.
//
// Every read and write FAILS OPEN: a missing table or an unreachable database
// costs the conversation its memory, never its reply.
// ---------------------------------------------------------------------------

export type ChatTurn = { role: "user" | "assistant"; text: string };

export type ChatSession = {
  /** Recent turns, oldest first. Empty for a new session. */
  turns: ChatTurn[];
  /** True when nothing is remembered — the assistant should introduce itself. */
  isNewSession: boolean;
};

/** A chat with no message for this long is over; the next one starts fresh. */
export const SESSION_WINDOW_MS = 30 * 60_000;

/** Turns sent to the model (2 exchanges). */
const PROMPT_MAX_TURNS = 4;
/** Total characters of history sent to the model. */
const PROMPT_MAX_CHARS = 600;
/** Per-turn cap applied when storing. */
const STORED_TURN_MAX_CHARS = 400;
/** Turns kept in the row — a little more than we send, so trimming is cheap. */
const STORED_MAX_TURNS = 8;

type StoredTurn = ChatTurn & { at: number };

const EMPTY_SESSION: ChatSession = { turns: [], isNewSession: true };

const parseStoredTurns = (value: unknown): StoredTurn[] => {
  if (!Array.isArray(value)) return [];
  const turns: StoredTurn[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { role, text, at } = entry as Record<string, unknown>;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof text !== "string" || !text.trim()) continue;
    if (typeof at !== "number" || !Number.isFinite(at)) continue;
    turns.push({ role, text, at });
  }
  return turns;
};

/**
 * Newest-first budgeting: keep taking turns from the end until either cap is
 * hit, then restore chronological order. Dropping the oldest first means a
 * long answer three turns ago never crowds out the question just asked.
 */
const withinPromptBudget = (turns: StoredTurn[]): ChatTurn[] => {
  const kept: ChatTurn[] = [];
  let characters = 0;
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    if (kept.length >= PROMPT_MAX_TURNS) break;
    const turn = turns[index];
    if (characters + turn.text.length > PROMPT_MAX_CHARS && kept.length > 0) break;
    kept.push({ role: turn.role, text: turn.text });
    characters += turn.text.length;
  }
  return kept.reverse();
};

/**
 * The conversation so far for this chat, or an empty new session when the
 * chat has been quiet for longer than the window.
 */
export const loadChatSession = async ({
  connectionId,
  chatId,
}: {
  connectionId: string;
  chatId: number;
}): Promise<ChatSession> => {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("telegram_chat_sessions")
      .select("turns")
      .eq("telegram_connection_id", connectionId)
      .eq("chat_id", chatId)
      .maybeSingle();

    const cutoff = Date.now() - SESSION_WINDOW_MS;
    const recent = parseStoredTurns(
      (data as { turns?: unknown } | null)?.turns
    ).filter((turn) => turn.at >= cutoff);
    if (!recent.length) return EMPTY_SESSION;

    return { turns: withinPromptBudget(recent), isNewSession: false };
  } catch {
    return EMPTY_SESSION;
  }
};

/**
 * Append this exchange to the chat's memory, dropping anything that has fallen
 * outside the window. Best-effort: a failure is swallowed, since the customer
 * already has their answer by the time this runs.
 */
export const recordChatTurns = async ({
  connectionId,
  chatId,
  turns,
}: {
  connectionId: string;
  chatId: number;
  turns: ChatTurn[];
}): Promise<void> => {
  const additions = turns.filter((turn) => turn.text.trim());
  if (!additions.length) return;

  try {
    const admin = createAdminClient();
    const now = Date.now();
    const cutoff = now - SESSION_WINDOW_MS;

    // Re-read rather than reusing what the request loaded: the stored turns are
    // untruncated, and a second message may have landed in between.
    const { data } = await admin
      .from("telegram_chat_sessions")
      .select("turns")
      .eq("telegram_connection_id", connectionId)
      .eq("chat_id", chatId)
      .maybeSingle();

    const kept = parseStoredTurns(
      (data as { turns?: unknown } | null)?.turns
    ).filter((turn) => turn.at >= cutoff);

    const next: StoredTurn[] = [
      ...kept,
      ...additions.map((turn) => ({
        role: turn.role,
        text: turn.text.trim().slice(0, STORED_TURN_MAX_CHARS),
        at: now,
      })),
    ].slice(-STORED_MAX_TURNS);

    await admin.from("telegram_chat_sessions").upsert(
      {
        telegram_connection_id: connectionId,
        chat_id: chatId,
        turns: next,
        last_seen_at: new Date(now).toISOString(),
      },
      { onConflict: "telegram_connection_id,chat_id" }
    );
  } catch {
    // Memory is an optimization; never let it break the conversation.
  }
};
