import { assert, it } from "@effect/vitest";

import {
  repositoryPathFromRemoteUrl,
  transportSafeSourceControlErrorValue,
} from "./SourceControlProvider.ts";

it("removes URL credentials, query parameters, and fragments from error transport values", () => {
  assert.strictEqual(
    transportSafeSourceControlErrorValue(
      "https://user:secret@example.test/org/repo/pull/42?token=secret#discussion",
    ),
    "https://example.test/org/repo/pull/42",
  );
});

it.each([
  ["git@github.com:nathanbhanji/fab.git", "nathanbhanji/fab"],
  ["github.com:nathanbhanji/fab.git", "nathanbhanji/fab"],
  ["gitlab.com:Fab/platform/fab", "Fab/platform/fab"],
  ["https://github.com/nathanbhanji/fab.git", "nathanbhanji/fab"],
  ["C:/repos/fab", null],
])("reads the repository path of %s", (remoteUrl, expected) => {
  assert.strictEqual(repositoryPathFromRemoteUrl(remoteUrl), expected);
});
