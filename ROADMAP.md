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
- [ ] AI assistant on/off control with Telegram fallback after flows and
      prepared messages
- [ ] Chat playground for testing the assistant against the knowledge base
- [x] Guided signup onboarding with Telegram connection, live bot verification,
      and an animated customer-order demo
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
