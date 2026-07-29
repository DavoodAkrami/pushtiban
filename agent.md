# agent.md

> Mirror of **CLAUDE.md** for non-Claude agent tools. The two files must stay
> byte-identical below this note — edit CLAUDE.md, then copy it over.

پشتیبان — Persian RTL AI customer-support SaaS. Next.js 16 (App Router) +
React 19 + TypeScript + Tailwind + Framer Motion. Dark theme is the default.
Full conventions: **CONTRIBUTING.md**. Live component gallery: **`/design`**.

## Rules for agents working in this repo

1. **Use the frontend-design skill** for all frontend design and coding work:
    use fronend-design skill in ./agents/skills/frontend-design or if you didn't find it use:
   https://github.com/anthropics/claude-code/blob/main/plugins/frontend-design/skills/frontend-design/SKILL.md
   Fetch and follow it before designing or building UI.

2. **Notion (app.notion.com) is the design benchmark.** Before implementing
   any new design, check how Notion solves the same problem and match that
   level of calm and polish: quiet surfaces, generous whitespace, soft
   borders, one accent blue used only for CTAs/links/active states.

3. **Reuse existing components as much as possible.** The library is in
   `src/components/ui/` and showcased at `/design`. If no existing component
   fits what you need, **ask the user for permission before creating a new
   one** — don't silently add new components. New components go in
   `src/components/ui/` and must be added to the `/design` page.

4. **Use Framer Motion for all animations**, and build on the libraries
   already in the project — Radix UI primitives, CVA variants, Lucide icons,
   `next-themes`, the `Reveal`/`Stagger`/`WordReveal`/`Parallax` motion
   primitives. Do not hand-code designs, animations, or widget behavior that
   these libraries already provide (no CSS keyframe choreography, no GSAP, no
   custom focus traps or dropdown logic from scratch).

5. **Use Supabase for any database work.** All persistence goes through
   Supabase (`@supabase/supabase-js` / `@supabase/ssr`). Use the shared
   helpers — `src/lib/supabase/client.ts` in client components and
   `src/lib/supabase/server.ts` in server components / route handlers /
   server actions. Never introduce another database, ORM, or ad-hoc storage.

6. **Redux Toolkit is for server-side state only.** The store at
   `src/store/` (slices in `src/store/slices/`) holds data that comes from
   the server — session/profile, Supabase rows, fetched resources. **UI
   state (open/closed, hover, form fields, steps, toggles) never goes in
   Redux — use plain React `useState`/`useReducer`.** Use the typed hooks
   from `src/store/hooks.ts` (`useAppSelector`/`useAppDispatch`) — never raw
   `useSelector`/`useDispatch`, and no other state library (Zustand, Jotai,
   plain Context stores).

7. **Keep `ROADMAP.md` current.** It is the product source of truth: add a
   feature there before building it, and tick it (`- [x]`) once it ships and
   is verified. Never delete shipped items.

8. **Schema changes go in `supabase/*.sql`.** Whenever you need anything
   added or changed in Supabase (tables, columns, triggers, RLS policies,
   functions), write the SQL into a file in the `supabase/` folder (e.g.
   `supabase/auth.sql`) — idempotent so it can be re-run safely — and then
   **ask the user in chat to paste/run it in the Supabase SQL Editor**.
   Never assume the schema exists until the user confirms they ran it.

9. **Code comments and documentation are English-only.** Persian is
   exclusively the language of the app's UI (user-facing copy). All code
   comments, docstrings, SQL comments, commit messages, and docs are written
   in English.

10. **Use arrow functions, not `function` declarations.** Components,
    handlers, hooks, utilities — write them as `const name = () => {}`.
    Existing `function` code is migrated opportunistically when a file is
    touched; new code is always arrow-style.

## Quick facts

- All UI text is Persian; digits via `fa()` from `src/lib/utils.ts`; layout
  is `dir="rtl"` — use logical properties (`ms-`/`me-`/`ps-`/`pe-`/`start`/`end`).
- Colors only via tokens (`bg-background`, `bg-surface`, `bg-card`,
  `text-muted`, `bg-accent`, `border-line`, `success`/`danger`/`warning`) —
  never hard-coded hex.
- Buttons `rounded-full`, cards `rounded-3xl`, inputs `rounded-2xl`.
- Every animated component must honor `useReducedMotion()`.
- Verify with `npm run build` + `npm run lint`, in both themes, before done.
  `next build` no longer lints on its own — run both.
- Next 16 request APIs are async: `await cookies()`, `await params`,
  `await searchParams`. The server Supabase helper is `await createClient()`;
  the browser helper in `src/lib/supabase/client.ts` stays synchronous.
- Route-level auth lives in `src/proxy.ts` (Next 16 renamed `middleware`);
  it runs on the Node.js runtime.
- If `next dev` throws `MODULE_NOT_FOUND` for a file that plainly exists (e.g.
  `@xyflow/react/dist/style.css`), the Turbopack cache in `.next/dev` is stale
  — `rm -rf .next` and restart. Turbopack is the default builder in Next 16,
  so this is the first thing to try on an inexplicable dev-only failure.
