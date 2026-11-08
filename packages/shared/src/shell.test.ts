// @effect-diagnostics nodeBuiltinImport:off -- The synchronous shell probe runs real commands with isolated config files.
import * as NodeServices from "@effect/platform-node/NodeServices";
import { it as effectIt } from "@effect/vitest";
import * as HostProcess from "@fab/shared/HostProcess";
import { DesktopHostTelemetryMessage } from "@fab/contracts";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  applyShellEnvironment,
  CommandResolutionCache,
  isCommandAvailable,
  listLoginShellCandidates,
  mergePathEntries,
  readEnvironmentFromLoginShell,
  resolveCommandPath,
  resolveSpawnCommand,
  SpawnExecutableResolution,
  withPathDirectoryListings,
  XcodeGitLocation,
} from "./shell.ts";

const decodeDesktopHostMessage = Schema.decodeUnknownSync(DesktopHostTelemetryMessage);

describe("readEnvironmentFromLoginShell", () => {
  // Opt in with an explicit binary, like the provider live probes; CI need not install Nu.
  it.runIf(process.env.FAB_TEST_NU_PATH !== undefined)(
    "captures Nushell PATH and multiline values without external tools",
    () => {
      const shell = process.env.FAB_TEST_NU_PATH!;
      const home = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "fab-nu-env-"));
      try {
        const toolPath = NodePath.join(home, "nu tools", "bin");
        const extraToolPath = NodePath.join(home, "extra-tools", "bin");
        NodeFS.mkdirSync(toolPath, { recursive: true });
        NodeFS.mkdirSync(extraToolPath, { recursive: true });
        const config = NodePath.join(home, "config.nu");
        const envConfig = NodePath.join(home, "env.nu");
        NodeFS.writeFileSync(envConfig, "");
        NodeFS.writeFileSync(
          config,
          [
            `$env.PATH = [${JSON.stringify(toolPath)}, "~/extra-tools/bin", "rel/dir", ""]`,
            '$env.CUSTOM_VAR = "  first\\nsecond  "',
            '$env.EMPTY_VAR = ""',
            'print "startup noise"',
          ].join("\n"),
        );

        expect(
          readEnvironmentFromLoginShell(
            shell,
            ["MISSING_VAR", "PATH", "EMPTY_VAR", "CUSTOM_VAR"],
            (file, args, options) =>
              NodeChildProcess.execFileSync(
                file,
                ["--no-history", "--config", config, "--env-config", envConfig, ...args],
                {
                  ...options,
                  env: { HOME: home, XDG_CONFIG_HOME: home, PATH: toolPath },
                },
              ),
          ),
        ).toEqual({
          PATH: `${toolPath}:${extraToolPath}:rel/dir:`,
          CUSTOM_VAR: "  first\nsecond  ",
        });
      } finally {
        NodeFS.rmSync(home, { recursive: true, force: true });
      }
    },
  );

  it("extracts multiple environment variables from a login shell command", () => {
    const execFile = vi.fn<
      (
        file: string,
        args: ReadonlyArray<string>,
        options: { encoding: "utf8"; timeout: number },
      ) => string
    >(() =>
      [
        "__FAB_ENV_PATH_START__",
        "/a:/b",
        "__FAB_ENV_PATH_END__",
        "__FAB_ENV_SSH_AUTH_SOCK_START__",
        "/tmp/secretive.sock",
        "__FAB_ENV_SSH_AUTH_SOCK_END__",
      ].join("\n"),
    );

    expect(readEnvironmentFromLoginShell("/bin/zsh", ["PATH", "SSH_AUTH_SOCK"], execFile)).toEqual({
      PATH: "/a:/b",
      SSH_AUTH_SOCK: "/tmp/secretive.sock",
    });
    expect(execFile).toHaveBeenCalledTimes(1);
    expect(execFile).toHaveBeenCalledWith("/bin/zsh", expect.any(Array), {
      encoding: "utf8",
      timeout: 5000,
      killSignal: "SIGKILL",
      detached: true,
      stdio: ["ignore", "pipe", "ignore"],
    });
  });

  it("omits environment variables that are missing or empty", () => {
    const execFile = vi.fn<
      (
        file: string,
        args: ReadonlyArray<string>,
        options: { encoding: "utf8"; timeout: number },
      ) => string
    >(() =>
      [
        "__FAB_ENV_PATH_START__",
        "/a:/b",
        "__FAB_ENV_PATH_END__",
        "__FAB_ENV_SSH_AUTH_SOCK_START__",
        "__FAB_ENV_SSH_AUTH_SOCK_END__",
      ].join("\n"),
    );

    expect(readEnvironmentFromLoginShell("/bin/zsh", ["PATH", "SSH_AUTH_SOCK"], execFile)).toEqual({
      PATH: "/a:/b",
    });
  });

  it("preserves multiline values and surrounding whitespace", () => {
    const execFile = vi.fn<
      (
        file: string,
        args: ReadonlyArray<string>,
        options: { encoding: "utf8"; timeout: number },
      ) => string
    >(() =>
      ["__FAB_ENV_CUSTOM_VAR_START__", "  first\nsecond  ", "__FAB_ENV_CUSTOM_VAR_END__"].join(
        "\n",
      ),
    );

    expect(readEnvironmentFromLoginShell("/bin/zsh", ["CUSTOM_VAR"], execFile)).toEqual({
      CUSTOM_VAR: "  first\nsecond  ",
    });
  });
});

