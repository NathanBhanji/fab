import { EnvironmentId } from "@fab/contracts";
import { RelayManagedEndpoint } from "@fab/contracts/relay";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import type { ConnectionAttemptError } from "../connection/model.ts";

export class RemoteDpopAccessToken extends Schema.Class<RemoteDpopAccessToken>(
  "@fab/client-runtime/authorization/RemoteDpopAccessToken",
)({
  environmentId: EnvironmentId,
  accountId: Schema.optionalKey(Schema.String),
  label: Schema.String,
  endpoint: RelayManagedEndpoint,
  accessToken: Schema.String,
  expiresAtEpochMs: Schema.Number,
  dpopThumbprint: Schema.String,
}) {}

export class RemoteDpopAccessTokenStore extends Context.Service<
  RemoteDpopAccessTokenStore,
  {
    readonly get: (
      environmentId: EnvironmentId,
    ) => Effect.Effect<Option.Option<RemoteDpopAccessToken>, ConnectionAttemptError>;
    readonly put: (token: RemoteDpopAccessToken) => Effect.Effect<void, ConnectionAttemptError>;
    readonly remove: (environmentId: EnvironmentId) => Effect.Effect<void, ConnectionAttemptError>;
  }
>()("@fab/client-runtime/authorization/tokenStore/RemoteDpopAccessTokenStore") {}

export const make = (service: RemoteDpopAccessTokenStore["Service"]) =>
  RemoteDpopAccessTokenStore.of(service);
