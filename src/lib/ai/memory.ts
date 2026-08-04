import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Short-term chat memory.
//
// A conversation is a SESSION: while the customer keeps messaging (gaps under
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
//
// Two channels, two tables, one code path. telegram_chat_sessions is keyed by a
// numeric chat_id, instagram_chat_sessions by a text sender_id (an IGSID is a
// 17-digit opaque identifier, not a number). They stay separate tables so each
// keeps its `on delete cascade` from its own connection table — the same
// reasoning that gave Instagram its own connections table rather than a generic
// one. The window, the caps and the fail-open behaviour are identical.
// ---------------------------------------------------------------------------

export type ChatTurn = { role: "user" | "assistant"; text: string };

export type MemoryChannel = "telegram" | "instagram";

type ChannelTable = {
  table: string;
  connectionColumn: string;
  chatColumn: string;
};

const CHANNEL_TABLES: Record<MemoryChannel, ChannelTable> = {
  telegram: {
    table: "telegram_chat_sessions",
    connectionColumn: "telegram_connection_id",
    chatColumn: "chat_id",
  },
  instagram: {
    table: "instagram_chat_sessions",
    connectionColumn: "instagram_connection_id",
    chatColumn: "sender_id",
  },
};

/**
 * Which customer, on which connection, on which channel. `chatId` is a number
 * for Telegram and a string for Instagram; both are passed straight through to
 * their own column, never converted.
 */
export type ChatKey = {
  channel?: MemoryChannel;
  connectionId: string;
  chatId: number | string;
};

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

const parseStoredTurns = (value: unknown, now: number): StoredTurn[] => {
  if (!Array.isArray(value)) return [];
  const turns: StoredTurn[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const { role, text, at } = entry as Record<string, unknown>;
    if (role !== "user" && role !== "assistant") continue;
    if (typeof text !== "string" || !text.trim()) continue;
    if (typeof at !== "number" || !Number.isFinite(at)) continue;
    // Clamp forward: a turn stamped in the future (clock skew between
    // instances) would otherwise outlive the window. Writes persist the clamp.
    turns.push({ role, text, at: Math.min(at, now) });
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
  channel = "telegram",
  connectionId,
  chatId,
}: ChatKey): Promise<ChatSession> => {
  const { table, connectionColumn, chatColumn } = CHANNEL_TABLES[channel];

  try {
    const now = Date.now();
    const cutoff = now - SESSION_WINDOW_MS;
    const admin = createAdminClient();

    // The window is enforced twice, on purpose. The `last_seen_at` filter
    // means a cold chat returns NO ROW at all — the session cannot leak past
    // the window even if a turn carries a bad timestamp. The per-turn filter
    // then trims the surviving row to the last 30 minutes.
    const { data } = await admin
      .from(table)
      .select("turns")
      .eq(connectionColumn, connectionId)
      .eq(chatColumn, chatId)
      .gte("last_seen_at", new Date(cutoff).toISOString())
      .maybeSingle();

    const recent = parseStoredTurns(
      (data as { turns?: unknown } | null)?.turns,
      now
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
  channel = "telegram",
  connectionId,
  chatId,
  turns,
}: ChatKey & { turns: ChatTurn[] }): Promise<void> => {
  const additions = turns.filter((turn) => turn.text.trim());
  if (!additions.length) return;

  const { table, connectionColumn, chatColumn } = CHANNEL_TABLES[channel];

  try {
    const admin = createAdminClient();
    const now = Date.now();
    const cutoff = now - SESSION_WINDOW_MS;

    // Re-read rather than reusing what the request loaded: the stored turns are
    // untruncated, and a second message may have landed in between. Same
    // `last_seen_at` gate as the read — a cold row is not merged into, it is
    // overwritten, so a new session never inherits the old one's turns.
    const { data } = await admin
      .from(table)
      .select("turns")
      .eq(connectionColumn, connectionId)
      .eq(chatColumn, chatId)
      .gte("last_seen_at", new Date(cutoff).toISOString())
      .maybeSingle();

    const kept = parseStoredTurns(
      (data as { turns?: unknown } | null)?.turns,
      now
    ).filter((turn) => turn.at >= cutoff);

    const next: StoredTurn[] = [
      ...kept,
      ...additions.map((turn) => ({
        role: turn.role,
        text: turn.text.trim().slice(0, STORED_TURN_MAX_CHARS),
        at: now,
      })),
    ].slice(-STORED_MAX_TURNS);

    await admin.from(table).upsert(
      {
        [connectionColumn]: connectionId,
        [chatColumn]: chatId,
        turns: next,
        last_seen_at: new Date(now).toISOString(),
      },
      { onConflict: `${connectionColumn},${chatColumn}` }
    );
  } catch {
    // Memory is an optimization; never let it break the conversation.
  }
};
