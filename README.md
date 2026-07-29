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

## Notes

- **Dark mode is the default**; toggle in the header (next-themes, no flash).
- **Reduced motion** is respected globally (CSS media query + `useReducedMotion`
  in every animated component).
- All copy is Persian with Persian numerals; layout is `dir="rtl"` end to end.
