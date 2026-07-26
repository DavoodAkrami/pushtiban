# راهنمای توسعه — Contributing Guide

This document is for anyone writing code in this project. Read it before
adding features or components. (Codebase is English; product copy is Persian.)

## Stack

| Layer      | Choice                                              |
| ---------- | --------------------------------------------------- |
| Framework  | Next.js 14 (App Router) + TypeScript, static-first  |
| Styling    | Tailwind CSS, token-driven via CSS variables        |
| Animation  | **Framer Motion** (the only animation library used) |
| Primitives | Radix UI (`@radix-ui/react-dialog`, `-accordion`)   |
| Variants   | `class-variance-authority` (CVA)                    |
| Icons      | Lucide (`lucide-react`), via the `Icon` component   |
| Charts     | Recharts, via the `Chart` component only            |
| Theming    | `next-themes`, class strategy, **dark is default**  |
| Font       | Vazirmatn variable, self-hosted (`next/font/local`) |
| State      | **Redux Toolkit** (`@reduxjs/toolkit` + `react-redux`) |
| Database   | **Supabase** (`@supabase/supabase-js` + `@supabase/ssr`) |
| AI models  | `openai`, `@anthropic-ai/sdk`, `@google/genai`      |

Run: `npm run dev` · Build: `npm run build` · Lint: `npm run lint`

## Data layer

- **Database = Supabase, always.** No other database, ORM, or ad-hoc
  persistence. Use the shared helpers instead of constructing clients
  inline: `src/lib/supabase/client.ts` (client components) and
  `src/lib/supabase/server.ts` (server components, route handlers, server
  actions). Secrets live in `.env.local` — copy `.env.example` to start.
  `SUPABASE_SERVICE_ROLE_KEY` is server-only; never expose it with a
  `NEXT_PUBLIC_` prefix.
- **Server state = Redux Toolkit; UI state = React.** The store in
  `src/store/` holds **server-side state only** (session/profile, Supabase
  rows, fetched resources) — e.g. the `session` slice synced by
  `useSessionProfile()` from `src/store/use-session.ts`. UI state
  (open/closed, hover, form fields, wizard steps) stays in plain
  `useState`/`useReducer` — never in Redux. Always use the typed hooks from
  `src/store/hooks.ts` (`useAppSelector`, `useAppDispatch`) — never raw
  `useSelector`/`useDispatch` — and don't add another state library.

## Design language

The benchmark is **Notion (app.notion.com)**: calm surfaces, generous
whitespace, restrained color, soft borders. Before designing anything new,
look at how Notion solves it.

### Tokens — never hard-code colors

All colors live in `src/app/globals.css` as RGB triplets and map to Tailwind
classes in `tailwind.config.ts`:

| Token        | Dark value | Tailwind usage                        |
| ------------ | ---------- | ------------------------------------- |
| `background` | `#191919`  | `bg-background`                       |
| `surface`    | `#202020`  | `bg-surface` — secondary surfaces     |
| `card`       | `#2F2F2F`  | `bg-card` — cards, menus, popovers    |
| `foreground` | `#FFFFFF`  | `text-foreground`                     |
| `muted`      | 65% white  | `text-muted` — secondary text         |
| `accent`     | `#4F8CFF`  | `bg-accent` — **CTAs, links, active states only** |
| `success` / `danger` / `warning` | see globals.css | status colors |
| `line`       | 5% white   | `border-line` — all borders           |

Alpha composition works everywhere: `bg-accent/15`, `text-danger/80`, etc.
Light theme redefines the same variables — write theme-agnostic classes and
both themes work automatically.

### Radius & elevation

- Cards / popovers: `rounded-2xl`–`rounded-3xl` · Buttons: `rounded-full` ·
  Inputs: `rounded-2xl`
- Shadows: `shadow-soft` (resting), `shadow-lift` (floating), `shadow-glow`
  (accent emphasis — sparingly)
- Glass (`.glass`, `.glass-strong` utilities): only where it earns its place —
  header, floating cards, modals. Menus and dropdowns are **solid** (`bg-card`)
  for readability.

### RTL

The whole app is `dir="rtl"`. Use logical properties (`ms-`/`me-`, `ps-`/`pe-`,
`start`/`end`) — never `ml-`/`mr-` unless the position must be physical
(e.g. the switch knob, toast corner).

### Persian copy

All user-facing text is Persian. Convert digits with `fa()` from
`src/lib/utils.ts`. Write copy like it's part of the design: active voice,
plain verbs, buttons say exactly what they do, errors say what went wrong
*and* how to fix it.

## Component library

Everything lives in `src/components/ui/` and is showcased at **`/design`** —
open that page to see every component, variant, and state live.

| Component | File | Notes |
| --- | --- | --- |
| `Button` | `button.tsx` | 7 variants, 5 sizes, `loading`, `startIcon`/`endIcon` |
| `Input`, `Textarea` | `input.tsx`, `textarea.tsx` | label/hint/error/success, icons, char counter |
| `Select` | `select.tsx` | combobox with icons, descriptions, `searchable` |
| `Modal` | `modal.tsx` | Radix Dialog + Framer Motion, 4 sizes |
| `ToastProvider` / `useToast` | `toast.tsx` | top-right notifications, 5 variants, actions |
| `Alert` | `alert.tsx` | inline persistent messages |
| `Tooltip` | `tooltip.tsx` | 4 sides, hover + focus |
| `Skeleton`, `SkeletonText`, `SkeletonCard`, `SkeletonBlock` | `skeleton.tsx` | loading placeholders |
| `Badge`, `Checkbox`, `Switch`, `Spinner`, `Icon` | — | atoms |
| `Chart` | `chart.tsx` | Recharts area/bar, token colors, stacked, Persian values |
| `GlassCard` | `glass-card.tsx` | hover lift + cursor sheen |
| `Section`, `SectionHeading` | `section.tsx` | landing-page layout |
| `Reveal`, `Stagger`, `WordReveal`, `Parallax` | `../motion/` | scroll/entrance motion |

**Rules of use:**

1. **Always reach for an existing component first.** Check `/design` and
   `src/components/ui/` before writing new UI.
2. If nothing fits, **ask before creating a new component** — then build it in
   `src/components/ui/`, following the token/radius/motion conventions, and
   add it to the `/design` page.
3. Never fork a component's styles inline; extend it with a variant instead.

## Animation

- **Framer Motion only.** No GSAP, no CSS keyframe choreography for new work,
  no hand-rolled rAF loops.
- Signature easing: `luxe` (`cubic-bezier(0.22, 1, 0.36, 1)`), exported from
  `src/components/motion/reveal.tsx`. Springs: `stiffness ~500, damping ~30`
  for micro-interactions.
- Motion is slow and calm — nothing snappy or bouncy. One orchestrated moment
  beats scattered effects.
- **Every animated component must respect `useReducedMotion()`** (and the
  global CSS fallback covers the rest).
- Scroll reveals: use the existing `Reveal` / `Stagger` / `WordReveal`
  primitives — don't reinvent them.

## Accessibility floor

Non-negotiable on every PR: semantic HTML, visible `focus-visible` rings,
keyboard operability (arrows/Enter/Esc where applicable), `aria-*` on custom
widgets, WCAG-AA contrast, reduced-motion support.

## Checklist before you ship

- [ ] `npm run build` and `npm run lint` pass
- [ ] Verified in **dark and light**, desktop and ~390px mobile
- [ ] RTL layout correct (no physical left/right leaks)
- [ ] Persian copy with Persian digits (`fa()`)
- [ ] Reused existing components; new ones added to `/design`
