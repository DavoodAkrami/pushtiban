# نقشهٔ راه محصول — Pushtiban Roadmap

This is the product source of truth. Work like a product manager: **before
building, add the feature here; when it ships (built + verified), tick it.**
Keep entries short and user-facing — implementation detail belongs in the PR,
not here.

How to use:

- `- [ ]` planned · `- [x]` shipped
- New ideas go to the bottom of their phase (or **Backlog** if unscoped).
- Never delete a shipped item — the ticked list is our changelog.

---

## Phase 1 — Landing & design system

- [x] Persian RTL landing page (hero, features, how-it-works, dashboard
      showcase, benefits, integrations, FAQ, final CTA, footer)
- [x] Notion-inspired dark/light theme with token-driven colors
- [x] Component library at `/design` — buttons, inputs, textareas, selects
      (incl. searchable), modals, toasts, alerts, badges, icons, tooltips,
      switches, checkboxes, spinners, skeletons
- [x] Framer Motion animation system (reveals, springs, reduced-motion safe)
- [x] Glassy scrolled header that blends with the background at top
- [x] Design-system scrollbar applied site-wide
- [x] Viewport-aware select dropdowns (flip up / internal scroll)
- [x] Skeleton loading components (card, text, large block)
- [x] Language-aware input direction and non-resizable textareas
- [x] Developer docs: `CONTRIBUTING.md` + agent rules in `CLAUDE.md`
- [ ] Pricing section (built, currently commented out — re-enable when plans
      are final)

## Phase 2 — Foundation (data & AI plumbing)

- [x] Redux Toolkit store (`src/store/`, typed hooks, per-request provider)
- [x] Supabase client libraries + browser/server helpers (`src/lib/supabase/`)
- [x] AI SDKs installed: OpenAI, Anthropic, Google Gemini
- [ ] Supabase project schema: organizations, users, knowledge sources,
      conversations, messages
- [x] Auth with Supabase — signup (email + password + multi-step profile
      slides) and login at `/auth`, Persian UI; profiles table + trigger in
      `supabase/auth.sql`
- [ ] Password reset flow
- [ ] Protected responsive dashboard shell (`/dashboard`) with a collapsible
      desktop sidebar and mobile/tablet navigation drawer
- [x] Dashboard destinations for automation and AI assistance
- [x] Account settings modal with editable profile details
- [x] Dashboard account controls with a light, dark, and system theme selector
      plus logout confirmation

- [x] Settings: Connections section with Telegram bot connect/disconnect flow
- [x] AI provider configs in `src/configs/` — OpenAI via Metis (`openai` SDK),
      NVIDIA NIM via OpenAI-compatible client, OpenRouter via `@openrouter/sdk`
- [x] AI provider test chatbot at `/ai/test` — pick a model (incl. OpenRouter
      free auto via `openrouter/free`) and stream a reply
- [x] Upgrade to Next.js 16 (Active LTS) + React 19 — Next.js 14 reached end of
      life and no longer receives security patches
- [ ] Clear the two `react-hooks` v6 rules currently downgraded to warnings in
      `eslint.config.mjs`: replace the `setMounted(true)` hydration guards with
      a mount-safe pattern (~14 components) and rework the lazy store init in
      `src/store/provider.tsx`

## Phase 3 — Core product

- [ ] Telegram keyword and slash-command automations with owner-written ready
      replies and synchronized Telegram command menus
- [x] Dedicated `/dashboard/flow` workspace for interactive Telegram automations, with
      direct post-creation navigation, a visual message canvas, inline-button
      next-message / URL / end actions, and an expandable automation section
      in the dashboard navigation
- [ ] Move the flow workspace to `/dashboard/flow`, add card-first navigation
      and metadata editing, harden live Telegram flow delivery, and refine the
      canvas creation and drag interactions
- [ ] Add per-message replacement delivery and a customizable back action to
      interactive Telegram flows
- [ ] Knowledge-base ingestion: upload docs / paste text / crawl site
- [ ] AI assistant configuration (name, tone, model selection)
- [x] AI assistant on/off control with Telegram fallback after flows and
      prepared messages
- [x] AI assistance dashboard navigation expands into three children
      (assistant settings, business facts, prepared Q&A) like the automation
      section, with the facts and Q&A editors on their own pages under
      /dashboard/ai-assistance/facts and /dashboard/ai-assistance/qa
- [ ] Chat playground for testing the assistant against the knowledge base
- [x] RAG retrieval layer (pgvector in Supabase) with an in-app "search
      knowledge" tool: embeddings via OpenAI/Metis, HNSW cosine similarity,
      and a `/ai/rag-test` inspector page showing the chunks the AI fetched
      (similarity scores + source) before the streamed answer
- [x] Intent-aware RAG: an LLM call classifies the user's question by
      category, then vector search is pre-filtered to that category before
      ranking. Standing business facts and curated Q&A pairs (with their own
      question embeddings) are injected into the system prompt alongside the
      chunks
