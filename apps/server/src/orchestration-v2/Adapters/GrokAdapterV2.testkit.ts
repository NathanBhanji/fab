import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { GrokSettings } from "@fab/provider-grok/settings";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";
import { resolveSelfInvocation } from "@fab/shared/nodeRuntime";

import * as TestProviderHost from "@fab/provider-testing/TestProviderHost";
import { GROK_ACP_CANCEL_META, GROK_ACP_INITIALIZE_META } from "@fab/provider-grok/testing";
import { makeXAiPromptCompletionRuntime } from "@fab/provider-grok/testing";
import * as IdAllocator from "@fab/provider-core/server/IdAllocator";
import * as ProviderContinuationRequests from "@fab/provider-core/server/ProviderContinuationRequests";
import * as ProviderAdapterRegistry from "../ProviderAdapterRegistry.ts";
import type { ProviderReplayGate } from "@fab/provider-testing/replayGate";
import type { OrchestratorV2ProviderReplayHarness } from "../testkit/ProviderReplayHarness.ts";
import {
  type AcpReplayTranscript,
  AcpReplayTranscriptDecodeError,
  decodeAcpReplayTranscript,
  makeAcpReplayCompletenessAssertion,
  makeAcpReplayRuntime,
} from "./AcpAdapterV2.testkit.ts";
import {
  GROK_DEFAULT_INSTANCE_ID,
  GROK_PROVIDER,
  makeGrokAdapterV2,
} from "@fab/provider-grok/testing";

const DEFAULT_GROK_SETTINGS = Schema.decodeSync(GrokSettings)({});

function layerGrokProviderAdapterRegistryReplay(
  transcript: AcpReplayTranscript,
  options: { readonly replayGate?: ProviderReplayGate } = {},
) {
  const layerHost = TestProviderHost.layer().pipe(
    Layer.provide(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)),
  );

  return ProviderAdapterRegistry.layerFromAdaptersEffect(
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const continuationRequests = yield* ProviderContinuationRequests.ProviderContinuationRequests;
      const replayGate = options.replayGate;
      const replayDir = yield* fileSystem
        .makeTempDirectory({
          prefix: `fab-orchestration-v2-grok-replay-${transcript.scenario}-`,
        })
        .pipe(Effect.orDie);
      const statusPath = path.join(replayDir, "status.json");
      const scriptPath = yield* path
        .fromFileUrl(new URL("../../../scripts/acp-replay-agent.ts", import.meta.url))
        .pipe(Effect.orDie);
      const adapter = yield* makeGrokAdapterV2({
        instanceId: GROK_DEFAULT_INSTANCE_ID,
        settings: DEFAULT_GROK_SETTINGS,
        environment: {},
        selfInvocation: yield* resolveSelfInvocation(),
        makeRuntime: (runtimeInput) =>
          makeAcpReplayRuntime({
            transcript,
            statusPath,
            scriptPath,
            childProcessSpawner,
            fileSystem,
            ...(replayGate === undefined ? {} : { replayGate }),
            cancelMeta: GROK_ACP_CANCEL_META,
            initializeMeta: GROK_ACP_INITIALIZE_META,
          })(runtimeInput).pipe(Effect.flatMap(makeXAiPromptCompletionRuntime)),
        continuationRequests,
        assertComplete: makeAcpReplayCompletenessAssertion(fileSystem, statusPath, transcript),
        ...(replayGate === undefined
          ? {}
          : {
              testHooks: {
                onDeferredFinalizeScheduled: (debounce) =>
                  Effect.sync(() => replayGate.recordFinishArmed(debounce)),
              },
            }),
      });
      return [adapter];
    }),
  ).pipe(
    Layer.provide(
      Layer.mergeAll(layerHost, NodeServices.layer, NodeCrypto.layer, IdAllocator.layer),
    ),
    // Held inbound lines must not outlive the scenario and wedge teardown.
    Layer.merge(
      Layer.effectDiscard(
        Effect.addFinalizer(() => Effect.sync(() => options.replayGate?.releaseAll())),
      ),
    ),
  );
}

export const GrokOrchestratorReplayHarness: OrchestratorV2ProviderReplayHarness<
  AcpReplayTranscript,
  AcpReplayTranscriptDecodeError
> = {
  driver: GROK_PROVIDER,
  decodeTranscript: (transcript) => decodeAcpReplayTranscript(transcript, GROK_PROVIDER),
  makeProviderAdapterRegistryLayer: layerGrokProviderAdapterRegistryReplay,
};
