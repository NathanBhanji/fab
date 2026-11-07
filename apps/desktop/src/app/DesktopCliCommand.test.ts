import * as NodeServices from "@effect/platform-node/NodeServices";
import { afterEach, beforeEach, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";

import * as DesktopCliCommand from "./DesktopCliCommand.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";

const environmentFor = (
  path: Path.Path,
  input: { home: string; baseDir: string; platform?: NodeJS.Platform; isPackaged?: boolean },
) =>
  DesktopEnvironment.DesktopEnvironment.of({
    path,
    platform: input.platform ?? "linux",
    isPackaged: input.isPackaged ?? true,
    homeDirectory: input.home,
    baseDir: input.baseDir,
    stateDir: path.join(input.baseDir, "userdata"),
    serverRoot: "/opt/Fab/resources/app.asar",
    appImagePath: Option.none(),
  } as unknown as DesktopEnvironment.DesktopEnvironment["Service"]);

const commandIn = (input: {
  home: string;
  baseDir?: string;
  platform?: NodeJS.Platform;
  isPackaged?: boolean;
}) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const baseDir = input.baseDir ?? path.join(input.home, ".fab");
    yield* fs.makeDirectory(path.join(baseDir, "userdata"), { recursive: true });
    return yield* DesktopCliCommand.make.pipe(
      Effect.provideService(
        DesktopEnvironment.DesktopEnvironment,
        environmentFor(path, { ...input, baseDir }),
      ),
    );
  });

const machinePath = process.env.PATH;
beforeEach(() => {
  process.env.PATH = "";
});
afterEach(() => {
  process.env.PATH = machinePath;
});