describe("listLoginShellCandidates", () => {
  it("returns env shell, user shell, then the platform fallback without duplicates", () => {
    expect(listLoginShellCandidates("darwin", " /opt/homebrew/bin/nu ", "/bin/zsh")).toEqual([
      "/opt/homebrew/bin/nu",
      "/bin/zsh",
    ]);
  });
});

describe("mergePathEntries", () => {
  it("prefers login-shell PATH entries and keeps inherited extras", () => {
    expect(
      mergePathEntries("/opt/homebrew/bin:/usr/bin", "/Users/test/.local/bin:/usr/bin", "darwin"),
    ).toBe("/opt/homebrew/bin:/usr/bin:/Users/test/.local/bin");
  });
});

effectIt.layer(NodeServices.layer)("resolveCommandPath", (it) => {
  it.effect("probes only listed PATH names and relists a directory that changes", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const first = yield* fs.makeTempDirectoryScoped();
      const second = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(path.join(first, "cursor"), "");
      yield* fs.chmod(path.join(first, "cursor"), 0o755);
      yield* fs.writeFileString(path.join(second, "cursor"), "");
      yield* fs.chmod(path.join(second, "cursor"), 0o755);
      const env = { PATH: `${first}:${second}` };
      const probed: Array<string> = [];
      yield* Effect.gen(function* () {
        expect(yield* resolveCommandPath("cursor", { env })).toBe(path.join(first, "cursor"));
        expect(yield* isCommandAvailable("absent", { env })).toBe(false);
        yield* fs.writeFileString(path.join(second, "late"), "");
        yield* fs.chmod(path.join(second, "late"), 0o755);
        yield* fs.utimes(second, 4_102_444_800, 4_102_444_800);
        expect(yield* resolveCommandPath("late", { env })).toBe(path.join(second, "late"));
      }).pipe(
        withPathDirectoryListings,
        Effect.provideService(FileSystem.FileSystem, {
          ...fs,
          stat: (file) => {
            if (file !== first && file !== second) probed.push(file);
            return fs.stat(file);
          },
        }),
      );
      expect(probed).toEqual([path.join(first, "cursor"), path.join(second, "late")]);
    }).pipe(
      Effect.provideService(HostProcess.Platform, "linux"),
      Effect.provideService(CommandResolutionCache, new Map()),
    ),
  );
});

