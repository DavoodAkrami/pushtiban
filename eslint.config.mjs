import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

/**
 * Flat config replacing `.eslintrc.json`. Next.js 16 removed `next lint`, so
 * the ESLint CLI runs directly (`npm run lint`) and `next build` no longer
 * lints. `eslint-config-next` ships native flat config, so its entry points
 * are spread in directly — no `FlatCompat` shim. Rules are unchanged.
 */
const eslintConfig = [
  {
    // Globs must be recursive: a leading `.next/**` only matches the root
    // build, not nested ones (e.g. inside `.claude/worktrees/*`).
    ignores: [
      "**/.next/**",
      "**/node_modules/**",
      "**/out/**",
      "**/build/**",
      ".claude/**",
      "next-env.d.ts",
    ],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    // `react-hooks` v6 (new in eslint-config-next 16) adds two rules that the
    // existing codebase trips broadly. Both flag patterns that are correct
    // here, so they are warnings rather than blockers until addressed:
    //
    // - set-state-in-effect: the `useEffect(() => setMounted(true), [])`
    //   hydration guard used with next-themes, across ~14 components.
    // - refs: the lazy-init store in `src/store/provider.tsx`, which is the
    //   documented Redux Toolkit pattern for the Next.js App Router.
    //
    // Tracked in ROADMAP.md — revisit rather than leaving permanently muted.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
    },
  },
];

export default eslintConfig;