it.layer(NodeServices.layer)("DesktopCliCommand", (it) => {
  it.effect("links the launcher onto PATH and removes only that link", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped();
      const command = yield* commandIn({ home });
      const link = path.join(home, ".local", "bin", "fab");

      expect(yield* command.state).toEqual({
        supported: true,
        installedPath: null,
        onPath: false,
        launcherPath: null,
      });
      const installed = yield* command.install;
      expect(installed.installedPath).toBe(link);
      expect(installed.launcherPath).toBe(path.join(home, ".fab", "bin", "fab"));
      expect(yield* fs.readLink(link)).toBe(path.join(home, ".fab", "bin", "fab"));
      expect((yield* command.install).installedPath).toBe(link);

      expect((yield* command.uninstall).installedPath).toBeNull();
      expect(yield* fs.exists(link)).toBe(false);
      expect(yield* fs.exists(path.join(home, ".fab", "bin", "fab"))).toBe(true);
    }).pipe(Effect.scoped),
  );

  it.effect("never replaces or removes a fab it did not create", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped();
      const command = yield* commandIn({ home });
      const theirs = path.join(home, ".local", "bin", "fab");
      yield* fs.makeDirectory(path.dirname(theirs), { recursive: true });
      yield* fs.writeFileString(theirs, "npm's fab\n");
      yield* fs.makeDirectory(path.join(home, "bin"), { recursive: true });
      yield* fs.symlink(path.join(home, "gone"), path.join(home, "bin", "fab"));

      const error = yield* Effect.flip(command.install);
      expect(error.message).toContain("Another fab command is already installed");
      yield* command.uninstall;
      expect(yield* fs.readFileString(theirs)).toBe("npm's fab\n");
      expect(yield* fs.readLink(path.join(home, "bin", "fab"))).toBe(path.join(home, "gone"));

      const launcher = path.join(home, ".fab", "bin", "fab");
      yield* fs.writeFileString(launcher, "npm's fab\n");
      process.env.PATH = path.dirname(launcher);
      expect(yield* command.state).toMatchObject({ onPath: false, shadowedBy: launcher });
      expect((yield* Effect.flip(command.install)).message).toContain("Could not set up");
      yield* command.uninstall;
      expect(yield* fs.readFileString(launcher)).toBe("npm's fab\n");
    }).pipe(Effect.scoped),
  );

  it.effect("finds and removes a link left by a previous Fab home", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped();
      const before = yield* commandIn({ home, baseDir: path.join(home, "old-fab") });
      const link = (yield* before.install).installedPath;

      const after = yield* commandIn({ home, baseDir: path.join(home, "new-fab") });
      expect((yield* after.state).installedPath).toBe(link);
      expect((yield* after.install).installedPath).toBe(link);
      expect(yield* fs.readLink(link!)).toBe(path.join(home, "new-fab", "bin", "fab"));
      yield* after.uninstall;
      expect(yield* fs.exists(path.join(home, ".local", "bin", "fab"))).toBe(false);
      expect(yield* fs.exists(path.join(home, "bin", "fab"))).toBe(false);
    }).pipe(Effect.scoped),
  );

  it.effect("refuses to install behind another fab that runs first", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped();
      const shadow = path.join(home, "shadow");
      yield* fs.makeDirectory(shadow);
      yield* fs.writeFileString(path.join(shadow, "fab"), "#!/bin/sh\n", { mode: 0o755 });
      process.env.PATH = [shadow, path.join(home, ".local", "bin")].join(":");

      const command = yield* commandIn({ home });
      const theirs = path.join(shadow, "fab");
      expect((yield* command.state).shadowedBy).toBe(theirs);
      const error = yield* Effect.flip(command.install);
      expect(error.message).toContain(theirs);
      expect(yield* fs.exists(path.join(home, ".local", "bin", "fab"))).toBe(false);

      yield* fs.remove(theirs);
      const installed = yield* command.install;
      expect(installed).toMatchObject({
        onPath: true,
        installedPath: path.join(home, ".local", "bin", "fab"),
      });
      expect(installed.shadowedBy).toBeUndefined();
    }).pipe(Effect.scoped),
  );

  it.effect("skips a fab directory or a file this user cannot execute", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped();
      const folder = path.join(home, "folder");
      const plain = path.join(home, "plain");
      const shadow = path.join(home, "shadow");
      yield* fs.makeDirectory(path.join(folder, "fab"), { recursive: true });
      yield* fs.makeDirectory(plain);
      yield* fs.writeFileString(path.join(plain, "fab"), "notes\n");
      // Root can execute mode 0o601; other users must honor the owner permissions.
      yield* fs.chmod(path.join(plain, "fab"), process.getuid?.() === 0 ? 0o600 : 0o601);
      yield* fs.makeDirectory(shadow);
      yield* fs.writeFileString(path.join(shadow, "fab"), "#!/bin/sh\n", { mode: 0o755 });
      process.env.PATH = [folder, plain, shadow, path.join(home, ".local", "bin")].join(":");

      const command = yield* commandIn({ home });
      expect((yield* command.state).shadowedBy).toBe(path.join(shadow, "fab"));

      const error = yield* Effect.flip(command.install);
      expect(error.message).toContain(path.join(shadow, "fab"));

      yield* fs.remove(shadow, { recursive: true });
      expect(yield* command.install).toMatchObject({
        onPath: true,
        installedPath: path.join(home, ".local", "bin", "fab"),
      });
    }).pipe(Effect.scoped),
  );

  it.effect("does not treat its own launcher as another fab when its folder is first on PATH", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const home = yield* fs.makeTempDirectoryScoped();
      const launcher = path.join(home, ".fab", "bin", "fab");
      process.env.PATH = [path.dirname(launcher), path.join(home, ".local", "bin")].join(":");

      const command = yield* commandIn({ home });
      const installed = yield* command.install;

      expect(yield* fs.exists(launcher)).toBe(true);
      expect(installed).toMatchObject({
        onPath: true,
        installedPath: path.join(home, ".local", "bin", "fab"),
      });
      expect(installed.shadowedBy).toBeUndefined();
      expect(yield* command.state).toEqual(installed);

      const removed = yield* command.uninstall;
      expect(removed.installedPath).toBeNull();
      expect(removed.onPath).toBe(true);
      expect(yield* command.state).toEqual(removed);
      expect(yield* fs.exists(installed.installedPath!)).toBe(false);
      expect(yield* fs.exists(launcher)).toBe(true);
    }).pipe(Effect.scoped),
  );
});