effectIt.layer(NodeServices.layer)("resolveSpawnCommand", (it) => {
  it.effect("resolves against the effective environment when extending host env", () =>
    Effect.gen(function* () {
      let resolvedEnvironment: NodeJS.ProcessEnv | undefined;
      yield* resolveSpawnCommand("git", ["status"], {
        env: { GIT_DIR: "/repo/.git" },
        extendEnv: true,
      }).pipe(
        Effect.provideService(HostProcess.Platform, "darwin"),
        Effect.provideService(CommandResolutionCache, new Map()),
        Effect.provideService(HostProcess.Environment, { PATH: "/opt/homebrew/bin" }),
        Effect.provideService(SpawnExecutableResolution, (_command, _platform, env) => {
          resolvedEnvironment = env;
          return "/opt/homebrew/bin/git";
        }),
      );

      expect(resolvedEnvironment).toEqual({ PATH: "/opt/homebrew/bin", GIT_DIR: "/repo/.git" });
    }),
  );

  describe("macOS git", () => {
    // Files that exist, the git first on PATH, and what `xcrun --find git` prints.
    const setup = (options: {
      readonly platform?: NodeJS.Platform;
      readonly gitOnPath: string;
      readonly xcrunGit: string | undefined;
    }) => {
      const files = new Set([options.gitOnPath, ...(options.xcrunGit ? [options.xcrunGit] : [])]);
      const host = { xcrunGit: options.xcrunGit, xcrunCalls: 0 };
      const resolve = resolveSpawnCommand("git", ["status"], { env: { PATH: "/fake/bin" } }).pipe(
        Effect.map((resolved) => resolved.command),
        Effect.provideService(HostProcess.Platform, options.platform ?? "darwin"),
        Effect.provideService(SpawnExecutableResolution, (command) =>
          command === "git" ? options.gitOnPath : files.has(command) ? command : undefined,
        ),
        Effect.provideService(XcodeGitLocation, () => {
          host.xcrunCalls += 1;
          return host.xcrunGit;
        }),
      );
      return { files, host, resolve };
    };

    const XCODE_GIT = "/Applications/Xcode.app/Contents/Developer/usr/bin/git";

    it.effect("runs the git behind the xcrun shim and looks it up once", () =>
      Effect.gen(function* () {
        const { host, resolve } = setup({ gitOnPath: "/usr/bin/git", xcrunGit: XCODE_GIT });
        expect(yield* resolve).toBe(XCODE_GIT);
        expect(yield* resolve).toBe(XCODE_GIT);
        expect(host.xcrunCalls).toBe(1);
      }).pipe(Effect.provideService(CommandResolutionCache, new Map())),
    );

    it.effect("keeps git when PATH has another git or the host is not macOS", () =>
      Effect.gen(function* () {
        const homebrew = setup({ gitOnPath: "/opt/homebrew/bin/git", xcrunGit: XCODE_GIT });
        expect(yield* homebrew.resolve).toBe("git");
        expect(homebrew.host.xcrunCalls).toBe(0);

        const linux = setup({ platform: "linux", gitOnPath: "/usr/bin/git", xcrunGit: XCODE_GIT });
        expect(yield* linux.resolve).toBe("git");
      }).pipe(Effect.provideService(CommandResolutionCache, new Map())),
    );

    it.effect("keeps git when xcrun fails or names a missing file", () =>
      Effect.gen(function* () {
        const failed = setup({ gitOnPath: "/usr/bin/git", xcrunGit: undefined });
        expect(yield* failed.resolve).toBe("git");

        const missing = setup({ gitOnPath: "/usr/bin/git", xcrunGit: XCODE_GIT });
        missing.files.delete(XCODE_GIT);
        expect(yield* missing.resolve).toBe("git");
      }).pipe(Effect.provideService(CommandResolutionCache, new Map())),
    );

    it.effect("looks again when the resolved git disappears", () =>
      Effect.gen(function* () {
        const betaGit = "/Applications/Xcode-beta.app/Contents/Developer/usr/bin/git";
        const { files, host, resolve } = setup({ gitOnPath: "/usr/bin/git", xcrunGit: XCODE_GIT });
        expect(yield* resolve).toBe(XCODE_GIT);

        files.delete(XCODE_GIT);
        files.add(betaGit);
        host.xcrunGit = betaGit;
        expect(yield* resolve).toBe(betaGit);
        expect(host.xcrunCalls).toBe(2);
      }).pipe(Effect.provideService(CommandResolutionCache, new Map())),
    );
  });
});

describe("desktop shell environment updates", () => {
  it.each(["linux", "darwin"] as const)(
    "applies shell updates with %s PATH semantics",
    (platform) => {
      const message = decodeDesktopHostMessage({
        version: 1,
        type: "shellEnvironment",
        discovered: true,
        platform,
        environment: {
          PATH: "/fresh/bin",
          FNM_DIR: null,
          __MISE_DIFF: null,
          SSH_AUTH_SOCK: "/current.sock",
          NODE_OPTIONS: "--bad",
        },
      });
      expect(message.type).toBe("shellEnvironment");
      if (message.type !== "shellEnvironment") throw new Error("Expected shell environment update");
      const env: NodeJS.ProcessEnv = {
        Path: "/stale/bin",
        FNM_DIR: "stale",
        __MISE_DIFF: "stale",
        UNRELATED: "keep",
      };
      applyShellEnvironment(env, message.environment, platform);
      expect(env).toEqual({
        PATH: "/fresh/bin",
        Path: "/stale/bin",
        SSH_AUTH_SOCK: "/current.sock",
        UNRELATED: "keep",
      });
      env.Path = "/stale/bin";
      env.path = "/other/bin";
      applyShellEnvironment(env, { PATH: null, SSH_AUTH_SOCK: null }, platform);
      expect(env).toEqual({
        Path: "/stale/bin",
        path: "/other/bin",
        UNRELATED: "keep",
      });
    },
  );
});
