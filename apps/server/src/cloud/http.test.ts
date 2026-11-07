import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import {
  AuthAccessTokenType,
  AuthEnvironmentBootstrapTokenType,
  AuthTokenExchangeGrantType,
  EnvironmentHttpApi,
  EnvironmentId,
} from "@fab/contracts";
import { RelayEnvironmentLinkProofPayload, type RelayLinkProofRequest } from "@fab/contracts/relay";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { HttpClient, HttpServer } from "effect/http";
import * as Etag from "effect/http/Etag";
import * as HttpPlatform from "effect/http/HttpPlatform";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpApi from "effect/http-api/HttpApi";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import * as NetAddress from "effect/net/NetAddress";
import { decodeJwt, importSPKI, jwtVerify } from "jose";
import { RELAY_LINK_PROOF_TYP } from "@fab/shared/relayJwt";

import * as EnvironmentAuth from "../auth/EnvironmentAuth.ts";
import * as AuthHttp from "../auth/http.ts";
import * as ServerSecretStore from "../auth/ServerSecretStore.ts";
import * as ServerConfig from "../config.ts";
import * as ServerEnvironment from "../environment/ServerEnvironment.ts";
import * as SqlitePersistence from "../persistence/Sqlite.ts";
import * as AgentAwarenessRelay from "../relay/AgentAwarenessRelay.ts";
import * as CliTokenManager from "./CliTokenManager.ts";
import * as CloudLink from "./CloudLink.ts";
import * as ConnectHttp from "./http.ts";
import * as ConnectReachability from "./ConnectReachability.ts";
import * as ManagedEndpointRuntime from "./ManagedEndpointRuntime.ts";
import * as ManagedPolicy from "../policy/ManagedPolicy.ts";

const DESKTOP_BOOTSTRAP_TOKEN = "test-desktop-bootstrap-token";
const NON_LOOPBACK_ORIGIN = "http://172.24.162.233:3773";
const LOOPBACK_ORIGIN = "http://127.0.0.1:3773";
const proofRequest: RelayLinkProofRequest = {
  challenge: "test-challenge",
  relayIssuer: "https://relay.example.test",
  endpoint: {
    providerKind: "cloudflare_tunnel",
    httpBaseUrl: "https://environment.example.test",
    wsBaseUrl: "wss://environment.example.test",
  },
  origin: { localHttpHost: "127.0.0.1", localHttpPort: 3773 },
};
const decodeLinkProofPayload = Schema.decodeUnknownSync(RelayEnvironmentLinkProofPayload);

class LinkProofTestApi extends HttpApi.make("environment").add(
  EnvironmentHttpApi.groups.auth,
  EnvironmentHttpApi.groups.connect,
) {}

const layerConfig = Layer.effect(
  ServerConfig.ServerConfig,
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    return {
      ...config,
      mode: "desktop" as const,
      host: "0.0.0.0",
      port: 3773,
      desktopBootstrapToken: DESKTOP_BOOTSTRAP_TOKEN,
    };
  }),
).pipe(Layer.provide(ServerConfig.layerTest(process.cwd(), { prefix: "fab-link-proof-test-" })));

// Real credential issuance, verification, origin checks and signing; no relay or tunnel is started.
const layerLinkProofRoutes = HttpApiBuilder.layer(LinkProofTestApi).pipe(
  Layer.provide([AuthHttp.layer, ConnectHttp.layer]),
  Layer.provide(AuthHttp.layerAuthenticatedAuth),
  Layer.provide(CloudLink.layer),
  Layer.provide(
    Layer.mock(ConnectReachability.ConnectReachability)({ latest: Effect.succeedNone }),
  ),
  Layer.provide(EnvironmentAuth.layer),
  Layer.provide([
    ManagedPolicy.layerTest(),
    SqlitePersistence.layerMemory,
    ServerEnvironment.layerIdentity,
    Layer.mock(ServerEnvironment.ServerEnvironment)({
      getDescriptor: Effect.succeed({
        environmentId: EnvironmentId.make("test-environment"),
        label: "Test",
        platform: { os: "linux", arch: "x64" },
        serverVersion: "0.0.0-test",
        capabilities: { repositoryIdentity: false },
      }),
    }),
    Layer.mock(ManagedEndpointRuntime.CloudManagedEndpointRuntime)({}),
    Layer.mock(CliTokenManager.CloudCliTokenManager)({}),
    Layer.mock(AgentAwarenessRelay.AgentAwarenessRelay)({}),
    Layer.mock(HttpServer.HttpServer)({
      address: NetAddress.inetAddressFromIpStringUnsafe("0.0.0.0", 3773),
    }),
    Layer.succeed(
      HttpClient.HttpClient,
      HttpClient.make(() => Effect.die("Unexpected relay call")),
    ),
  ]),
  Layer.provideMerge(ServerSecretStore.layer),
  Layer.provide(layerConfig),
  Layer.provideMerge(HttpPlatform.layer.pipe(Layer.provideMerge(Etag.layerWeak))),
  Layer.provideMerge(Layer.mergeAll(NodeServices.layer, NodeCrypto.layer)),
);

