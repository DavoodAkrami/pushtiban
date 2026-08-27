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

The assistant is a fallback that only speaks after every structured response has
declined the message. The pipeline is the same on every channel:
**flows → keyword rules → assistant → human handoff**.

- **Telegram — production:** `src/app/api/telegram/webhook/[botId]/route.ts`.
  A plain text message reaches the AI only after flows, menu buttons and keyword
  automations have all declined it. Slash commands never reach it.

- **Instagram — production:** `src/app/api/instagram/webhook/route.ts`.
  Structured handling runs first: a postback checks for a flow step or menu tap,
  a plain DM checks for a matching flow keyword and then a `dm_keyword`
  automation. Only what remains reaches the assistant.
  Two gates in addition to the master switch: `ai_assistant_settings.instagram_enabled`
  (owner, defaults true) and the platform kill switch in `ai_global_settings`.
  Memory lives in `instagram_chat_sessions`; the 30-minute session window, the
  turn cap (4 / 600 chars) and the fail-open behaviour are identical to Telegram.
  The model writes Markdown; Instagram renders none of it, so the reply is
  flattened to plain text with `markdownToPlainText` (`src/lib/instagram/format.ts`)
  before sending.
  Human handoff offers two quick-reply chips (`بله، بفرست` / `نه، مشکلی نیست`);
  escalated conversations are mirrored to the owner's Telegram bot when one is
  connected, and are always available in `/dashboard/inbox`.

- **Preview:** the pane on `/dashboard/assistant`
  (`src/app/api/ai/preview/route.ts`). It does **not** reimplement the pipeline —
  it calls `generateAssistantReply`, the same function both webhooks call, so
  the persona, retrieval, `ai_global_settings` thresholds, escalation tool,
  provider order and usage logging are identical by construction. It adds the
  owner's `is_enabled` check and converts the reply with `markdownToTelegramHtml`
  so the owner sees the customer's real formatting.

  Two honest divergences: history is held in the browser rather than read from
  `telegram_chat_sessions`, and an escalation is *reported* as a badge rather than
  opening a conversation. **A preview message costs a real message** off the
  monthly cap — it is a real completion — so the pane states this up front, shows
  the remaining count, and refreshes the sidebar quota after every reply.

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
             + retrieved BUSINESS DATA / FACTS / Q&A / KB
             + escalation instruction (only when handoff is on)
