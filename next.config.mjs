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
};

export default nextConfig;
