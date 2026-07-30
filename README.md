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
- **Playground:** `/ai/rag-test` (`src/app/api/ai/rag/route.ts`) builds the exact
  same system prompt and shows what was retrieved. It has no memory — it is a
  prompt inspector, not a chat.

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
2. **Facts** — every row of `ai_knowledge_facts` for the business. Always
   included, never vector-searched.
3. **Q&A** — `match_knowledge_qa` (pgvector, cosine) over curated pairs in
   `ai_knowledge_qa`. The condensed query is what gets embedded.
4. **Chunks** — `match_knowledge_chunks_filtered` over `knowledge_chunks`. The
   detected category is a **soft ranking boost, never a hard filter**.

Thresholds and match counts come from `ai_global_settings` (site admin), and the
prompt states the source priority explicitly: **FACTS > Q&A > KB**.

**3. Memory** — `src/lib/ai/memory.ts`, table `telegram_chat_sessions`

A chat is a **session**. While the customer keeps messaging with gaps under
**30 minutes**, recent turns travel with each request. After a longer gap the
chat is cold: the next message starts fresh with **no memory at all**, and the
assistant introduces itself again.

- One row per `(connection, chat)`, updated in place — the table grows with the
  customer base, not with traffic.
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
- Memory is the only part that grows with conversation length, which is why it
  is capped twice (turns *and* characters).

### SQL

`supabase/ai-assistant.sql` (settings, facts, Q&A) · `supabase/rag.sql`
(pgvector, match functions) · `supabase/knowledge.sql` (sources, chunks) ·
`supabase/ai-persona.sql` (persona columns) · `supabase/ai-memory.sql`
(chat sessions) · `supabase/inbox.sql` (handoff) · `supabase/admin.sql`
(global settings, usage logs).

## Notes

- **Dark mode is the default**; toggle in the header (next-themes, no flash).
- **Reduced motion** is respected globally (CSS media query + `useReducedMotion`
  in every animated component).
- All copy is Persian with Persian numerals; layout is `dir="rtl"` end to end.
