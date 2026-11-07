// @effect-diagnostics nodeBuiltinImport:off -- The synchronous shell probe runs real commands with isolated config files.
import * as NodeServices from "@effect/platform-node/NodeServices";
import { it as effectIt } from "@effect/vitest";
import * as HostProcess from "@fab/shared/HostProcess";
import { DesktopHostTelemetryMessage } from "@fab/contracts";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  applyShellEnvironment,
  CommandAvailability,
  CommandResolutionCache,
  type CommandAvailabilityChecker,
  isCommandAvailable,
  listLoginShellCandidates,
  mergePathEntries,
  mergePathValues,
  readEnvironmentFromLoginShell,
  readEnvironmentFromWindowsShell,
  resolveCommandPath,
  resolveSpawnCommand,
  resolveWindowsEnvironment,
  SpawnExecutableResolution,
  WindowsShellEnvironment,
  withPathDirectoryListings,
  type WindowsShellEnvironmentReader,
  XcodeGitLocation,
} from "./shell.ts";

const decodeDesktopHostMessage = Schema.decodeUnknownSync(DesktopHostTelemetryMessage);

const nativeProbe = vi.hoisted(() => ({
  execFile: vi.fn<typeof import("node:child_process").execFile>(),
  original: undefined as unknown as typeof import("node:child_process").execFile,
}));

vi.mock("node:child_process", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:child_process")>();
  nativeProbe.original = original.execFile;
  return { ...original, execFile: nativeProbe.execFile.mockImplementation(original.execFile) };
});

const withWindowsEnvironmentMocks = <A, E, R>(
  effect: Effect.Effect<A, E, R>,
  readEnvironment: (
    ...args: Parameters<WindowsShellEnvironmentReader>
  ) => Partial<Record<string, string>>,
  commandAvailable: CommandAvailabilityChecker,
) =>
  effect.pipe(
    Effect.provideService(WindowsShellEnvironment, (...args) =>
      Effect.sync(() => readEnvironment(...args)),
    ),
    Effect.provideService(CommandAvailability, commandAvailable),
  );

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

