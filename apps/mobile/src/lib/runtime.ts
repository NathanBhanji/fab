import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as ManagedRuntime from "effect/ManagedRuntime";
import * as Socket from "effect/socket/Socket";
import * as ExpoCrypto from "expo-crypto";

import { layerRemoteHttpClient } from "@fab/client-runtime/rpc";

import * as Persistence from "../persistence/layer";
import { disposeOnFoundationReplace, type FoundationHotModule } from "./foundation-fast-refresh";
import { whenProtectedDataAvailable } from "./protectedData";

declare const module: { readonly hot?: FoundationHotModule } | undefined;

const layerHttpClient = layerRemoteHttpClient(fetch);
const layerSecureRandom = Layer.succeed(
  SecureRandom.SecureRandom,
  SecureRandom.make(ExpoCrypto.getRandomBytes),
);

type RuntimeLayerSource =
  | typeof Socket.layerWebSocketConstructorGlobal
  | typeof layerHttpClient
  | typeof layerSecureRandom
  | typeof Persistence.layer;

const layerRuntime = Socket.layerWebSocketConstructorGlobal.pipe(
  Layer.provideMerge(layerHttpClient),
  Layer.provideMerge(layerSecureRandom),
  Layer.provideMerge(Persistence.layer),
  // These layers read the keychain and the database while they build, and a
  // failed build is kept for the life of the process.
  Layer.provide(Layer.effectDiscard(Effect.promise(whenProtectedDataAvailable))),
);

export const runtime: ManagedRuntime.ManagedRuntime<
  Layer.Success<RuntimeLayerSource>,
  Layer.Error<RuntimeLayerSource>
> = ManagedRuntime.make(layerRuntime);

export const layer: Layer.Layer<
  Layer.Success<RuntimeLayerSource>,
  Layer.Error<RuntimeLayerSource>
> = Layer.effectContext(runtime.contextEffect);

disposeOnFoundationReplace(typeof module === "undefined" ? undefined : module.hot, () =>
  runtime.dispose(),
);
