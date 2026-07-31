# پشتیبان — Persian AI Customer-Support SaaS Landing Page

A production-quality, fully RTL Persian landing page for an AI customer-support
platform, built with a Notion-inspired design language: calm surfaces, generous
whitespace, soft glass, and restrained use of a single accent blue.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- **Tailwind CSS** — token-driven theming via CSS variables (`darkMode: "class"`)
- **Framer Motion** — word/char reveals, blur-to-sharp scroll reveals, stagger,
  parallax, mouse-follow layers, scroll-driven timeline progress
- **shadcn/ui-style primitives** (Button, Accordion on Radix)
- **Lucide** icons, **Vazirmatn** variable font (self-hosted)

## Run

```bash
npm install
npm run dev     # http://localhost:3000
npm run build && npm start
```

## Structure

```
src/
  app/               layout (RTL, fa, dark default), page, /design gallery, globals.css (tokens)
  components/
    layout/          header (glass, stronger on scroll), footer
    motion/          Reveal / Stagger / WordReveal / CharReveal, Parallax, AmbientBackground
    sections/        hero, features, how-it-works, showcase,
                     benefits, integrations, pricing (hidden), faq, final-cta
    ui/              button, input, textarea, select, modal, toast, alert,
                     tooltip, badge, checkbox/switch, icon, spinner,
                     accordion, glass-card, section
  lib/utils.ts       cn() + Persian-digit helper
```

See **CONTRIBUTING.md** for design tokens, component rules and the animation
guidelines; open **`/design`** for the live component gallery.

## The AI system — how the assistant is fed

Everything the assistant knows arrives through one of four channels: the
**persona**, **retrieval**, **memory**, and the **customer's message**. Nothing
else reaches the model. This section is the contract; keep it true (see rule 11
in `CLAUDE.md`).

### Where it runs

- **Production:** the Telegram webhook, `src/app/api/telegram/webhook/[botId]/route.ts`.
  A plain text message reaches the AI only after flows, menu buttons and keyword
  automations have all declined it — the AI is the fallback, never the first
  responder. Slash commands never reach it.
- **Preview:** the pane on `/dashboard/assistant`
  (`src/app/api/ai/preview/route.ts`). It does **not** reimplement the pipeline —
  it calls `generateTelegramAiReply`, the same function the webhook calls, so
  the persona, retrieval, `ai_global_settings` thresholds, escalation tool,
  provider order and usage logging are identical by construction. It adds the
  owner's `is_enabled` check (which the webhook applies itself, outside that
  function) and converts the reply with `markdownToTelegramHtml`, so the owner
  sees the customer's real formatting.

  Two honest divergences: history is held in the browser and passed back per
  request rather than read from `telegram_chat_sessions` (a preview is not a
  chat with a real `chat_id`), and an escalation is *reported* as a badge rather
  than opening a conversation. **A preview message costs a real message** off
  the monthly cap — it is a real completion — so the pane states this up front,
  shows the remaining count, and refreshes the sidebar quota after every reply.

- **Deprecated:** `/ai/rag-test` now redirects to `/dashboard/assistant`. It sat
  outside `src/proxy.ts`'s matcher, let the caller pick the provider and model
  (including `openrouter`, which production can never use), hard-wired the
  retrieval thresholds past the admin globals, and charged the owner a message
  while skipping every gate. `/ai/test` remains — it is an unauthenticated raw
  provider smoke test with no tenant data, not a product surface.

### What the model receives

One `system` message, then the session's remembered turns, then the new question:

```
system     persona identity + persona lines + format rule + source priority
             + retrieved FACTS / Q&A / KB
             + escalation instruction (only when handoff is on)
assistant  …
user       …          ← memory: recent turns of the open session
user       the customer's new message
```

**1. Persona** — `src/lib/ai/persona.ts`, `getBusinessPersona(userId)`

