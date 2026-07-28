# Public static assets

Next.js serves every file in this folder from the site root.
For example, `public/brand/logo.svg` is reachable at `/brand/logo.svg`
and can be used as `<img src="/brand/logo.svg" />` or in `next/image`
as `src="/brand/logo.svg"`.

## Layout

- `brand/`   — logo, logo-mark, wordmark (light/dark variants)
- `icons/`   — favicon, apple-touch-icon, android-chrome, site.webmanifest
- `og/`      — Open Graph / Twitter card images (1200×630 recommended)
- `documents/` — downloadable files (PDFs, terms, privacy, brochures)

## Conventions

- Prefer SVG for logos and icons (sharp at any size, themeable via
  `currentColor`).
- Use `next/image` for raster assets so they go through the optimizer;
  raw SVG favicons can be referenced directly.
- Filenames are lowercase, kebab-case — no spaces, no Persian chars.
- Keep this folder for assets consumed by the app itself; per-user
  uploads belong in Supabase Storage, never here.
