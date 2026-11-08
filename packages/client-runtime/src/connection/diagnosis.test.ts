import { describe, expect, it } from "@effect/vitest";

import { presentConnectionDiagnosis } from "./diagnosis.ts";
import { mapRemoteEnvironmentError } from "./errors.ts";
import {
  AVAILABLE_CONNECTION_STATE,
  ConnectionBlockedError,
  type ConnectionAttemptError,
  type SupervisorConnectionState,
} from "./model.ts";
import { RemoteEnvironmentAuthFetchError } from "../rpc/http.ts";

const backoff = (lastFailure: ConnectionAttemptError): SupervisorConnectionState => ({
  ...AVAILABLE_CONNECTION_STATE,
  desired: true,
  network: "online",
  phase: "backoff",
  attempt: 3,
  lastFailure,
  retryAt: Date.UTC(2026, 9, 19, 12, 0, 30),
});

const diagnose = (state: SupervisorConnectionState) =>
  presentConnectionDiagnosis({ hostLabel: "Mac mini", state });

const results = (state: SupervisorConnectionState) =>
  diagnose(state)?.hops.map((hop) => `${hop.hop}:${hop.result}`);

describe("presentConnectionDiagnosis", () => {
  it("blames Fab on the host when it cannot be reached", () => {
    const failure = mapRemoteEnvironmentError(
      new RemoteEnvironmentAuthFetchError({ message: "Failed to fetch", cause: new TypeError() }),
    );
    expect(diagnose(backoff(failure))?.headline).toBe("Fab on Mac mini did not answer");
    expect(results(backoff(failure))).toEqual(["device:ok", "server:failed"]);
  });

  it("reports this device as offline before any other hop", () => {
    const failure = mapRemoteEnvironmentError(
      new RemoteEnvironmentAuthFetchError({ message: "Failed to fetch", cause: new TypeError() }),
    );
    const state = { ...backoff(failure), network: "offline" as const };
    expect(diagnose(state)?.headline).toBe("This device is offline");
    expect(results(state)?.[0]).toBe("device:failed");
  });

  it("returns nothing before any attempt fails", () => {
    expect(diagnose(AVAILABLE_CONNECTION_STATE)).toBeNull();
  });

  it("does not report hops as working when the failure names none", () => {
    const failure = new ConnectionBlockedError({
      reason: "authentication",
      detail: "The environment credential is invalid.",
    });
    expect(results(backoff(failure))).not.toContainEqual(expect.stringMatching(/:ok$/));
  });
});