- [x] RAG retrieval quality: category acts as a soft ranking boost (never a
      hard filter), Q&A similarity threshold lowered to 0.45 for Persian
      paraphrases, the intent call also condenses the message into a clean
      search query that gets embedded, Q&A saves fail loudly when embedding
      fails, and NULL embeddings are backfilled on list
- [x] Dashboard AI-assistance editors: add / edit / delete "things the AI
      should always know about your business" (facts) and Q&A pairs, each with
      a category, surfaced under the on/off toggle
- [x] Support inbox + human handoff: when the AI is unsure it asks the
      customer "do you want me to ask the admin?"; on yes the message goes
      to the owner (and any added admins) in Telegram with inline "پاسخ" /
      "نادیده بگیر" buttons (pending-reply capture via the next plain
      message) or to the website at /dashboard/inbox; owner links their
      personal Telegram via a deep-link magic link; admins CRUD in the
      AI-assistance panel
- [x] Guided signup onboarding with Telegram connection, live bot verification,
      and an animated customer-order demo
- [x] Site-admin console at /dashboard/admin (profiles.is_admin gated):
      businesses list with per-business AI status, monthly + all-time token
      and message usage, editable monthly token/message limits and a
      per-business AI block switch; global AI settings (platform kill
      switch, intent toggle, similarity thresholds, match counts) applied
      by the RAG pipeline; token usage logged per AI call (chat + intent)
      and enforced before every Telegram reply
- [x] Admin usage charts: input/output token and message usage over a week,
      month, or year — platform-wide and per business — plus all-time input /
      output totals, a per-business usage chart, and a global model picker
      that pins which AI model answers customers
- [x] Every new signup starts with 20 AI messages per month; the dashboard
      sidebar shows how many are left (۱۷/۲۰) and a site admin can raise or
      clear the cap per business
- [x] Onboarding asks for the business category (industry) and stores it on
      the profile
- [x] Dashboard overview with real numbers: messages used vs. the monthly
      allowance, a token usage chart (week / month / year), open
      conversations, knowledge and Q&A counts, active flows, and a setup
      checklist that links to whatever is still missing
- [x] Keep unfinished overview setup steps above the dashboard metrics, hide
      completed steps, and let the user dismiss the checklist
- [x] Overview setup steps render immediately, show completed steps with green
      ticks while unfinished work remains, and hide after everything is done
- [x] Production dashboard inbox with searchable status queues, full
      transcripts, Telegram replies, and close actions
- [x] Telegram-gated automation, flow, and menu pages link directly to the
      Settings connections flow
- [x] Settings business information section for editing business name and
      category
- [x] Per-business AI personalization at /dashboard/ai-assistance/persona: the
      assistant knows the business name and category (so introductions are
      specific, not generic), the owner writes a business intro and behaviour
      instructions, and four style dials — warmth, enthusiasm, headings/lists,
      emoji — each set to کمتر / پیش‌فرض / بیشتر
- [x] Leaner AI prompts: retrieval metadata the model cannot act on (similarity
      scores, per-item categories) and verbose section markers dropped, and the
      escalation tool plus its instructions are only sent when the owner has
      human handoff switched on
- [x] AI replies render with formatting in Telegram: the assistant's Markdown
      (bold, italic, bullet lists, links, code, quotes) is converted to
      Telegram's HTML before sending instead of showing raw `**stars**`
- [x] Business-specific introductions: on a greeting or "who are you", the
      assistant introduces itself as the AI support agent of the business, says
      in one line what it does, and invites questions — and bare /start opens
      with the same introduction instead of a generic hello
- [x] Short-term chat memory: while a customer keeps messaging with gaps under
      30 minutes it stays one conversation — the assistant sees the recent
      turns, stops re-introducing itself, and follow-ups like «و برای دو تا؟»
      resolve against the previous question. After a 30-minute silence the next
      message starts a fresh chat with no memory
- [x] Retrieval isolation hardened: the pgvector match functions are
      `security definer`, so they bypass RLS — execute is now granted to the
      service role only. Previously the public anon key could read any
      business's knowledge base by passing its user id
- [x] Retrieval thresholds calibrated for text-embedding-3-small: chunk
      matching raised from 0.2 to 0.35 (question→passage scores lower than the
      question→question Q&A match, which stays at 0.45), so unrelated chunks
      stop being injected into every prompt; business facts capped at 20 items
      / 1200 characters with a warning in the facts editor
- [ ] Bot keyboard menu: a bot-wide set of always-visible buttons at the bottom
      of the Telegram chat, laid out in rows at /dashboard/menu, each button
      wired to an existing flow or prepared reply, plus a per-message control
      in the flow builder to show or hide the menu
- [ ] Conversation inbox (live conversations, handoff to human)
- [ ] Analytics dashboard (response rate, satisfaction, volumes)

## Phase 4 — Growth

- [ ] Billing & plans (activate pricing section)
- [ ] Team members & roles
- [ ] Widget embed for websites
- [ ] Multi-channel: WhatsApp, Instagram
- [ ] Public API

## Backlog (unscoped ideas)

- [ ] Voice support
- [ ] CSAT surveys in chat
