// @effect-diagnostics nodeBuiltinImport:off - Tests use Node's glob matcher to verify electron-builder exclusions.
import * as NodePath from "node:path";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { createPackageWithOptions } from "@electron/asar";
import { assert, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Sink from "effect/Sink";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import {
  buildDesktopBundles,
  copyDesktopBuildArtifacts,
  DesktopBuildManifestRestoreError,
  BundleNotSelfContainedError,
  BuildCommandFailedError,
  readWorkspaceConfig,
  createBuildConfig,
  DESKTOP_FILE_EXCLUSIONS,
  UnsupportedDesktopBuildArchitectureError,
  MacPasskeySigningConfigurationResolutionError,
  MissingMacPasskeyProvisioningProfileError,
  renderMacPasskeyEntitlements,
  resolveMacWebAuthnEntitlements,
  resolveMacPasskeySigningConfiguration,
  resolveMergedStageDependencies,
  resolveBuildOptions,
  copyDirectoryPreservingSymlinks,
  LinuxBrowserSecretHostError,
  MacPackagedAppMissingError,
  stageBrowserSecret,
  validateMacPackagedPayload,
  stageCursorSdkPlatformPackages,
} from "./build-desktop-artifact.ts";
import {
  ReleasePackageManifestError,
  releasePackageFiles,
} from "./update-release-package-versions.ts";
import * as HostProcess from "@fab/shared/HostProcess";
import { symlinksSupported } from "@fab/shared/testing/symlinks";

const encodeModuleUrl = Schema.encodeEffect(Schema.fromJsonString(Schema.String));
const decodePackageVersion = Schema.decodeUnknownEffect(
  Schema.fromJsonString(Schema.Struct({ version: Schema.String })),
);

// Keeps pnpm from auto-installing TypeScript, a types-only peer, into the app.

function mockProcess(exitCode: number, stdout = "") {
  const encodedStdout = new TextEncoder().encode(stdout);
  return ChildProcessSpawner.makeHandle({
    pid: ChildProcessSpawner.ProcessId(1),
    exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(exitCode)),
    isRunning: Effect.succeed(false),
    kill: () => Effect.void,
    unref: Effect.succeed(Effect.void),
    stdin: Sink.drain,
    stdout: stdout ? Stream.make(encodedStdout) : Stream.empty,
    stderr: Stream.empty,
    all: Stream.empty,
    getInputFd: () => Sink.drain,
    getOutputFd: () => Stream.empty,
  });
}

