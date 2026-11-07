import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import type { ServerInstallation } from "@fab/contracts";
import * as HostProcess from "@fab/shared/HostProcess";
import { resolveCommandPath } from "@fab/shared/shell";

import packageJson from "../../package.json" with { type: "json" };

export type CliRunner = "npx" | "pnpm dlx" | "bunx";

/** Detection is best-effort; callers must fail closed to a plain `fab` command. */
function detectCliRunner(entryPath: string): CliRunner | null {
  const path = entryPath.replaceAll("\\", "/");
  if (path.includes("/_npx/")) {
    return "npx";
  }
  if (
    path.includes("/pnpm/dlx/") ||
    path.includes("/.pnpm/dlx/") ||
    path.includes("/pnpm-cache/dlx/")
  ) {
    return "pnpm dlx";
  }
  if (path.includes("/.bun/install/cache/") || path.includes("/bunx-")) {
    return "bunx";
  }
  return null;
}

const InstallManifest = Schema.Struct({
  name: Schema.String,
  version: Schema.String,
  bin: Schema.optionalKey(Schema.Struct({ fab: Schema.String })),
});
const decodeInstallManifest = Schema.decodeUnknownEffect(Schema.fromJsonString(InstallManifest));

/**
 * `FAB_NPM_LAUNCHER_PATH` is inherited by child shells, so accept it only for this package
 * version to avoid claiming another `fab` invocation is the npm install.
 */
export const resolveEntryPath = Effect.gen(function* () {
  const npmLauncher = (yield* HostProcess.Environment).FAB_NPM_LAUNCHER_PATH?.trim();
  if (npmLauncher) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const manifest = yield* fs
      .readFileString(path.join(path.dirname(npmLauncher), "../package.json"))
      .pipe(Effect.flatMap(decodeInstallManifest), Effect.option);
    if (
      Option.isSome(manifest) &&
      manifest.value.name === "fab" &&
      manifest.value.version === packageJson.version
    ) {
      return npmLauncher;
    }
  }
  if (yield* HostProcess.IsExecutable) return yield* HostProcess.ExecutablePath;
  return (yield* HostProcess.Arguments)[1] ?? "";
});

export const resolveServerInstallation = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const entry = yield* fs.realPath(yield* resolveEntryPath);
  const match = /^(.*)\/lib\/node_modules\/fab\/(?:dist\/bin\.mjs|bin\/fab\.mjs)$/.exec(entry);
  if (!match) {
    const runner = detectCliRunner(entry);
    return runner === null
      ? null
      : ({ kind: runner === "pnpm dlx" ? "pnpm-dlx" : runner } satisfies ServerInstallation);
  }
  const prefix = match[1] || "/";
  if (
    prefix.includes("/node_modules/") ||
    /\/(?:Cellar|Caskroom)\//i.test(prefix) ||
    /\/mise\/installs\/(?!node\/)[^/]+\//.test(prefix)
  )
    return null;

  const packageRoot = path.join(prefix, "lib/node_modules/fab");
  const manifest = yield* fs
    .readFileString(path.join(packageRoot, "package.json"))
    .pipe(Effect.flatMap(decodeInstallManifest));
  if (manifest.name !== "fab" || !manifest.bin) return null;
  const bin = yield* fs.realPath(path.join(packageRoot, manifest.bin.fab));
  const globalBin = yield* fs.realPath(path.join(prefix, "bin/fab"));
  if (globalBin !== bin || bin !== entry) return null;
  return { kind: "npm-global", prefix } satisfies ServerInstallation;
}).pipe(Effect.orElseSucceed(() => null));

/** The original package spec is unavailable at startup; infer its channel from the version. */
function suggestedPackageSpec(version: string): string {
  const channel = /^[^-+]+-(nightly|preview)\./.exec(version)?.[1];
  return channel === undefined ? "fab" : `fab@${channel}`;
}

function formatCliCommand(input: {
  readonly subcommand: string;
  readonly entryPath: string;
  readonly version: string;
}): string {
  const runner = detectCliRunner(input.entryPath);
  if (runner === null) {
    return `fab ${input.subcommand}`;
  }
  return `${runner} ${suggestedPackageSpec(input.version)} ${input.subcommand}`;
}

export const resolveCliCommand = (subcommand: string) =>
  Effect.map(resolveEntryPath, (entryPath) =>
    formatCliCommand({ subcommand, entryPath, version: packageJson.version }),
  );

const shellWord = (value: string) =>
  /^[\w@%+=:,./-]+$/.test(value) ? value : `'${value.replaceAll("'", `'"'"'`)}'`;

/** Script installs have no single launcher; desktop shims and standalone binaries do. */
const resolveInstallLauncher = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const shim = (yield* HostProcess.Environment).FAB_CLI_PATH?.trim();
  if (shim && (yield* fs.exists(shim).pipe(Effect.orElseSucceed(() => false)))) {
    return Option.some(shim);
  }
  return (yield* HostProcess.IsExecutable)
    ? Option.some(yield* HostProcess.ExecutablePath)
    : Option.none<string>();
});

/**
 * Uses this install's `fab` on PATH, the originating runner, or its absolute launcher path.
 * Arguments are quoted for POSIX shells.
 */
export const resolveHostCliCommand = Effect.fn("invocation.resolveHostCliCommand")(function* (
  subcommand: string,
  args: ReadonlyArray<string> = [],
) {
  const withArgs = (prefix: string) => [prefix, ...args.map(shellWord)].join(" ");
  const command = yield* resolveCliCommand(subcommand);
  if (command !== `fab ${subcommand}`) return { command: withArgs(command), launcher: false };
  const onPath = yield* resolveCommandPath("fab");
  if (onPath !== null) {
    const shim = (yield* HostProcess.Environment).FAB_CLI_PATH?.trim();
    const fs = yield* FileSystem.FileSystem;
    const real = (file: string) => fs.realPath(file).pipe(Effect.orElseSucceed(() => null));
    const shimReal = shim ? yield* real(shim) : null;
    if (shimReal === null || shimReal === (yield* real(onPath))) {
      return { command: withArgs(command), launcher: false };
    }
  }
  const launcher = yield* resolveInstallLauncher;
  if (Option.isNone(launcher)) return { command: withArgs(command), launcher: false };
  return { command: withArgs(`${shellWord(launcher.value)} ${subcommand}`), launcher: true };
});

/**
 * `sudo` resets PATH on most distributions, which drops a user-installed Node
 * (nvm, fnm, a tarball) and with it `npx` or a global `fab`, so the command
 * carries PATH through unless Node is on root's PATH too. An absolute launcher
 * needs neither.
 */
export const resolveRootCliCommand = Effect.fn("invocation.resolveRootCliCommand")(function* (
  subcommand: string,
  args: ReadonlyArray<string> = [],
) {
  const { command, launcher } = yield* resolveHostCliCommand(subcommand, args);
  if (launcher) return `sudo ${command}`;
  const executablePath = yield* HostProcess.ExecutablePath;
  const systemNode = ROOT_PATH_DIRECTORIES.some((directory) =>
    executablePath.startsWith(`${directory}/`),
  );
  return systemNode ? `sudo ${command}` : `sudo env "PATH=$PATH" ${command}`;
});

const ROOT_PATH_DIRECTORIES = [
  "/usr/local/sbin",
  "/usr/local/bin",
  "/usr/sbin",
  "/usr/bin",
  "/sbin",
  "/bin",
];
