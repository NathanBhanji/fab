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
      "FAB_DEV_AUTH_TOKEN=root\nFAB_ROOT_ONLY=root\n",
    );
    NodeFS.writeFileSync(NodePath.join(repoRoot, ".env.local"), "FAB_DEV_AUTH_TOKEN=local\n");

    expect(loadRepoEnv({ baseEnv: {}, repoRoot })).toMatchObject({
      FAB_DEV_AUTH_TOKEN: "local",
      FAB_ROOT_ONLY: "root",
    });
    expect(
      loadRepoEnv({ baseEnv: { FAB_DEV_AUTH_TOKEN: "ci" }, repoRoot }).FAB_DEV_AUTH_TOKEN,
    ).toBe("ci");
  });
});

function makeTemporaryDirectory() {
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "fab-public-config-"));
  temporaryDirectories.push(directory);
  return directory;
}