const makeMacPayloadFixture = Effect.fn("test.makeMacPayloadFixture")(function* (input: {
  readonly serverEntrySource?: string;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const tempDir = yield* fs.makeTempDirectoryScoped({ prefix: "fab-mac-payload-test-" });
  const sourceDir = path.join(tempDir, "app-source");
  const serverEntryPath = path.join(sourceDir, "apps/server/dist/bin.mjs");
  yield* fs.makeDirectory(path.dirname(serverEntryPath), { recursive: true });
  yield* fs.writeFileString(serverEntryPath, input.serverEntrySource ?? "console.log('server');\n");

  const stageDistDir = path.join(tempDir, "dist");
  const resourcesDir = path.join(stageDistDir, "mac-arm64/Fab.app/Contents/Resources");
  yield* fs.makeDirectory(resourcesDir, { recursive: true });
  yield* Effect.promise(() =>
    createPackageWithOptions(sourceDir, path.join(resourcesDir, "app.asar"), {}),
  );
  return { stageDistDir } as const;
});

it.layer(NodeServices.layer)("build-desktop-artifact", (it) => {
  it.effect("rejects overlapping builds from another process until restoration finishes", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "fab-concurrent-build-" });
      yield* fs.writeFileString(
        path.join(root, "package.json"),
        '{ "scripts": { "build:desktop": "node build.cjs" } }',
      );
      const original = '{ "version": "0.0.42", "private": true }\n';
      for (const relativePath of releasePackageFiles) {
        const filePath = path.join(root, relativePath);
        yield* fs.makeDirectory(path.dirname(filePath), { recursive: true });
        yield* fs.writeFileString(filePath, original);
      }
      yield* fs.writeFileString(
        path.join(root, "build.cjs"),
        `require("node:fs").writeFileSync("version.txt", require("./apps/server/package.json").version);`,
      );
      const restoring = yield* Deferred.make<void>();
      const resume = yield* Deferred.make<void>();
      const contenderPath = path.join(root, "contender.mjs");
      yield* fs.writeFileString(
        contenderPath,
        `import * as Effect from ${yield* encodeModuleUrl(import.meta.resolve("effect/Effect"))};
           import * as NodeServices from ${yield* encodeModuleUrl(import.meta.resolve("@effect/platform-node/NodeServices"))};
           import { buildDesktopBundles } from ${yield* encodeModuleUrl(import.meta.resolve("./build-desktop-artifact.ts"))};
           const result = await Effect.runPromise(buildDesktopBundles(process.argv[2], "0.0.44", false).pipe(
             Effect.as("success"), Effect.catch(error => Effect.succeed(error._tag)),
             Effect.scoped, Effect.provide(NodeServices.layer)));
           process.stdout.write(result);`,
      );
      const first = yield* Effect.forkChild(
        Effect.exit(buildDesktopBundles(root, "0.0.43", false)).pipe(
          Effect.provideService(FileSystem.FileSystem, {
            ...fs,
            writeFileString: (filePath, contents, options) =>
              filePath === path.join(root, releasePackageFiles[0]) && contents === original
                ? Deferred.succeed(restoring, undefined).pipe(
                    Effect.andThen(Deferred.await(resume)),
                    Effect.andThen(fs.writeFileString(filePath, contents, options)),
                  )
                : fs.writeFileString(filePath, contents, options),
          }),
        ),
      );
      yield* Deferred.await(restoring);
      yield* Effect.gen(function* () {
        const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
        const child = yield* spawner.spawn(
          ChildProcess.make(process.execPath, [contenderPath, root]),
        );
        const [stdout, stderr, exitCode] = yield* Effect.all(
          [
            child.stdout.pipe(Stream.decodeText, Stream.mkString),
            child.stderr.pipe(Stream.decodeText, Stream.mkString),
            child.exitCode,
          ],
          { concurrency: "unbounded" },
        );
        assert.equal(Number(exitCode), 0, stderr);
        assert.equal(stdout, "DesktopBuildAlreadyRunningError");
      }).pipe(Effect.ensuring(Deferred.succeed(resume, undefined)));
      const firstExit = yield* Fiber.join(first);
      assert.isTrue(Exit.isSuccess(firstExit));
      assert.equal(yield* fs.readFileString(path.join(root, "version.txt")), "0.0.43");
      for (const relativePath of releasePackageFiles) {
        assert.equal(yield* fs.readFileString(path.join(root, relativePath)), original);
      }
      yield* buildDesktopBundles(root, "0.0.44", false);
      assert.equal(yield* fs.readFileString(path.join(root, "version.txt")), "0.0.44");
      for (const relativePath of releasePackageFiles) {
        assert.equal(yield* fs.readFileString(path.join(root, relativePath)), original);
      }
    }),
  );

  it.effect("restores manifests and releases the checkout lock after interruption", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "fab-interrupted-build-" });
      const original = '{ "version": "0.0.42", "private": true }\n';
      for (const relativePath of releasePackageFiles) {
        const filePath = path.join(root, relativePath);
        yield* fs.makeDirectory(path.dirname(filePath), { recursive: true });
        yield* fs.writeFileString(filePath, original);
      }
      const started = yield* Deferred.make<void>();
      const childStopped = yield* Deferred.make<{ lockExists: boolean; version: string }>();
      const build = yield* Effect.forkChild(
        buildDesktopBundles(root, "0.0.43", false).pipe(
          Effect.provideService(
            ChildProcessSpawner.ChildProcessSpawner,
            ChildProcessSpawner.make(() =>
              Effect.acquireRelease(
                Effect.succeed({ ...mockProcess(0), exitCode: Effect.never }).pipe(
                  Effect.tap(() => Deferred.succeed(started, undefined)),
                ),
                () =>
                  Effect.gen(function* () {
                    const lockExists = yield* fs.exists(path.join(root, ".desktop-build.lock"));
                    const manifest = yield* decodePackageVersion(
                      yield* fs.readFileString(path.join(root, releasePackageFiles[0])),
                    );
                    yield* Deferred.succeed(childStopped, {
                      lockExists,
                      version: manifest.version,
                    });
                  }).pipe(Effect.orDie),
              ),
            ),
          ),
          Effect.scoped,
        ),
      );
      yield* Deferred.await(started);
      const aligned = yield* decodePackageVersion(
        yield* fs.readFileString(path.join(root, releasePackageFiles[0])),
      );
      assert.equal(aligned.version, "0.0.43");
      yield* Fiber.interrupt(build);
      assert.deepEqual(yield* Deferred.await(childStopped), {
        lockExists: true,
        version: "0.0.43",
      });
      assert.isFalse(yield* fs.exists(path.join(root, ".desktop-build.lock")));
      for (const relativePath of releasePackageFiles) {
        assert.equal(yield* fs.readFileString(path.join(root, relativePath)), original);
      }
      yield* buildDesktopBundles(root, "0.0.44", false).pipe(
        Effect.provideService(
          ChildProcessSpawner.ChildProcessSpawner,
          ChildProcessSpawner.make(() => Effect.succeed(mockProcess(0))),
        ),
      );
      assert.isFalse(yield* fs.exists(path.join(root, ".desktop-build.lock")));
    }),
  );

  it.effect(
    "builds web, server and desktop with the resolved version, restores changed manifests and preserves edits to matching ones",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "fab-desktop-build-version-" });
        const packageJson = `{
          "name": "desktop-version-fixture",
          "version": "0.0.42",
          "scripts": { "build:desktop": "node build.cjs" }
        }`;
        yield* fs.writeFileString(path.join(root, "package.json"), packageJson);
        const version = "0.0.43-nightly.20260920.2018";
        const matchingPath = "packages/contracts/package.json";
        const originals = releasePackageFiles.map((relativePath, index) => ({
          relativePath,
          contents: `{ "version": "${relativePath === matchingPath ? version : `0.0.${index + 1}`}", "name": "${relativePath}" }\r\n`,
        }));
        const afterBuild = originals.map(({ relativePath, contents }) => ({
          relativePath,
          contents:
            relativePath === matchingPath
              ? `${JSON.stringify({ version, name: matchingPath, description: "edited during compilation" })}\n`
              : contents,
        }));
        for (const { relativePath, contents } of originals) {
          const filePath = path.join(root, relativePath);
          yield* fs.makeDirectory(path.dirname(filePath), { recursive: true });
          yield* fs.writeFileString(filePath, contents);
        }
        yield* fs.writeFileString(
          path.join(root, "build.cjs"),
          `require("node:fs").writeFileSync("version.txt", [
            process.env.APP_VERSION,
            require("./apps/web/package.json").version,
            require("./apps/server/package.json").version,
            require("./apps/desktop/package.json").version
          ].join("\\n"));
          const manifest = require("./${matchingPath}");
          manifest.description = "edited during compilation";
          require("node:fs").writeFileSync("${matchingPath}", JSON.stringify(manifest) + "\\n");`,
        );
        yield* buildDesktopBundles(root, version, false);
        assert.equal(
          yield* fs.readFileString(path.join(root, "version.txt")),
          [version, version, version, version].join("\n"),
        );
        for (const { relativePath, contents } of afterBuild) {
          assert.equal(yield* fs.readFileString(path.join(root, relativePath)), contents);
        }
        assert.equal(yield* fs.readFileString(path.join(root, "package.json")), packageJson);
        yield* fs.writeFileString(path.join(root, "build.cjs"), "process.exit(1);");
        const failure = yield* Effect.flip(buildDesktopBundles(root, "0.0.44", false));
        assert.instanceOf(failure, BuildCommandFailedError);
        for (const { relativePath, contents } of afterBuild) {
          assert.equal(yield* fs.readFileString(path.join(root, relativePath)), contents);
        }
        const invalidPath = releasePackageFiles[releasePackageFiles.length - 1]!;
        yield* fs.writeFileString(path.join(root, invalidPath), "invalid manifest");
        // A successful child would leave a marker if partial alignment accidentally starts it.
        yield* fs.writeFileString(
          path.join(root, "build.cjs"),
          'require("node:fs").writeFileSync("unexpected-build.txt", "started");',
        );
        const alignmentFailure = yield* Effect.flip(buildDesktopBundles(root, "0.0.44", false));
        assert.instanceOf(alignmentFailure, ReleasePackageManifestError);
        for (const { relativePath, contents } of afterBuild) {
          assert.equal(
            yield* fs.readFileString(path.join(root, relativePath)),
            relativePath === invalidPath ? "invalid manifest" : contents,
          );
        }
        assert.isFalse(yield* fs.exists(path.join(root, "unexpected-build.txt")));
        assert.isFalse(yield* fs.exists(path.join(root, ".desktop-build.lock")));
        assert.equal(yield* fs.readFileString(path.join(root, "package.json")), packageJson);
      }),
  );

  it.effect("reports a restore failure while still restoring the remaining manifests", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({ prefix: "fab-manifest-restore-failure-" });
      yield* fs.writeFileString(
        path.join(root, "package.json"),
        `{
          "name": "restore-fixture", "scripts": { "build:desktop": "node build.cjs" }
        }`,
      );
      yield* fs.writeFileString(path.join(root, "build.cjs"), "process.exit(0);");
      const original = '{ "version": "0.0.42" }\n';
      for (const relativePath of releasePackageFiles) {
        const filePath = path.join(root, relativePath);
        yield* fs.makeDirectory(path.dirname(filePath), { recursive: true });
        yield* fs.writeFileString(filePath, original);
      }
      const failedPath = path.join(root, releasePackageFiles[0]);
      const writeFailure = PlatformError.systemError({
        _tag: "PermissionDenied",
        module: "FileSystem",
        method: "writeFileString",
        pathOrDescriptor: failedPath,
      });
      const failure = yield* Effect.flip(buildDesktopBundles(root, "0.0.43", false)).pipe(
        Effect.provideService(FileSystem.FileSystem, {
          ...fs,
          writeFileString: (filePath, contents, options) =>
            filePath === failedPath && contents === original
              ? Effect.fail(writeFailure)
              : fs.writeFileString(filePath, contents, options),
        }),
      );
      assert.instanceOf(failure, DesktopBuildManifestRestoreError);
      assert.notEqual(yield* fs.readFileString(failedPath), original);
      for (const relativePath of releasePackageFiles.slice(1)) {
        assert.equal(yield* fs.readFileString(path.join(root, relativePath)), original);
      }
    }),
  );

  it.effect("omits update feeds for pull request preview builds", () =>
    Effect.gen(function* () {
      const preview = yield* createBuildConfig(
        "mac",
        "dmg",
        "0.0.33-pr.8182.1",
        false,
        false,
        undefined,
        undefined,
      );
      const release = yield* createBuildConfig(
        "mac",
        "dmg",
        "0.0.33",
        false,
        false,
        undefined,
        undefined,
      );

      const previewChannel = yield* createBuildConfig(
        "mac",
        "dmg",
        "0.0.41-preview.20260912.1589",
        false,
        false,
        undefined,
        undefined,
      );

      assert.isNull(preview.publish);
      assert.isNull(previewChannel.publish);
      assert.deepStrictEqual(release.publish, [
        {
          provider: "github",
          owner: "nathanbhanji",
          repo: "fab",
          releaseType: "release",
        },
      ]);
    }).pipe(
      Effect.provide(
        ConfigProvider.layer(
          ConfigProvider.fromEnv({ env: { GITHUB_REPOSITORY: "nathanbhanji/fab" } }),
        ),
      ),
    ),
  );

  // pnpm writes "set this to true or false" placeholders into allowBuilds when a
  // tarball changes. pnpm ignores them, but the release build decode rejects them.
  it.effect("decodes the repo allowBuilds and every file: tarball it names exists", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const { allowBuilds = {} } = yield* readWorkspaceConfig();
      const repoRoot = path.join(import.meta.dirname, "..");
      for (const key of Object.keys(allowBuilds)) {
        const tarball = key.split("@file:")[1]?.replace(/\(patch_hash=[a-f0-9]+\)$/, "");
        if (tarball === undefined) continue;
        assert.isTrue(
          yield* fs.exists(path.join(repoRoot, tarball)),
          `allowBuilds names a missing tarball: ${key}`,
        );
      }
    }),
  );

  it("stages only the externals of both bundles in merged packages", () => {
    assert.deepStrictEqual(
      resolveMergedStageDependencies({
        platform: "mac",
        serverDependencies: {
          "@cursor/sdk": "1.0.22",
          "@anthropic-ai/claude-agent-sdk": "^0.3.170",
          "@ff-labs/fff-node": "0.9.4",
          "@opencode-ai/sdk": "^1.3.15",
          "@pierre/diffs": "1.3.0",
          "node-pty": "1.1.0",
        },
        desktopDependencies: {
          "@napi-rs/keyring": "1.3.0",
          "playwright-core": "1.60.0",
        },
        arch: "arm64",
        fffNodeVersion: "0.9.4",
      }),
      {
        "@cursor/sdk": "1.0.22",
        "@ff-labs/fff-node": "0.9.4",
        "node-pty": "1.1.0",
        "@napi-rs/keyring": "1.3.0",
        "playwright-core": "1.60.0",
        "@ff-labs/fff-bin-darwin-arm64": "0.9.4",
      },
    );

    assert.deepStrictEqual(
      resolveMergedStageDependencies({
        platform: "linux",
        serverDependencies: { "@ff-labs/fff-node": "0.9.4", "node-pty": "1.1.0", effect: "4.0.0" },
        desktopDependencies: { "@crowecawcaw/xa11y": "0.13.0" },
        arch: "x64",
        fffNodeVersion: "0.9.4",
      }),
      {
        "@ff-labs/fff-node": "0.9.4",
        "node-pty": "1.1.0",
        "@crowecawcaw/xa11y": "0.13.0",
        "@ff-labs/fff-bin-linux-x64-gnu": "0.9.4",
        "@ff-labs/fff-bin-linux-x64-musl": "0.9.4",
      },
    );
  });

  it.effect("ships Cursor platform assets outside asar for spawning and native loading", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({ prefix: "fab-cursor-helpers-" });
        const nodeModules = path.join(root, "node_modules");
        const destination = path.join(root, "resources/node_modules/@cursor");
        const cursorDirectory = symlinksSupported
          ? path.join(root, "store/@cursor")
          : path.join(nodeModules, "@cursor");
        yield* fs.makeDirectory(path.join(cursorDirectory, "sdk"), { recursive: true });
        if (symlinksSupported) {
          yield* fs.makeDirectory(path.join(nodeModules, "@cursor"), { recursive: true });
          yield* fs.symlink(
            path.join(cursorDirectory, "sdk"),
            path.join(nodeModules, "@cursor/sdk"),
          );
        }
        const helpers = [
          "sdk-darwin-arm64/bin/rg",
          "sdk-darwin-arm64/bin/cursorsandbox",
          "sdk-darwin-arm64/vendor/tree-sitter/index.js",
          "sdk-darwin-arm64/vendor/tree-sitter/binding.node",
          "sdk-darwin-arm64/vendor/tree-sitter-bash/binding.node",
          "sdk-darwin-arm64/package.json",
          "sdk-linux-x64/bin/rg",
        ];
        for (const helper of helpers) {
          const source = path.join(cursorDirectory, helper);
          yield* fs.makeDirectory(path.dirname(source), { recursive: true });
          yield* fs.writeFileString(source, "fixture helper", { mode: 0o755 });
        }
        yield* stageCursorSdkPlatformPackages(nodeModules, destination);
        for (const helper of helpers) {
          assert.equal(yield* fs.readFileString(path.join(destination, helper)), "fixture helper");
          const packagedPath = `node_modules/@cursor/${helper}`;
          assert.isTrue(
            DESKTOP_FILE_EXCLUSIONS.some((glob) =>
              NodePath.matchesGlob(packagedPath, glob.slice(1)),
            ),
          );
        }
      }),
    ),
  );

  it.effect("refuses a Linux build on a host that cannot build the browser secret helper", () => {
    const commands: Array<{ readonly command: string }> = [];
    const spawnerLayer = Layer.succeed(
      ChildProcessSpawner.ChildProcessSpawner,
      ChildProcessSpawner.make((command) => {
        commands.push(command as unknown as (typeof commands)[number]);
        return Effect.succeed(mockProcess(0));
      }),
    );

    return Effect.gen(function* () {
      const error = yield* stageBrowserSecret({
        repoRoot: "/repo",
        stageResourcesDir: "/stage/resources",
        platform: "linux",
        arch: "x64",
        verbose: false,
      }).pipe(Effect.flip);
      assert.instanceOf(error, LinuxBrowserSecretHostError);
      assert.equal(error.hostPlatform, "darwin");
      assert.include(error.message, "Linux host");
      assert.lengthOf(commands, 0);
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          spawnerLayer,
          Layer.succeed(HostProcess.Platform, "darwin"),
          Layer.succeed(HostProcess.Architecture, "arm64"),
        ),
      ),
    );
  });

  it.effect("rejects a macOS app whose packaged server bundle cannot resolve", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeMacPayloadFixture({
          serverEntrySource: 'import "fab-deliberately-missing-package";\n',
        });
        const error = yield* validateMacPackagedPayload({
          stageDistDir: fixture.stageDistDir,
        }).pipe(Effect.flip);

        assert.instanceOf(error, BundleNotSelfContainedError);
        assert.include(error.output, "fab-deliberately-missing-package");
      }),
    ),
  );

  it.effect("accepts a macOS app whose packaged server bundle resolves", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fixture = yield* makeMacPayloadFixture({});
        yield* validateMacPackagedPayload({ stageDistDir: fixture.stageDistDir });
      }),
    ),
  );

  it.effect("rejects a macOS stage without a packaged app", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const stageDistDir = yield* fs.makeTempDirectoryScoped({ prefix: "fab-mac-payload-test-" });
        const error = yield* validateMacPackagedPayload({ stageDistDir }).pipe(Effect.flip);

        assert.instanceOf(error, MacPackagedAppMissingError);
      }),
    ),
  );

  it.effect("rejects a macOS app without app.asar", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const stageDistDir = yield* fs.makeTempDirectoryScoped({ prefix: "fab-mac-payload-test-" });
        yield* fs.makeDirectory(`${stageDistDir}/mac-arm64/Fab.app/Contents/Resources`, {
          recursive: true,
        });
        const error = yield* validateMacPackagedPayload({ stageDistDir }).pipe(Effect.flip);

        assert.instanceOf(error, BundleNotSelfContainedError);
      }),
    ),
  );

  it("resolves macOS passkey signing configuration and renders required entitlements", () => {
    const configuration = resolveMacPasskeySigningConfiguration({
      FAB_APPLE_TEAM_ID: "abc1234567",
      FAB_MACOS_PROVISIONING_PROFILE: "/tmp/fab.provisionprofile",
    });
    const entitlements = renderMacPasskeyEntitlements(configuration, {
      touchIdKeychainAccessGroup: undefined,
      browserPasskeys: false,
    });

    assert.deepStrictEqual(configuration, {
      appId: "dev.bhanji.fab",
      teamId: "ABC1234567",
      provisioningProfilePath: "/tmp/fab.provisionprofile",
    });
    assert.include(entitlements, "<string>ABC1234567.dev.bhanji.fab</string>");
    assert.include(entitlements, "<key>com.apple.security.cs.allow-jit</key>");
    assert.match(entitlements, /<key>com\.apple\.security\.device\.camera<\/key>\s*<true\/>/u);
    assert.match(entitlements, /<key>com\.apple\.security\.device\.audio-input<\/key>\s*<true\/>/u);
    assert.notInclude(entitlements, "associated-domains");
    assert.notInclude(entitlements, "keychain-access-groups");
    assert.notInclude(entitlements, "com.apple.developer.web-browser.public-key-credential");
  });

  it("grants in-app browser passkey entitlements only when the provisioning profile does", () => {
    const configuration = { appId: "dev.bhanji.fab", teamId: "ABC1234567" };
    const profile = (entitlements: string, outside = "") =>
      `0\x82\x1f\x9a\x06\t*\x86H<?xml version="1.0"?><plist version="1.0"><dict>${outside}<key>Entitlements</key><dict>${entitlements}</dict></dict></plist>\x00\x01`;
    const teamWildcardGroups = `<key>keychain-access-groups</key>
      <array>
        <string>ABC1234567.*</string>
        <string>com.apple.token</string>
      </array>`;

    assert.deepStrictEqual(resolveMacWebAuthnEntitlements(profile(""), configuration), {
      touchIdKeychainAccessGroup: undefined,
      browserPasskeys: false,
    });
    assert.deepStrictEqual(
      resolveMacWebAuthnEntitlements(
        profile("<key>keychain-access-groups</key><array><string>OTHERTEAM1.*</string></array>"),
        configuration,
      ),
      { touchIdKeychainAccessGroup: undefined, browserPasskeys: false },
    );
    assert.deepStrictEqual(
      resolveMacWebAuthnEntitlements(
        profile(
          `<!-- ${teamWildcardGroups}
          <key>com.apple.developer.web-browser.public-key-credential</key><true/> -->
          <key>com.apple.developer.web-browser.public-key-credential</key><false/>`,
          teamWildcardGroups,
        ),
        configuration,
      ),
      { touchIdKeychainAccessGroup: undefined, browserPasskeys: false },
    );
    assert.deepStrictEqual(
      resolveMacWebAuthnEntitlements(
        profile(
          `${teamWildcardGroups}
          <key>com.apple.developer.web-browser.public-key-credential</key>
          <true/>`,
        ),
        configuration,
      ),
      {
        touchIdKeychainAccessGroup: "ABC1234567.dev.bhanji.fab.webauthn",
        browserPasskeys: true,
      },
    );

    const entitlements = renderMacPasskeyEntitlements(
      { ...configuration, provisioningProfilePath: "" },
      resolveMacWebAuthnEntitlements(
        profile(
          `${teamWildcardGroups}<key>com.apple.developer.web-browser.public-key-credential</key><true/>`,
        ),
        configuration,
      ),
    );
    assert.match(
      entitlements,
      /<key>keychain-access-groups<\/key>\s*<array>\s*<string>ABC1234567\.dev\.bhanji\.fab\.webauthn<\/string>\s*<\/array>/u,
    );
    assert.match(
      entitlements,
      /<key>com\.apple\.developer\.web-browser\.public-key-credential<\/key>\s*<true\/>/u,
    );
  });

  it("rejects incomplete macOS passkey signing configuration", () => {
    const captureError = (env: Readonly<Record<string, string | undefined>>) => {
      try {
        resolveMacPasskeySigningConfiguration(env);
      } catch (error) {
        return error;
      }
      return assert.fail("Expected passkey signing configuration to fail.");
    };

    const missingProfileError = captureError({ FAB_APPLE_TEAM_ID: "ABC1234567" });
    assert.instanceOf(missingProfileError, MissingMacPasskeyProvisioningProfileError);
    assert.equal(
      missingProfileError.message,
      "FAB_MACOS_PROVISIONING_PROFILE must point to the app's macOS provisioning profile.",
    );
  });

  it("wraps unknown passkey signing configuration defects without copying cause text", () => {
    const secret = "do-not-retain";
    const cause = new Error(secret);
    const error = MacPasskeySigningConfigurationResolutionError.fromCause(cause);

    assert.instanceOf(error, MacPasskeySigningConfigurationResolutionError);
    assert.strictEqual(error.cause, cause);
    assert.equal(error.message, "Failed to resolve macOS passkey signing configuration.");
    assert.notInclude(error.message, secret);
  });

  it.effect("rejects universal builds on Linux before staging binaries", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        resolveBuildOptions({
          platform: Option.some("linux"),
          target: Option.none(),
          arch: Option.some("universal"),
          buildVersion: Option.none(),
          outputDir: Option.none(),
          skipBuild: Option.none(),
          keepStage: Option.none(),
          signed: Option.none(),
          verbose: Option.none(),
          mockUpdates: Option.none(),
          mockUpdateServerPort: Option.none(),
        }),
      );

      assert.instanceOf(error, UnsupportedDesktopBuildArchitectureError);
      assert.deepStrictEqual(error.supportedArchitectures, ["x64", "arm64"]);
    }),
  );

  it.effect("preserves explicit false boolean flags over true env defaults", () =>
    Effect.gen(function* () {
      const resolved = yield* resolveBuildOptions({
        platform: Option.some("mac"),
        target: Option.none(),
        arch: Option.some("arm64"),
        buildVersion: Option.none(),
        outputDir: Option.some("release-test"),
        skipBuild: Option.some(false),
        keepStage: Option.some(false),
        signed: Option.some(false),
        verbose: Option.some(false),
        mockUpdates: Option.some(false),
        mockUpdateServerPort: Option.none(),
      }).pipe(
        Effect.provide(
          ConfigProvider.layer(
            ConfigProvider.fromEnv({
              env: {
                FAB_DESKTOP_SKIP_BUILD: "true",
                FAB_DESKTOP_KEEP_STAGE: "true",
                FAB_DESKTOP_SIGNED: "true",
                FAB_DESKTOP_VERBOSE: "true",
                FAB_DESKTOP_MOCK_UPDATES: "true",
              },
            }),
          ),
        ),
      );

      assert.equal(resolved.skipBuild, false);
      assert.equal(resolved.keepStage, false);
      assert.equal(resolved.signed, false);
      assert.equal(resolved.verbose, false);
      assert.equal(resolved.mockUpdates, false);
    }),
  );
});

