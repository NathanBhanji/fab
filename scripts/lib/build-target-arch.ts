import * as HostProcess from "@fab/shared/HostProcess";
import * as Effect from "effect/Effect";

type BuildArch = "arm64" | "x64" | "universal";

interface PlatformConfig {
  readonly archChoices: ReadonlyArray<BuildArch>;
}

export const getDefaultBuildArch = Effect.fn("getDefaultBuildArch")(function* (
  platformConfig: PlatformConfig,
) {
  const processArch = yield* HostProcess.Architecture;
  const hostArch = processArch === "arm64" || processArch === "x64" ? processArch : undefined;
  if (hostArch && platformConfig.archChoices.includes(hostArch)) {
    return hostArch;
  }

  return platformConfig.archChoices[0] ?? "x64";
});
