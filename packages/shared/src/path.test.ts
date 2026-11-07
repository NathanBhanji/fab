import { describe, expect, it } from "vite-plus/test";
import {
  workspaceRelativeFilePath,
  newProjectFolderName,
  resolvePastedPath,
  resolveWorkspaceFilePath,
} from "./path.ts";

describe("path helpers", () => {
  // regression: #17923 literal colons in names are kept, not parsed as positions
  it.each([
    ["report:123", "/workspace", "/workspace/report:123"],
    ["~/report:123", "/workspace", "~/report:123"],
  ])("resolves literal path %s within %s", (path, root, expected) => {
    expect(resolveWorkspaceFilePath(path, root)).toBe(expected);
  });

  it("names a new project's folder from any typed name", () => {
    expect(newProjectFolderName("Pinball Stats")).toBe("pinball-stats");
    expect(newProjectFolderName("  Café & Crème!  ")).toBe("cafe-creme");
    expect(newProjectFolderName("../../etc")).toBe("etc");
    expect(newProjectFolderName("🎱🎱")).toBe("project");
    expect(newProjectFolderName(`${"a".repeat(63)} b`)).toBe("a".repeat(63));
  });
});

describe("resolvePastedPath", () => {
  it.each([
    ["Finder, a space", "", "'/Users/me/Monarch Money'", "/Users/me/Monarch Money"],
    ["Finder, an apostrophe", "", "/Users/me/Bob\\'s\\ Stuff", "/Users/me/Bob's Stuff"],
    ["Finder, a backslash", "", "/Users/me/a\\\\\\ b", "/Users/me/a\\ b"],
    [
      "Finder, apostrophes around a name",
      "",
      "/Users/me/\\'My\\ Folder\\'",
      "/Users/me/'My Folder'",
    ],
    ["an apostrophe in double quotes", "", '"/Users/me/Bob\'s Stuff"', "/Users/me/Bob's Stuff"],
    ["a shell, home-relative", "", "~/Bob\\'s\\ Stuff", "~/Bob's Stuff"],
    ["surrounding whitespace", "", "  '/Users/me/My Code'\n", "/Users/me/My Code"],
    ["over a selection", "/Users/me/old", "'/Users/me/My Code'", "/Users/me/My Code"],
    ["after a prefilled folder", "~/", "~/'/Users/me/My Code'", "/Users/me/My Code"],
    ["plain, after a prefilled folder", "~/", "~//Users/me/code", "/Users/me/code"],
    ["a shell's quoted apostrophe", "", "'/Users/me/Bob'\\''s Work'", "/Users/me/Bob's Work"],
    ["after a clone destination", "~/code/repo", "~/code/repo'/a b'", "/a b"],
    ["over part of the box", "~/code/old", "~/code/'/a b'", "/a b"],
  ])("reads the path copied from %s", (_source, previous, next, expected) => {
    expect(resolvePastedPath(previous, next)).toBe(expected);
  });

  it.each([
    ["typing a separator", "/Users/me", "/Users/me/"],
    ["typing a separator after a folder", "~/", "~//"],
    ["typing a trailing space", "/Users/My", "/Users/My "],
    ["deleting", "/Users/me/", "/Users/me"],
    ["pasting a relative folder", "~/", "~/Documents/code"],
    ["a longer path over a selection", "/Users/me", "/Users/me/code"],
    ["a longer path after a folder", "/Users/me/", "/Users/me/code"],
    ["quoted text that is no path", "", "'hello world'"],
    ["a quoted relative path", "", "'code/my app'"],
    ["a search ending in a quoted path", "", "find '/tmp/repo'"],
    ["a quote left open", "", "'/Users/me/My Code"],
    ["a quote inside the quotes", "", "'/Users/me/it's here'"],
    ["a Windows dot folder below home", "", "~/code\\.vscode"],
    ["a backslash before a letter", "", "/Users/me/a\\b"],
  ])("keeps %s", (_case, previous, next) => {
    expect(resolvePastedPath(previous, next)).toBe(next);
  });

  it.each(["/Users/me/a\\ b", "~/code\\.vscode", "'/Users/me/My Code'"])(
    "leaves %s typed one character at a time",
    (typed) => {
      const box = [...typed].reduce((text, char) => resolvePastedPath(text, text + char), "");
      expect(box).toBe(typed);
    },
  );
});

describe("workspaceRelativeFilePath", () => {
  // regression: #9309 paths compare case-sensitively
  it.each([
    ["/Repo/Project/src/main.ts", "/repo/project", null],
    ["/repo/project-two/a.ts", "/repo/project", null],
    // regression: #16354 a `..` that leaves the root is a host path, not a workspace path
    ["/repo/project/../other/notes.md", "/repo/project", null],
    ["/repo/project/docs/a/../b.md", "/repo/project", "docs/a/../b.md"],
    ["/repo/a\\b.txt", "/repo", "a\\b.txt"],
    ["/repo/a/b.txt", "/repo", "a/b.txt"],
    ["/repo/a\\", "/repo", "a\\"],
    ["/repo/..\\notes.md", "/repo", "..\\notes.md"],
    ["/repo/a\\/../../notes.md", "/repo", null],
    ["/repo\\project/a.txt", "/repo\\project/", "a.txt"],
    ["/repo/project/a.txt", "/repo\\project", null],
    ["/repo\\project/a.txt", "/repo/project", null],
    ["//server/share/a\\b.txt", "//server/share", "a\\b.txt"],
  ])("relates %s to %s", (path, workspaceRoot, relativePath) => {
    expect(workspaceRelativeFilePath(path, workspaceRoot)).toBe(relativePath);
  });
});