it.effect.skipIf(!symlinksSupported)("rebases packaged links into the isolated tree", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "fab-copy-symlinks-" });
    const source = path.join(root, "source");
    const destination = path.join(root, "destination");
    const packageDir = path.join(source, "node_modules/.pnpm/example@1/node_modules/example");
    const relativePackageLink = path.join(source, "node_modules/example-relative");
    const absolutePackageLink = path.join(source, "node_modules/example-absolute");

    yield* fs.makeDirectory(packageDir, { recursive: true });
    yield* fs.writeFileString(path.join(packageDir, "index.js"), "module.exports = true;\n");
    yield* fs.symlink(
      path.join(".pnpm", "example@1", "node_modules", "example"),
      relativePackageLink,
    );
    yield* fs.symlink(packageDir, absolutePackageLink);

    yield* copyDirectoryPreservingSymlinks(source, destination);

    const copiedPackage = path.join(
      destination,
      "node_modules/.pnpm/example@1/node_modules/example",
    );
    const resolvedCopiedPackage = yield* fs.realPath(copiedPackage);
    assert.equal(
      yield* fs.readLink(path.join(destination, "node_modules/example-relative")),
      copiedPackage,
    );
    assert.equal(
      yield* fs.readLink(path.join(destination, "node_modules/example-absolute")),
      copiedPackage,
    );
    assert.equal(
      yield* fs.realPath(path.join(destination, "node_modules/example-relative")),
      resolvedCopiedPackage,
    );
    assert.equal(
      yield* fs.realPath(path.join(destination, "node_modules/example-absolute")),
      resolvedCopiedPackage,
    );
  }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect("preserves packaged app directories from the dir target", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "fab-dir-artifact-" });
    const stage = path.join(root, "stage");
    const output = path.join(root, "output");
    const app = path.join("mac-arm64", "Fab.app", "Contents");
    yield* fs.makeDirectory(path.join(stage, app), { recursive: true });
    yield* fs.writeFileString(path.join(stage, app, "Info.plist"), "built-app");
    yield* fs.writeFileString(path.join(stage, "builder-debug.yml"), "debug");
    const copied = yield* copyDesktopBuildArtifacts(stage, output, true);
    assert.include(copied, path.join(output, "mac-arm64"));
    assert.equal(yield* fs.readFileString(path.join(output, app, "Info.plist")), "built-app");
    assert.equal(yield* fs.readFileString(path.join(stage, app, "Info.plist")), "built-app");
    yield* fs.remove(path.join(stage, app, "Info.plist"));
    yield* fs.writeFileString(path.join(stage, app, "New.plist"), "rebuilt-app");
    yield* copyDesktopBuildArtifacts(stage, output, true);
    assert.isFalse(yield* fs.exists(path.join(output, app, "Info.plist")));
    assert.equal(yield* fs.readFileString(path.join(output, app, "New.plist")), "rebuilt-app");
    const filesOnly = yield* copyDesktopBuildArtifacts(stage, path.join(root, "files-only"));
    assert.deepEqual(filesOnly, [path.join(root, "files-only", "builder-debug.yml")]);
    assert.isFalse(yield* fs.exists(path.join(root, "files-only", "mac-arm64")));
    yield* fs.remove(path.join(stage, "mac-arm64"), { recursive: true });
    yield* fs.writeFileString(path.join(stage, "mac-arm64"), "flattened");
    yield* copyDesktopBuildArtifacts(stage, output, true);
    assert.equal(yield* fs.readFileString(path.join(output, "mac-arm64")), "flattened");
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
);