const withLinkProofClient = async (
  body: (client: {
    post: (
      path: string,
      payload: unknown,
      headers?: Record<string, string>,
      origin?: string,
    ) => Promise<Response>;
    exchange: (credential: string, scope?: string) => Promise<string>;
  }) => Promise<void>,
) => {
  const { handler, dispose } = HttpRouter.toWebHandler(layerLinkProofRoutes, {
    disableLogger: true,
  });
  const post = (
    path: string,
    payload: unknown,
    headers?: Record<string, string>,
    origin = LOOPBACK_ORIGIN,
  ) =>
    handler(
      new Request(`${origin}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(payload),
      }),
    );
  const exchange = async (credential: string, scope?: string) => {
    const response = await handler(
      new Request(`${LOOPBACK_ORIGIN}/oauth/token`, {
        method: "POST",
        body: new URLSearchParams({
          grant_type: AuthTokenExchangeGrantType,
          subject_token: credential,
          subject_token_type: AuthEnvironmentBootstrapTokenType,
          requested_token_type: AuthAccessTokenType,
          ...(scope ? { scope } : {}),
        }),
      }),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { access_token: string };
    return payload.access_token;
  };
  try {
    await body({ post, exchange });
  } finally {
    await dispose();
  }
};

describe("link proof", () => {
  it("signs a loopback tunnel origin after desktop bootstrap token exchange", () =>
    withLinkProofClient(async ({ post, exchange }) => {
      const token = await exchange(DESKTOP_BOOTSTRAP_TOKEN);
      const response = await post("/api/connect/link-proof", proofRequest, {
        authorization: `Bearer ${token}`,
      });
      expect(response.status).toBe(200);
      const proof = (await response.json()) as string;
      const payload = decodeLinkProofPayload(decodeJwt(proof));
      const verified = await jwtVerify(
        proof,
        await importSPKI(payload.environmentPublicKey, "EdDSA"),
        {
          algorithms: ["EdDSA"],
          typ: RELAY_LINK_PROOF_TYP,
          issuer: "fab-env:test-environment",
          audience: proofRequest.relayIssuer,
        },
      );
      expect(verified.payload).toMatchObject({
        origin: proofRequest.origin,
        endpoint: proofRequest.endpoint,
        challenge: proofRequest.challenge,
      });
      expect(response.headers.get("cache-control")).toBe("no-store");
    }));

  it.each([
    {
      name: "non-loopback request host",
      origin: proofRequest.origin,
      headers: {},
      requestOrigin: NON_LOOPBACK_ORIGIN,
    },
    {
      name: "non-loopback tunnel origin",
      origin: { localHttpHost: "172.24.162.233", localHttpPort: 3773 },
      headers: {},
    },
    {
      name: "mismatched port",
      origin: { localHttpHost: "127.0.0.1", localHttpPort: 3774 },
      headers: {},
    },
    {
      name: "forwarded host",
      origin: proofRequest.origin,
      headers: { "x-forwarded-host": "127.0.0.1:3773" },
    },
    {
      name: "forwarded protocol",
      origin: proofRequest.origin,
      headers: { "x-forwarded-proto": "http" },
    },
  ])("rejects $name even for desktop bootstrap", ({ origin, headers, requestOrigin }) =>
    withLinkProofClient(async ({ post, exchange }) => {
      const token = await exchange(DESKTOP_BOOTSTRAP_TOKEN);
      const response = await post(
        "/api/connect/link-proof",
        { ...proofRequest, origin },
        { ...headers, authorization: `Bearer ${token}` },
        requestOrigin,
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ message: "Invalid managed endpoint origin." });
    }),
  );

  it("requires relay-write scope even for desktop bootstrap", () =>
    withLinkProofClient(async ({ post, exchange }) => {
      const token = await exchange(DESKTOP_BOOTSTRAP_TOKEN, "relay:read");
      const response = await post("/api/connect/link-proof", proofRequest, {
        authorization: `Bearer ${token}`,
      });
      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({
        code: "insufficient_scope",
        requiredScope: "relay:write",
      });
    }));

  it("rejects unauthenticated requests", () =>
    withLinkProofClient(async ({ post }) => {
      const response = await post("/api/connect/link-proof", proofRequest);
      expect(response.status).toBe(401);
    }));
});