| Piece | Source | Owner edits at |
| --- | --- | --- |
| Business name, category | `profiles.business_name` / `business_category` | Settings → business info |
| Business intro | `ai_assistant_settings.business_intro` | `/dashboard/ai-assistance/persona` |
| Behaviour instructions | `ai_assistant_settings.assistant_instructions` | same |
| Warmth, enthusiasm, headings/lists, emoji | four `less` / `default` / `more` columns | same |

Cached 60s in memory per user. Reads **fail open**: a missing column degrades to
a generic prompt instead of breaking the reply. A style dial left on `default`
emits **nothing** — only the dials the owner moved cost tokens.

**2. Retrieval (RAG)** — `src/lib/ai/rag.ts`, `retrieveRagContext()`

1. **Intent** — one cheap `gpt-4o-mini` call classifies the message
   (`shipping` / `pricing` / `products` / `returns` / `account` / `general`) and
   condenses it into a search query. When the chat has memory, the previous
   customer message is passed in so follow-ups resolve into standalone queries.
   Toggleable platform-wide by a site admin.
2. **Facts** — rows of `ai_knowledge_facts` for the business. Always included,
   never vector-searched. This is the only section with no similarity bar to
   limit it, so it is capped at **20 facts / 1200 characters** (oldest first,
   `src/lib/ai/limits.ts`); the facts editor warns the owner when their list
   exceeds the cap.
3. **Q&A** — `match_knowledge_qa` (pgvector, cosine) over curated pairs in
   `ai_knowledge_qa`. The condensed query is what gets embedded.
4. **Chunks** — `match_knowledge_chunks_filtered` over `knowledge_chunks`. The
   detected category is a **soft ranking boost, never a hard filter**. The owner
   picks a source's category when ingesting it at
   `/dashboard/knowledge/sources`, and every chunk of that source is stored with
   it. Before that page existed the ingest route never wrote the column, so all
   chunks were `general` and the `+0.05` same-category bonus could only ever
   fire for Q&A.

Sources are ingested at **`/dashboard/knowledge/sources`** in three ways, all
through `POST /api/ai/rag/ingest`: pasted text, a `.txt`/`.md`/`.csv` file read
in the browser into that same text field, and a URL the server fetches itself
(`src/lib/ai/fetch-url.ts`). The URL path is an SSRF sink by construction — it
takes an owner-supplied address and fetches it from our network — so the scheme,
port, hostname and **every resolved A/AAAA record** are checked against private,
loopback, link-local and CGNAT ranges, and redirects are followed manually so
each hop is re-validated. PDF and Word are deliberately not supported: they
would need a parser dependency and a Storage bucket. Stored chunks are capped at
**500 per business** (`CHUNKS_MAX_PER_USER`, `src/lib/ai/limits.ts`), enforced by
the ingest route and surfaced in the editor. Deleting a source drops its chunks
through the `on delete cascade` on `knowledge_chunks.source_id`.

The sources editor expands each source into **the chunks themselves**
(`/api/ai/rag/chunks`), because the chunk is what the model actually reads and
the split is not always where the owner would have put it. A chunk's `content`
and its `embedding` are two halves of one record — text that is *found* by one
and *answered from* by the other — so **every content edit re-embeds**, and so
does **renaming a source**, since ingest embeds each chunk as
`# title\n\n<chunk>` and the old title is baked into every vector. A rename
whose re-index fails keeps the new title with stale vectors: a ranking nuance,
reported rather than rolled back, and never a broken source.

Thresholds and match counts come from `ai_global_settings` (site admin), and the
prompt states the source priority explicitly: **FACTS > Q&A > KB**.

The two similarity thresholds are deliberately different, and both are
calibrated for `text-embedding-3-small`, whose cosine scores run well below the
old `ada-002` range. Q&A matching is question→question — symmetric, so it scores
high and sits at **0.45**. Chunk matching is question→passage — asymmetric and
inherently lower, so it sits *below* the Q&A bar at **0.35**. Setting the chunk
bar too low is not a small mistake: at the original 0.2 an unrelated one-line
chunk scored 0.21 and was injected into every prompt.

