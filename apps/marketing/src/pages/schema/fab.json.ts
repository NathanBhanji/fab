import type { APIRoute } from "astro";

import { buildFabProjectFileJsonSchema } from "@fab/shared/fabProjectFile";

export const GET: APIRoute = () =>
  new Response(`${JSON.stringify(buildFabProjectFileJsonSchema(), null, 2)}\n`, {
    headers: { "Content-Type": "application/json" },
  });
