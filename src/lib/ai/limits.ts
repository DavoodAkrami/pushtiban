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