**Retrieval is per business and enforced in SQL.** Both RPCs filter on
`user_id = match_user_id` inside the query, and RLS covers the tables. Because
the functions are `security definer` they bypass that RLS, so execute is granted
to `service_role` only (`supabase/rag-security.sql`) — they are called
exclusively through `createAdminClient()`. Granting them to `anon` would let
anyone holding the public key read any business's knowledge base by passing its
user id.

**3. Memory** — `src/lib/ai/memory.ts`, table `telegram_chat_sessions`

A chat is a **session**. While the customer keeps messaging with gaps under
**30 minutes**, recent turns travel with each request. After a longer gap the
chat is cold: the next message starts fresh with **no memory at all**, and the
assistant introduces itself again.

- One row per `(connection, chat)`, updated in place — the table grows with the
  customer base, not with traffic.
- The window is enforced **twice**: the query itself filters on `last_seen_at`,
  so a cold chat returns no row at all, and the surviving row is then trimmed
  per turn. Timestamps are clamped forward so clock skew between instances
  cannot keep a turn alive past the window.
- Sent to the model: at most **4 turns / 600 characters**, oldest dropped first.
  Stored: at most 8 turns, 400 characters each, nothing older than the window.
- The bare `/start` greeting is recorded as an assistant turn, so the first real
  question is not answered with a second introduction.
- Reads and writes **fail open** — a memory failure costs context, never a reply.

**4. Output** — `src/lib/telegram/format.ts`

The model writes Markdown; Telegram renders none of it. `markdownToTelegramHtml`
converts to Telegram's HTML subset (bold, italic, strike, code, links,
blockquote; headings become bold lines, bullets become `• `) and escapes
everything else. If the converted form is rejected or too long, the raw text is
sent instead — a formatting problem never costs the customer the answer.

**5. Escalation** — the `escalate_to_admin` tool

Attached **only** when the owner has human handoff on. With handoff off the tool
schema and its instruction are omitted entirely, since that path is unreachable.
An explicit «با پشتیبان صحبت کنم» is caught by a phrase list *before* any LLM
call — a free escalation.

### Gates on every message

`ai_assistant_settings.is_enabled` (owner) → `ai_global_settings.ai_enabled`
(platform kill switch) → `checkAiLimits()` (monthly token and message caps).
Every completion is logged to `ai_usage_logs` by `logAiUsage()`, which feeds the
admin usage charts and the sidebar's remaining-message count.

### Token discipline

The prompt is deliberately lean, and changes should keep it that way:

- Retrieval metadata the model cannot act on (similarity scores, per-item
  categories) is **not** sent.
- Section markers are one short header (`FACTS:`), not open/close banners.
- Unused capabilities are not described — no handoff, no escalation text.
- Untouched persona dials cost nothing.
- Memory and facts are the two parts that grow without a similarity bar to stop
  them, which is why both are capped twice (count *and* characters).

### SQL

`supabase/ai-assistant.sql` (settings, facts, Q&A) · `supabase/rag.sql`
(pgvector, **`knowledge_sources` + `knowledge_chunks`**, `match_knowledge_chunks`) ·
`supabase/knowledge.sql` (the `category` column, `match_knowledge_qa` and
`match_knowledge_chunks_filtered`) ·
`supabase/ai-persona.sql` (persona columns) · `supabase/ai-memory.sql`
(chat sessions) · `supabase/rag-security.sql` (match-function grants) ·
`supabase/inbox.sql` (handoff) · `supabase/admin.sql` (global settings, usage
logs).

## Notes

- **Dark mode is the default**; toggle in the header (next-themes, no flash).
- **Reduced motion** is respected globally (CSS media query + `useReducedMotion`
  in every animated component).
- All copy is Persian with Persian numerals; layout is `dir="rtl"` end to end.

## Restoring the pre-redesign codebase

The version of `main` before the redesign was merged is preserved under the
git tag `archive/pre-redesign`. To inspect or restore it:

```bash
git fetch origin
git checkout archive/pre-redesign        # detached — browse or test it
git branch main-backup archive/pre-redesign   # to keep it as a branch
```

The tag is immutable and is the canonical fallback if the redesign ever needs
to be reverted.
