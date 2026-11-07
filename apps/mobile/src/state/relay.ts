import { createRelayEnvironmentDiscoveryAtoms } from "@fab/client-runtime/state/relay";

import { connectionAtomRuntime } from "../connection/runtime";

export const relayEnvironmentDiscovery =
  createRelayEnvironmentDiscoveryAtoms(connectionAtomRuntime);
