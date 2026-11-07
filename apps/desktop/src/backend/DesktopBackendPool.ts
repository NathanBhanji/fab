import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as SubscriptionRef from "effect/SubscriptionRef";

import * as DesktopBackendConfiguration from "./DesktopBackendConfiguration.ts";
import * as DesktopBackendManager from "./DesktopBackendManager.ts";
import * as DesktopObservability from "../app/DesktopObservability.ts";
import * as DesktopState from "../app/DesktopState.ts";
import * as DesktopWindow from "../window/DesktopWindow.ts";
import * as ElectronDialog from "../electron/ElectronDialog.ts";
import * as ElectronApp from "../electron/ElectronApp.ts";

const { logWarning: logBackendPoolWarning } =
  DesktopObservability.makeComponentLogger("desktop-backend-pool");

export type BackendInstanceId = DesktopBackendManager.BackendInstanceId;
export const BackendInstanceId = DesktopBackendManager.BackendInstanceId;
export const PRIMARY_INSTANCE_ID = DesktopBackendManager.PRIMARY_INSTANCE_ID;
export type DesktopBackendInstance = DesktopBackendManager.DesktopBackendInstance;

export class DesktopBackendPool extends Context.Service<
  DesktopBackendPool,
  {
    readonly get: (id: BackendInstanceId) => Effect.Effect<Option.Option<DesktopBackendInstance>>;
    readonly list: Effect.Effect<readonly DesktopBackendInstance[]>;
    readonly primary: Effect.Effect<DesktopBackendInstance>;
  }
>()("@fab/desktop/backend/DesktopBackendPool") {}

export const layer = Layer.effect(
  DesktopBackendPool,
  Effect.gen(function* () {
    const configuration = yield* DesktopBackendConfiguration.DesktopBackendConfiguration;
    const desktopWindow = yield* DesktopWindow.DesktopWindow;
    const electronDialog = yield* ElectronDialog.ElectronDialog;
    const electronApp = yield* ElectronApp.ElectronApp;
    const { primaryBackendStartup } = yield* DesktopState.DesktopState;

    const primary = yield* DesktopBackendManager.makeBackendInstance({
      id: DesktopBackendManager.PRIMARY_INSTANCE_ID,
      // Resolve lazily: startup loads persisted settings after pool initialization.
      label: configuration.resolvePrimaryLabel,
      configResolve: configuration.resolvePrimary,
      // Absorb window errors so readiness can reset restartAttempt.
      onReady: (httpBaseUrl) =>
        desktopWindow.handleBackendReady(httpBaseUrl).pipe(
          // Only once the main window exists, so the recovery window never closes into nothing.
          Effect.andThen(SubscriptionRef.set(primaryBackendStartup, { _tag: "Ready" })),
          Effect.catch((error) =>
            logBackendPoolWarning("failed to open main window after backend readiness", {
              error: error.message,
            }),
          ),
        ),
      onStartupFailure: (failure) =>
        SubscriptionRef.set(primaryBackendStartup, { _tag: "Failing", ...failure }),
      onShutdown: () => desktopWindow.handleBackendNotReady,
      onStateDirOwned: () =>
        electronDialog
          .showErrorBox(
            "This Fab home is unavailable",
            "Another Fab server, such as the background service, is using this data directory, or an older background service is set up for it. Stop that server or try `fab update`. If the older launcher cannot update, run `fab service uninstall` and optionally reinstall with `fab service install` from a current CLI. Use `npx fab@latest` if `fab` is missing or outdated, and pass `--base-dir` with the service's Fab home to each command. Then reopen Fab. You can also set a separate FAB_HOME and pair with the running server.",
          )
          .pipe(Effect.andThen(electronApp.quit)),
    });

    return DesktopBackendPool.of({
      get: Effect.fn("DesktopBackendPool.get")(function (id) {
        return Effect.succeed(id === primary.id ? Option.some(primary) : Option.none());
      }),
      list: Effect.succeed([primary]),
      primary: Effect.succeed(primary),
    });
  }),
);

export const layerTest = (
  instances: readonly DesktopBackendInstance[],
): Layer.Layer<DesktopBackendPool> =>
  Layer.effect(
    DesktopBackendPool,
    Effect.gen(function* () {
      if (instances.length === 0) {
        return yield* Effect.die("DesktopBackendPool.layerTest requires at least one instance");
      }
      const byId = new Map<BackendInstanceId, DesktopBackendInstance>(
        instances.map((instance) => [instance.id, instance] as const),
      );
      const primary = instances[0]!;
      return DesktopBackendPool.of({
        get: Effect.fn("DesktopBackendPool.get")(function (id) {
          return Effect.succeed(Option.fromNullishOr(byId.get(id)));
        }),
        list: Effect.succeed(Array.from(byId.values())),
        primary: Effect.succeed(primary),
      });
    }),
  );