assistant  …
user       …          ← memory: recent turns of the open session
user       the customer's new message
```

**1. Persona** — `src/lib/ai/persona.ts`, `getBusinessPersona(userId)`

| Piece | Source | Owner edits at |
| --- | --- | --- |
| Business name, category | `profiles.business_name` / `business_category` | Settings → business info |
| Business intro | `ai_assistant_settings.business_intro` | `/dashboard/assistant/persona` |
| Behaviour instructions | `ai_assistant_settings.assistant_instructions` | same |
| Warmth, enthusiasm, headings/lists, emoji | four `less` / `default` / `more` columns | same |

Cached 60s in memory per user. Reads **fail open**: a missing column degrades to
a generic prompt instead of breaking the reply. A style dial left on `default`
emits **nothing** — only the dials the owner moved cost tokens.

**2. Retrieval (RAG)** — `src/lib/ai/rag.ts`, `retrieveRagContext()`

1. **Intent and retrieval plan** — one cheap `gpt-4o-mini` call classifies the message
   (`shipping` / `pricing` / `products` / `returns` / `account` / `general`) and
   condenses it into a search query. When the chat has memory, the previous
   customer message is passed in so follow-ups resolve into standalone queries.
   When eligible Business Data exists, the same call may also produce one
   constrained public lookup plan and one private collection routing hint; there
   is no separate planner or summarizer completion. The classifier sees at most
   **8** active public capabilities and **8** eligible private collection keys;
   their combined compact metadata remains within **3600 characters**. Names and
   labels are serialized as untrusted data. Toggleable platform-wide by a site
   admin.
2. **Facts** — rows of `ai_knowledge_facts` for the business. Always included,
   never vector-searched. This is the only section with no similarity bar to
   limit it, so it is capped at **20 facts / 1200 characters** (oldest first,
   `src/lib/ai/limits.ts`); the facts editor warns the owner when their list
   exceeds the cap.
3. **Public Business Data** — `src/lib/business-data/ai-retrieval.ts` discovers only
   collections where `access_scope = public_catalog`, `ai_enabled = true`, and
   `status = active`. The model names a stable collection key and a bounded set
   of search/filter/sort operations; server validation resolves those only
   against the eligible capability map, then the service-role-only
   `business_data_lookup_public` RPC repeats tenant, scope, collection, field,
   operator, type, projection, and limit checks in PostgreSQL. It performs
   deterministic text matching and typed comparisons in the database rather
   than loading a collection for model-side filtering.

   The RPC returns no record IDs or source metadata. It projects only fields
   marked `answer`; `filter_only` fields can constrain or sort a lookup but are
   removed before the result crosses the database boundary, and `hidden` fields
   cannot be searched, filtered, sorted, or returned.

   **Verified-customer Business Data** — `src/lib/business-data/private-access.ts`
   exposes an active `verified_customer` collection only after the owner has
   selected two distinct required, filterable `filter_only` fields with suitable
   semantic roles: a record locator and a customer proof. Owner setup checks for
   missing values in active records and shows only sanitized diagnostic states.
   The first private request creates a short-lived verification challenge; locator
   and proof replies are intercepted before chat memory and the final model, and
   are never persisted as proof values. Stored and submitted values pass through
   the same database normalization: Persian/Arabic digits become Latin digits,
   email is trimmed and lower-cased, identifier whitespace is normalized, and a
   `phone` role safely canonicalizes Iranian `09`, `+98`, and `0098` forms. There
   is no partial or fuzzy match. A locator miss remains at the locator step; one
   verifier mistake retains the short-lived challenge for a bounded retry, while
   the existing five failures per 15 minutes still stops the exchange. A
   successful match creates a **10-minute**, record-scoped session keyed by the
   business, channel, connection, hashed external channel identity, collection,
   and record. Telegram's signed webhook establishes a stable Telegram sender;
   Instagram's signed webhook establishes a stable IGSID. Neither is treated as
   proof that the account owns a business record.

   The service-role-only `business_data_private_find_candidate_result`,
   `business_data_private_verify_result`, and `business_data_lookup_verified_customer`
   RPCs repeat tenant, collection scope, active configuration, session expiry,
   channel identity, record ownership, and projection checks in PostgreSQL.
   Only `answer` fields of that one verified record reach the model;
   `filter_only` values never do, and `hidden` values are not queryable or
   returned. `internal` collections remain completely excluded. Five failed
   verification attempts per business/collection/channel identity in 15 minutes
   receive the same generic failure response, so locator existence and a wrong
   proof are not distinguished.

   One turn performs at most one public or one private structured lookup. The normal request is **3**
   records and the hard ceiling is **5 records**, **5 filters**, **6 returned
   fields**, **280 characters per string value**, and **2800 serialized
   characters** of Business Data context. Oversized results are reduced
   deterministically before prompt construction. A pure structured-data question
   skips knowledge embedding/vector search; a mixed structured + policy question
   runs both retrieval paths after the same intent call. Capability metadata is
   cached for 60 seconds and invalidated after collection/field structure changes.

   Business-controlled values are serialized under a short `BUSINESS DATA`
   section labelled as untrusted data, never concatenated as assistant
   instructions. A zero-match result is preserved as evidence and the prompt
   forbids inventing a matching item. Bounded logs contain only collection kind,
   counts, payload size, duration, and truncation state—not record values,
   customer queries, secrets, or private identifiers.
4. **Q&A** — `match_knowledge_qa` (pgvector, cosine) over curated pairs in
   `ai_knowledge_qa`. The condensed query is what gets embedded.
5. **Chunks** — `match_knowledge_chunks_filtered` over `knowledge_chunks`. The
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
prompt states the source priority explicitly: **current verified BUSINESS DATA >
current public BUSINESS DATA > FACTS > Q&A > KB**. Business Data is authoritative
for dynamic structured values such as current price, stock, availability, order
status, tracking, reservation time, and subscription state; curated facts/Q&A
and document chunks remain authoritative for policies, explanations, and other
long-form knowledge. Mixed questions receive both paths without silently merging
contradictory dynamic values from an older document.

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

**3. Memory** — `src/lib/ai/memory.ts`, tables `telegram_chat_sessions` and `instagram_chat_sessions`

A chat is a **session**. The same 30-minute window and the same turn-cap apply
on every channel — the implementation is one function parametrised by the
channel, writing to the table that belongs to it.

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

Verified-customer authorization is deliberately separate from chat memory and
shorter than it: a 10-minute private session does not outlive the 30-minute
conversation window, and it is never a permanent customer authorization.

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

**6. Actions** — `src/lib/ai/actions/`, table `business_action_executions`

The existing intent completion may select one compact action request from the
server's explicit registry; there is no second planner call. Model output is
untrusted: the server validates the registered key, exact argument schema,
tenant and channel connection, business configuration, customer verification,
and confirmation state before a handler can run. Business Data and connector
values are never instructions and cannot authorize an action.

Each business can enable or disable registered Actions at
`/dashboard/assistant/actions`. The registry remains authoritative: a business
can only disable an Action or add a confirmation requirement; it cannot make a
registry-required verification or confirmation optional. `create_support_request`
keeps its compatible default of enabled when no setting exists. The order and
reservation mutations are disabled by default and are not exposed to the intent
call until an eligible Business Data capability, a selected internal or external
destination, complete field mappings, and the owner's enabled setting all agree.
The compact schema goes to the final reply completion only when the current
customer message directly matches an enabled operation but cannot yet execute;
that lets the assistant ask only for missing fields without adding another call.

Confirmation-required actions are stored server-side for five minutes and are
bound to the business, channel connection, hashed customer identity,
conversation, exact action, and exact prepared arguments. Preparation resolves
live availability or the authoritative product, price, stock, and private record
before the confirmation text is produced; customer/model-supplied prices and
record identifiers are discarded. A model claim that
the customer confirmed or is verified has no authority. Webhook delivery IDs
produce deterministic server-controlled idempotency keys, while handlers receive
the execution ID for downstream deduplication. The audit stores bounded
arguments/results and sanitized failure codes—not chain-of-thought, credentials,
or raw channel identities. Customer-provided action fields are retained only in
the server-only pending/execution record needed to bind confirmation and retry.

The registry includes `check_availability`, `create_reservation`,
`cancel_reservation`, `create_order`, and `cancel_order` in addition to
`create_support_request`. Availability is a bounded read from the configured
internal Business Data collection or external Supabase source. Creates write
only owner-mapped business concepts to the selected destination and return only
after the authoritative write succeeds. Internal creates keep execution and
idempotency references in the Action infrastructure and generate required
Business Data titles when the destination schema needs one; owners do not have
to add technical fields for those values. A single datetime field may represent
both reservation date and time. Internal order execution locks the
authoritative product row, re-checks price and availability, and performs the
stock decrement and order insert in one service-only transaction. Internal
reservation capacity changes and record creation use the same transactional
boundary. Server-controlled execution references make these writes idempotent.
Cancellations accept no model-authored record ID: they resolve the exact record
from the active, record-scoped verified-customer session, re-check ownership and
status at execution, and update only the configured status field.

`create_support_request` accepts no
model-authored payload and reuses `support_conversations` / `support_messages` to
place the customer's original message in the existing inbox. It requires the
owner's human-handoff setting and does not require confirmation because opening a
support request is low risk. Connector credentials remain in encrypted
`business_data_source_secrets`; they never enter model context, browser responses,
execution records, or logs. CSV/XLSX/manual labels describe ingestion origins,
not mutation restrictions: once imported, their records can become Pushtiban's
current operational state and may be changed through controlled internal
Actions. The original file is never modified and there is no automatic file
upstream; a later explicit import remains a separate owner-initiated ingestion
event. External Supabase remains available as an optional live destination. No
action can run arbitrary SQL, choose a table or column, invent an API URL, or
request a generic database mutation.

### Gates on every message

`ai_assistant_settings.is_enabled` (owner) → `ai_global_settings.ai_enabled`
(platform kill switch) → `checkAiLimits()` (monthly token and message caps).
Every completion is logged to `ai_usage_logs` by `logAiUsage()`, which feeds the
admin usage charts and the sidebar's remaining-message count.

Structured database retrieval is not AI usage and creates no token log. The
existing intent and final chat completions continue to be logged separately;
Business Data does not introduce an additional planner/verifier/summarizer model
call. A verification prompt returns immediately after the existing intent call;
the answer after a verified lookup uses the usual intent + final completion.
Actions reuse that intent call; a handled action returns its server-authored
result without an additional answer completion. Provider/model routing remains
unchanged.

### Token discipline

The prompt is deliberately lean, and changes should keep it that way:

- Retrieval metadata the model cannot act on (similarity scores, per-item
  categories) is **not** sent.
- Business Data capability discovery and result context have independent hard
  character/count budgets; internal IDs, source metadata, verification inputs,
  filter-only values, and hidden values never enter the final prompt.
- Section markers are one short header (`FACTS:`), not open/close banners.
- Unused capabilities are not described — no handoff, no escalation text.
- Untouched persona dials cost nothing.
- Memory and facts are the two parts that grow without a similarity bar to stop
  them, which is why both are capped twice (count *and* characters).

### Explaining it to the owner

`/how-ai-feed-data` is the public, non-technical version of this section: one
worked example, the four inputs named with where each came from, what never
reaches the model, the three gates, and the numbers. It is a server component and
**imports** `FACTS_MAX_COUNT` / `FACTS_MAX_CHARS` / `CHUNKS_MAX_PER_USER`
(`lib/ai/limits.ts`), `SESSION_WINDOW_MS` / `PROMPT_MAX_TURNS` /
`PROMPT_MAX_CHARS` (`lib/ai/memory.ts`) and `DEFAULT_SIGNUP_MESSAGE_LIMIT`
(`lib/ai/usage.ts`) rather than restating them — change a cap here and the page
follows. Never hard-code these digits back into its Persian copy.

### SQL

`supabase/ai-assistant.sql` (settings, facts, Q&A) · `supabase/rag.sql`
(pgvector, **`knowledge_sources` + `knowledge_chunks`**, `match_knowledge_chunks`) ·
`supabase/knowledge.sql` (the `category` column, `match_knowledge_qa` and
`match_knowledge_chunks_filtered`) ·
`supabase/ai-persona.sql` (persona columns) · `supabase/ai-memory.sql`
(Telegram chat sessions) · `supabase/rag-security.sql` (match-function grants) ·
`supabase/inbox.sql` (handoff) · `supabase/admin.sql` (global settings, usage
logs) · `supabase/channel-inbox.sql` (channel column on conversations,
`telegram_enabled` / `instagram_enabled` on `ai_assistant_settings`) ·
`supabase/instagram-automations.sql` (Instagram chat sessions, idempotency
table) · `supabase/instagram-flows.sql` (channel column on `automation_flows`,
Instagram-specific node/button limit triggers) · `supabase/business-data.sql`
(collections, fields, records, source/sync foundation, verified-customer
configuration/challenges/sessions/attempt audits, and the service-role-only
bounded public and verified-record lookup RPCs) · `supabase/ai-actions.sql`
(tenant-owned action restrictions and connector/field mappings plus server-only
confirmation, idempotency, audit state, and support-message execution links).

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