it.effect.skipIf(!symlinksSupported)("preserves relative links when replacing dir artifacts", () =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const root = yield* fs.makeTempDirectoryScoped({ prefix: "fab-dir-artifact-links-" });
    const stage = path.join(root, "stage");
    const output = path.join(root, "output");
    const app = path.join("mac-arm64", "Fab.app", "Contents");
    yield* fs.makeDirectory(path.join(stage, app), { recursive: true });
    yield* fs.writeFileString(path.join(stage, app, "Info.plist"), "built-app");
    yield* fs.symlink("Info.plist", path.join(stage, app, "Current"));
    yield* copyDesktopBuildArtifacts(stage, output, true);
    assert.equal(yield* fs.readLink(path.join(output, app, "Current")), "Info.plist");
    assert.equal(yield* fs.readFileString(path.join(output, app, "Current")), "built-app");

    yield* fs.remove(path.join(stage, app, "Current"));
    yield* fs.writeFileString(path.join(stage, app, "New.plist"), "rebuilt-app");
    yield* fs.symlink("New.plist", path.join(stage, app, "Current"));
    yield* copyDesktopBuildArtifacts(stage, output, true);
    assert.equal(yield* fs.readLink(path.join(output, app, "Current")), "New.plist");
    assert.equal(yield* fs.readFileString(path.join(output, app, "Current")), "rebuilt-app");
  }).pipe(Effect.provide(NodeServices.layer), Effect.scoped),
);
