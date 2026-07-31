import { dirname } from "path";
import { fileURLToPath } from "url";

const projectRoot = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    // Turbopack (default since Next 16) infers the workspace root from the
    // nearest lockfile, which picks up ~/package-lock.json here. Pin it to
    // this directory so file watching and build output stay in the project.
    root: projectRoot,
  },
  // Dashboard IA restructure: the sidebar was flattened and routes were renamed
  // to match it. These keep old bookmarks working. Not permanent while the IA
  // settles — a 308 is cached by browsers far longer than we want to commit to.
  redirects: async () => [
    { source: "/dashboard/menu", destination: "/dashboard/bot/menu", permanent: false },
    // Exact match only: /dashboard/flow/:flowId is still the live flow builder.
    { source: "/dashboard/flow", destination: "/dashboard/automation", permanent: false },
    { source: "/dashboard/ai-assistance", destination: "/dashboard/assistant", permanent: false },
    {
      source: "/dashboard/ai-assistance/persona",
      destination: "/dashboard/assistant/persona",
      permanent: false,
    },
    {
      source: "/dashboard/ai-assistance/facts",
      destination: "/dashboard/knowledge",
      permanent: false,
    },
    {
      source: "/dashboard/ai-assistance/qa",
      destination: "/dashboard/knowledge/qa",
      permanent: false,
    },
  ],
};

export default nextConfig;
