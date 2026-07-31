// ---------------------------------------------------------------------------
// Prompt-budget limits shared by the server pipeline and the dashboard.
//
// Deliberately NOT in rag.ts: that module is `server-only`, and the facts
// editor is a client component that has to show the owner the same numbers the
// retrieval code enforces. One source of truth, importable from both sides.
// ---------------------------------------------------------------------------

/**
 * Standing facts are injected into every prompt, so they are the one context
 * section with no similarity bar to stop it growing. A business with fifty
 * facts would otherwise pay for all fifty on every customer message.
 *
 * Oldest facts win: the cap stays stable as new facts are added instead of
 * reshuffling what the assistant knows.
 */
export const FACTS_MAX_COUNT = 20;
export const FACTS_MAX_CHARS = 1200;

/**
 * Hard ceiling on stored chunks per business, so one account cannot bloat the
 * vector store without bound. Enforced by the ingest route; surfaced by the
 * sources editor so the owner sees the same number the server enforces.
 */
export const CHUNKS_MAX_PER_USER = 500;

/** Largest ingest payload, matching the route's own body guard. */
export const SOURCE_TEXT_MAX_CHARS = 100_000;
export const SOURCE_TITLE_MAX_LENGTH = 200;
