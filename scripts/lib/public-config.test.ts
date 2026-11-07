// @effect-diagnostics nodeBuiltinImport:off - Tests exercise root env file precedence directly.
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { loadRepoEnv } from "./public-config.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
});

describe("loadRepoEnv", () => {
  it("applies process, root local, and root precedence in that order", () => {
    const repoRoot = makeTemporaryDirectory();
    NodeFS.writeFileSync(
      NodePath.join(repoRoot, ".env"),
      "FAB_CLERK_PUBLISHABLE_KEY=pk_root\nFAB_CLERK_JWT_TEMPLATE=template_root\nFAB_CLERK_CLI_OAUTH_CLIENT_ID=oauth_root\nFAB_RELAY_URL=https://root.example.test\n",
    );
    NodeFS.writeFileSync(
      NodePath.join(repoRoot, ".env.local"),
      "FAB_CLERK_PUBLISHABLE_KEY=pk_local\nFAB_CLERK_JWT_TEMPLATE=template_local\nFAB_CLERK_CLI_OAUTH_CLIENT_ID=oauth_local\nFAB_RELAY_URL=https://local.example.test\n",
    );

    expect(loadRepoEnv({ baseEnv: {}, repoRoot }).FAB_RELAY_URL).toBe("https://local.example.test");
    expect(
      loadRepoEnv({
        baseEnv: {
          FAB_CLERK_PUBLISHABLE_KEY: "pk_ci",
          FAB_CLERK_JWT_TEMPLATE: "template_ci",
          FAB_CLERK_CLI_OAUTH_CLIENT_ID: "oauth_ci",
          FAB_RELAY_URL: "https://ci.example.test",
        },
        repoRoot,
      }),
    ).toMatchObject({
      FAB_CLERK_PUBLISHABLE_KEY: "pk_ci",
      FAB_CLERK_CLI_OAUTH_CLIENT_ID: "oauth_ci",
      VITE_CLERK_PUBLISHABLE_KEY: "pk_ci",
      EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_ci",
      FAB_CLERK_JWT_TEMPLATE: "template_ci",
      VITE_CLERK_JWT_TEMPLATE: "template_ci",
      EXPO_PUBLIC_CLERK_JWT_TEMPLATE: "template_ci",
      FAB_RELAY_URL: "https://ci.example.test",
      VITE_FAB_RELAY_URL: "https://ci.example.test",
    });
  });
});

function makeTemporaryDirectory() {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "fab-public-config-"));
  temporaryDirectories.push(directory);
  return directory;
}
