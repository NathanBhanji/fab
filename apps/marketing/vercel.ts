import type { VercelConfig } from "@vercel/config/v1";

export const config: VercelConfig = {
  git: {
    deploymentEnabled: false,
  },
  installCommand: "npm install -g vite-plus && vp install --filter '@fab/marketing...'",
  buildCommand: "vp run --filter @fab/marketing build",
  outputDirectory: "dist",
  // curl | sh requires a plain, uncompressed script with no cache across deploys.
  headers: [
    {
      source: "/install.sh",
      headers: [
        { key: "Content-Type", value: "text/x-shellscript; charset=utf-8" },
        { key: "Cache-Control", value: "public, max-age=300" },
      ],
    },
  ],
  redirects: [
    {
      source: "/app",
      destination: "https://app.fab.invalid",
      permanent: true,
    },
  ],
};
