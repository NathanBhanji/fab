import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";

import * as DesktopEnvironment from "./DesktopEnvironment.ts";
import { makeComponentLogger } from "./DesktopObservability.ts";

// AppImage mounts change each run; the launcher must mount the image itself.
const { logInfo, logWarning } = makeComponentLogger("desktop-cli-shim");

export const MARKER = "Written by Fab: runs the desktop app's bundled fab CLI.";

const SERVER_ENTRY = "apps/server/dist/bin.mjs";

const shellWord = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`;

const MOVED = "Fab has moved or been removed. Open the app once to update this command.";

export type CliShimTarget =
  | { readonly kind: "appimage"; readonly appImage: string; readonly executableName: string }
  | { readonly kind: "direct"; readonly executable: string; readonly entry: string };

/** Embed this install's home and executable path so `sudo`, which clears the environment, uses the same install. */
export const renderCliShim = (input: {
  readonly target: CliShimTarget;
  readonly shimPath: string;
  readonly fabHome: string;
}) => {
  const { target } = input;
  const header = [
    "#!/bin/sh",
    `# ${MARKER}`,
    `export FAB_CLI_PATH=${shellWord(input.shimPath)}`,
    `home=${shellWord(input.fabHome)}`,
    'export FAB_HOME="${FAB_HOME:-$home}"',
    "export ELECTRON_RUN_AS_NODE=1",
    `app=${shellWord(target.kind === "appimage" ? target.appImage : target.executable)}`,
    'if [ ! -x "$app" ]; then',
    `  echo "${MOVED}" >&2`,
    "  exit 127",
    "fi",
  ];
  if (target.kind === "direct") {
    return [...header, `exec "$app" ${shellWord(target.entry)} "$@"`, ""].join("\n");
  }
  const run = (root: string) =>
    `"${root}/${target.executableName}" "${root}/resources/app.asar/${SERVER_ENTRY}" "$@"`;
  return [
    ...header,
    // Extract-and-run would make the runtime start the app instead of mounting it.
    "unset APPIMAGE_EXTRACT_AND_RUN",
    // The runtime stays mounted until killed; traps unmount it because background jobs ignore Ctrl-C.
    "work=$(mktemp -d) || exit 1",
    '"$app" --appimage-mount >"$work/mount" 2>/dev/null &',
    "mounter=$!",
    `trap 'kill "$mounter" 2>/dev/null; rm -rf "$work"' EXIT`,
    "trap 'exit 130' INT TERM",
    "mount=",
    'while kill -0 "$mounter" 2>/dev/null; do',
    '  mount=$(head -n 1 "$work/mount")',
    '  [ -d "$mount" ] && break',
    "  mount=",
    "  sleep 0.05",
    "done",
    // Without FUSE the runtime cannot mount (it prints why and exits); extracting the image still works.
    'if [ -z "$mount" ]; then',
    '  (cd "$work" && "$app" --appimage-extract >/dev/null) || { echo "Could not open $app." >&2; exit 1; }',
    '  mount="$work/squashfs-root"',
    "fi",
    run("$mount"),
    "",
  ].join("\n");
};

export const launcherPath = (environment: DesktopEnvironment.DesktopEnvironment["Service"]) =>
  environment.path.join(environment.baseDir, "bin", "fab");

export const install = Effect.gen(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  if (!environment.isPackaged) return Option.none<string>();
  const fs = yield* FileSystem.FileSystem;
  const path = environment.path;
  const shimPath = launcherPath(environment);
  const entry = path.join(environment.serverRoot, SERVER_ENTRY);
  const target: CliShimTarget = Option.match(environment.appImagePath, {
    onSome: (appImage) => ({
      kind: "appimage" as const,
      appImage,
      executableName: path.basename(process.execPath),
    }),
    onNone: () => ({ kind: "direct" as const, executable: process.execPath, entry }),
  });
  const content = renderCliShim({ target, shimPath, fabHome: environment.baseDir });

  return yield* Effect.gen(function* () {
    const existing = yield* fs.readFileString(shimPath).pipe(Effect.option);
    if (Option.isSome(existing) && !existing.value.includes(MARKER)) {
      yield* logWarning("leaving a fab launcher the app did not write", { shimPath });
      return Option.none<string>();
    }
    if (Option.getOrUndefined(existing) !== content) {
      yield* fs.makeDirectory(path.dirname(shimPath), { recursive: true });
      const staging = `${shimPath}.${process.pid}.tmp`;
      yield* fs.writeFileString(staging, content, { mode: 0o755 });
      yield* fs.rename(staging, shimPath);
      yield* logInfo("installed fab launcher", { shimPath });
    }
    return Option.some(shimPath);
  }).pipe(
    Effect.catchCause((cause) =>
      logWarning("could not install fab launcher", { shimPath, cause: Cause.pretty(cause) }).pipe(
        Effect.as(Option.none<string>()),
      ),
    ),
    Effect.withSpan("desktop.cliShim.install"),
  );
});