describe("readEnvironmentFromWindowsShell", () => {
  effectIt.effect("yields while the native shell probe is pending", () =>
    Effect.gen(function* () {
      let completed = false;
      const [environment, completedBeforeProbeReturned] = yield* Effect.all(
        [
          readEnvironmentFromWindowsShell(["PATH"]).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                completed = true;
              }),
            ),
          ),
          Effect.sync(() => completed),
        ],
        { concurrency: 2 },
      );
      expect(completedBeforeProbeReturned).toBe(false);
      expect(environment).toBeTypeOf("object");
    }),
  );

  effectIt.layer(NodeServices.layer)("synchronous spawn failures", (it) => {
    it.effect("tries both shells and preserves baseline PATH repair", () =>
      Effect.gen(function* () {
        const execFile = nativeProbe.execFile;
        execFile.mockImplementationOnce(() => {
          throw new Error("spawn EPERM");
        });
        execFile.mockImplementationOnce(() => {
          throw new Error("spawn EINVAL");
        });
        try {
          const patch = yield* resolveWindowsEnvironment({
            PATH: "C:\\Windows",
            APPDATA: "C:\\Roaming",
          }).pipe(Effect.provideService(CommandAvailability, () => Effect.succeed(true)));
          expect(patch).toEqual({ PATH: "C:\\Windows;C:\\Roaming\\npm" });
          expect(execFile.mock.calls.slice(-2).map(([file]) => file)).toEqual([
            "pwsh.exe",
            "powershell.exe",
          ]);
        } finally {
          execFile.mockClear();
        }
      }),
    );
  });

  effectIt.effect("returns an empty environment after both shell candidates fail", () =>
    Effect.gen(function* () {
      const execFile = vi.fn(() => Effect.succeed(Option.none<string>()));
      expect(yield* readEnvironmentFromWindowsShell(["PATH"], {}, execFile)).toEqual({});
      expect(execFile).toHaveBeenCalledTimes(2);
    }),
  );

  effectIt.effect("does not launch a shell when no variables are requested", () =>
    Effect.gen(function* () {
      const execFile = vi.fn(() => Effect.succeed(Option.none<string>()));
      expect(yield* readEnvironmentFromWindowsShell([], {}, execFile)).toEqual({});
      expect(execFile).not.toHaveBeenCalled();
    }),
  );

  effectIt.effect(
    "kills the native probe child on interruption without trying the next shell",
    () =>
      Effect.gen(function* () {
        const started = Promise.withResolvers<void>();
        const kill = vi.fn(() => true);
        const child = { kill, unref: vi.fn() } as unknown as ReturnType<
          typeof import("node:child_process").execFile
        >;
        const execFile = nativeProbe.execFile;
        execFile.mockClear();
        execFile.mockImplementationOnce(() => {
          started.resolve();
          return child;
        });
        try {
          const fiber = yield* readEnvironmentFromWindowsShell(["PATH"]).pipe(Effect.forkChild);
          yield* Effect.promise(() => started.promise);
          yield* Fiber.interrupt(fiber);
          expect(kill).toHaveBeenCalledTimes(1);
          expect(execFile).toHaveBeenCalledTimes(1);
          expect(execFile.mock.calls[0]?.[0]).toBe("pwsh.exe");
        } finally {
          execFile.mockClear();
        }
      }),
  );

  effectIt.effect("gives up on a shell that survives the kill and holds stdout open", () =>
    Effect.gen(function* () {
      const stdout = { destroy: vi.fn() };
      const unref = vi.fn();
      const child = { kill: vi.fn(() => true), stdout, unref } as unknown as ReturnType<
        typeof import("node:child_process").execFile
      >;
      const execFile = nativeProbe.execFile;
      execFile.mockClear();
      execFile.mockImplementation(() => child);
      try {
        const fiber = yield* readEnvironmentFromWindowsShell(["PATH"]).pipe(Effect.forkChild);
        yield* Effect.yieldNow;
        yield* TestClock.adjust("6 seconds");
        expect(execFile.mock.calls.map(([file]) => file)).toEqual(["pwsh.exe", "powershell.exe"]);
        yield* TestClock.adjust("6 seconds");
        expect(yield* Fiber.join(fiber)).toEqual({});
        expect(stdout.destroy).toHaveBeenCalledTimes(2);
        expect(unref).toHaveBeenCalledTimes(2);
      } finally {
        execFile.mockReset();
        execFile.mockImplementation(nativeProbe.original);
      }
    }),
  );

  effectIt.effect("extracts environment variables from a PowerShell command", () =>
    Effect.gen(function* () {
      const execFile = vi.fn<
        (
          file: string,
          args: ReadonlyArray<string>,
          options: { encoding: "utf8"; timeout: number },
        ) => string
      >(
        () =>
          "__FAB_ENV_PATH_START__\nC:\\Users\\testuser\\AppData\\Roaming\\npm\n__FAB_ENV_PATH_END__\n",
      );

      expect(
        yield* readEnvironmentFromWindowsShell(["PATH"], {}, (...args) =>
          Effect.try(() => execFile(...args)).pipe(Effect.option),
        ),
      ).toEqual({
        PATH: "C:\\Users\\testuser\\AppData\\Roaming\\npm",
      });
      expect(execFile).toHaveBeenCalledWith(
        "pwsh.exe",
        expect.arrayContaining(["-NoLogo", "-NoProfile", "-NonInteractive", "-Command"]),
        { encoding: "utf8", timeout: 5000 },
      );
    }),
  );

  effectIt.effect("strips CRLF delimiters from captured PowerShell values", () =>
    Effect.gen(function* () {
      const execFile = vi.fn<
        (
          file: string,
          args: ReadonlyArray<string>,
          options: { encoding: "utf8"; timeout: number },
        ) => string
      >(
        () =>
          "__FAB_ENV_FNM_DIR_START__\r\nC:\\Users\\testuser\\AppData\\Roaming\\fnm\r\n__FAB_ENV_FNM_DIR_END__\r\n",
      );

      expect(
        yield* readEnvironmentFromWindowsShell(["FNM_DIR"], {}, (...args) =>
          Effect.try(() => execFile(...args)).pipe(Effect.option),
        ),
      ).toEqual({
        FNM_DIR: "C:\\Users\\testuser\\AppData\\Roaming\\fnm",
      });
    }),
  );

  effectIt.effect("omits -NoProfile when loadProfile is enabled", () =>
    Effect.gen(function* () {
      const execFile = vi.fn<
        (
          file: string,
          args: ReadonlyArray<string>,
          options: { encoding: "utf8"; timeout: number },
        ) => string
      >(() => "__FAB_ENV_PATH_START__\nC:\\Tools\n__FAB_ENV_PATH_END__\n");

      expect(
        yield* readEnvironmentFromWindowsShell(["PATH"], { loadProfile: true }, (...args) =>
          Effect.try(() => execFile(...args)).pipe(Effect.option),
        ),
      ).toEqual({
        PATH: "C:\\Tools",
      });
      expect(execFile).toHaveBeenCalledWith(
        "pwsh.exe",
        expect.arrayContaining(["-NoLogo", "-NonInteractive", "-Command"]),
        { encoding: "utf8", timeout: 5000 },
      );
      expect(execFile.mock.calls[0]?.[1]).not.toContain("-NoProfile");
    }),
  );

  effectIt.effect("falls back to Windows PowerShell when pwsh.exe is unavailable", () =>
    Effect.gen(function* () {
      const execFile = vi.fn<
        (
          file: string,
          args: ReadonlyArray<string>,
          options: { encoding: "utf8"; timeout: number },
        ) => string
      >((file) => {
        if (file === "pwsh.exe") {
          throw new Error("spawn pwsh.exe ENOENT");
        }
        return "__FAB_ENV_PATH_START__\nC:\\Tools\n__FAB_ENV_PATH_END__\n";
      });

      expect(
        yield* readEnvironmentFromWindowsShell(["PATH"], {}, (...args) =>
          Effect.try(() => execFile(...args)).pipe(Effect.option),
        ),
      ).toEqual({
        PATH: "C:\\Tools",
      });
      expect(execFile).toHaveBeenNthCalledWith(1, "pwsh.exe", expect.any(Array), {
        encoding: "utf8",
        timeout: 5000,
      });
      expect(execFile).toHaveBeenNthCalledWith(2, "powershell.exe", expect.any(Array), {
        encoding: "utf8",
        timeout: 5000,
      });
    }),
  );
});

describe("mergePathValues", () => {
  it("sanitizes and dedupes Windows entries while preserving preferred order", () => {
    expect(
      mergePathValues(
        'C:\\Users\\testuser\\AppData\\Roaming\\npm;"C:\\Program Files\\nodejs"',
        "c:\\users\\testuser\\appdata\\roaming\\npm;C:\\Windows\\System32",
        "win32",
      ),
    ).toBe(
      "C:\\Users\\testuser\\AppData\\Roaming\\npm;C:\\Program Files\\nodejs;C:\\Windows\\System32",
    );
  });

  it("removes stray quotes from Windows entries", () => {
    expect(
      mergePathValues(
        'C:\\Windows\\System32;C:\\cloudflared.exe;C:";C:\\Program Files\\nodejs',
        undefined,
        "win32",
      ),
    ).toBe("C:\\Windows\\System32;C:\\cloudflared.exe;C:;C:\\Program Files\\nodejs");
  });

  it("dedupes case-sensitively on POSIX", () => {
    expect(mergePathValues("/usr/local/bin:/usr/bin", "/usr/bin:/USR/BIN", "linux")).toBe(
      "/usr/local/bin:/usr/bin:/USR/BIN",
    );
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

effectIt.layer(NodeServices.layer)("resolveWindowsEnvironment", (it) => {
  it.effect("uses known CLI directories as a fallback without changing shell PATH priority", () =>
    Effect.gen(function* () {
      const readEnvironment = vi.fn(
        (_names: ReadonlyArray<string>, options?: { loadProfile?: boolean }) =>
          options?.loadProfile
            ? { PATH: "C:\\Profile\\Bin" }
            : { PATH: "C:\\Shell\\Bin;C:\\Windows\\System32" },
      );
      const commandAvailable = vi.fn(() => Effect.succeed(true));

      expect(
        yield* withWindowsEnvironmentMocks(
          resolveWindowsEnvironment({
            PATH: "C:\\Windows\\System32",
            APPDATA: "C:\\Users\\testuser\\AppData\\Roaming",
            LOCALAPPDATA: "C:\\Users\\testuser\\AppData\\Local",
            USERPROFILE: "C:\\Users\\testuser",
          }),
          readEnvironment,
          commandAvailable,
        ),
      ).toEqual({
        PATH: [
          "C:\\Shell\\Bin",
          "C:\\Windows\\System32",
          "C:\\Users\\testuser\\AppData\\Roaming\\npm",
          "C:\\Users\\testuser\\AppData\\Local\\Programs\\nodejs",
          "C:\\Users\\testuser\\AppData\\Local\\Volta\\bin",
          "C:\\Users\\testuser\\AppData\\Local\\pnpm",
          "C:\\Users\\testuser\\.local\\bin",
          "C:\\Users\\testuser\\.bun\\bin",
          "C:\\Users\\testuser\\scoop\\shims",
        ].join(";"),
      });
      expect(readEnvironment).toHaveBeenCalledTimes(1);
      expect(readEnvironment).toHaveBeenCalledWith(["PATH"], { loadProfile: false });
      expect(commandAvailable).toHaveBeenCalledWith(
        "node",
        expect.objectContaining({ env: expect.any(Object) }),
      );
    }),
  );

  it.effect(
    "probes node with one PATH key when inherited environment records have mixed casing",
    () =>
      Effect.gen(function* () {
        const probedEnvironments: Array<NodeJS.ProcessEnv | undefined> = [];

        yield* withWindowsEnvironmentMocks(
          resolveWindowsEnvironment({ Path: "C:\\Stale", PATH: "C:\\Windows\\System32" }),
          () => ({ PATH: "C:\\Shell\\Bin" }),
          (_command, options) =>
            Effect.sync(() => {
              probedEnvironments.push(options?.env);
              return true;
            }),
        );

        const pathEntries = Object.entries(probedEnvironments[0] ?? {}).filter(
          ([key]) => key.toUpperCase() === "PATH",
        );
        expect(pathEntries).toEqual([["PATH", "C:\\Shell\\Bin;C:\\Windows\\System32"]]);
      }),
  );

  it.effect("loads the PowerShell profile when baseline env cannot resolve node", () =>
    Effect.gen(function* () {
      const readEnvironment = vi.fn(
        (_names: ReadonlyArray<string>, options?: { loadProfile?: boolean }) =>
          options?.loadProfile
            ? {
                PATH: "C:\\Profile\\Node;C:\\Windows\\System32",
                FNM_DIR: "C:\\Users\\testuser\\AppData\\Roaming\\fnm",
                FNM_MULTISHELL_PATH: "C:\\Users\\testuser\\AppData\\Local\\fnm_multishells\\123",
              }
            : { PATH: "C:\\Shell\\Bin;C:\\Windows\\System32" },
      );
      const commandAvailable = vi.fn(() => Effect.succeed(false));

      expect(
        yield* withWindowsEnvironmentMocks(
          resolveWindowsEnvironment({
            PATH: "C:\\Windows\\System32",
            APPDATA: "C:\\Users\\testuser\\AppData\\Roaming",
            LOCALAPPDATA: "C:\\Users\\testuser\\AppData\\Local",
            USERPROFILE: "C:\\Users\\testuser",
          }),
          readEnvironment,
          commandAvailable,
        ),
      ).toEqual({
        PATH: [
          "C:\\Profile\\Node",
          "C:\\Windows\\System32",
          "C:\\Shell\\Bin",
          "C:\\Users\\testuser\\AppData\\Roaming\\npm",
          "C:\\Users\\testuser\\AppData\\Local\\Programs\\nodejs",
          "C:\\Users\\testuser\\AppData\\Local\\Volta\\bin",
          "C:\\Users\\testuser\\AppData\\Local\\pnpm",
          "C:\\Users\\testuser\\.local\\bin",
          "C:\\Users\\testuser\\.bun\\bin",
          "C:\\Users\\testuser\\scoop\\shims",
        ].join(";"),
        FNM_DIR: "C:\\Users\\testuser\\AppData\\Roaming\\fnm",
        FNM_MULTISHELL_PATH: "C:\\Users\\testuser\\AppData\\Local\\fnm_multishells\\123",
      });
      expect(readEnvironment).toHaveBeenNthCalledWith(1, ["PATH"], { loadProfile: false });
      expect(readEnvironment).toHaveBeenNthCalledWith(
        2,
        ["PATH", "FNM_DIR", "FNM_MULTISHELL_PATH"],
        {
          loadProfile: true,
        },
      );
      expect(commandAvailable).toHaveBeenCalledTimes(1);
    }),
  );

  it.effect("keeps the baseline env when profiled probe still does not resolve node", () =>
    Effect.gen(function* () {
      const readEnvironment = vi.fn(
        (_names: ReadonlyArray<string>, options?: { loadProfile?: boolean }) =>
          options?.loadProfile ? { FNM_DIR: "C:\\Users\\testuser\\AppData\\Roaming\\fnm" } : {},
      );
      const commandAvailable = vi.fn(() => Effect.succeed(false));

      expect(
        yield* withWindowsEnvironmentMocks(
          resolveWindowsEnvironment({
            PATH: "C:\\Windows\\System32",
            APPDATA: "C:\\Users\\testuser\\AppData\\Roaming",
            USERPROFILE: "C:\\Users\\testuser",
          }),
          readEnvironment,
          commandAvailable,
        ),
      ).toEqual({
        PATH: [
          "C:\\Windows\\System32",
          "C:\\Users\\testuser\\AppData\\Roaming\\npm",
          "C:\\Users\\testuser\\.local\\bin",
          "C:\\Users\\testuser\\.bun\\bin",
          "C:\\Users\\testuser\\scoop\\shims",
        ].join(";"),
        FNM_DIR: "C:\\Users\\testuser\\AppData\\Roaming\\fnm",
      });
      expect(commandAvailable).toHaveBeenCalledTimes(1);
    }),
  );
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
          PATH: "C:\\fresh",
          FNM_DIR: null,
          __MISE_DIFF: null,
          SSH_AUTH_SOCK: "/current.sock",
          NODE_OPTIONS: "--bad",
        },
      });
      expect(message.type).toBe("shellEnvironment");
      if (message.type !== "shellEnvironment") throw new Error("Expected shell environment update");
      const env: NodeJS.ProcessEnv = {
        Path: "C:\\stale",
        FNM_DIR: "stale",
        __MISE_DIFF: "stale",
        UNRELATED: "keep",
      };
      applyShellEnvironment(env, message.environment, platform);
      expect(env).toEqual({
        PATH: "C:\\fresh",
        Path: "C:\\stale",
        SSH_AUTH_SOCK: "/current.sock",
        UNRELATED: "keep",
      });
      env.Path = "C:\\stale";
      env.path = "C:\\other";
      applyShellEnvironment(env, { PATH: null, SSH_AUTH_SOCK: null }, platform);
      expect(env).toEqual({
        Path: "C:\\stale",
        path: "C:\\other",
        UNRELATED: "keep",
      });
    },
  );
});
