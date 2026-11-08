import { EnvironmentId } from "@fab/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import {
  BearerConnectionCredential,
  BearerConnectionProfile,
  BearerConnectionRegistration,
  SshConnectionProfile,
  SshConnectionRegistration,
} from "../connection/catalog.ts";
import {
  BearerConnectionTarget,
  ConnectionTransientError,
  PrimaryConnectionTarget,
  SshConnectionTarget,
} from "../connection/model.ts";
import {
  PullRequestRoutingPermissions,
  makePullRequestRoutingPermissions,
} from "../connection/pullRequestRoutingPermissions.ts";
import {
  ConnectionCatalogDocument,
  EMPTY_CONNECTION_CATALOG_DOCUMENT,
  catalogRoutes,
  setRoutesInCatalog,
  registerConnectionInCatalog,
  removeConnectionFromCatalog,
  setConnectionEnabledInCatalog,
} from "./storageDocument.ts";

const decodeConnectionCatalogDocument = Schema.decodeUnknownEffect(ConnectionCatalogDocument);

const ENVIRONMENT_ID = EnvironmentId.make("environment-1");
const decodeCatalogDocument = Schema.decodeUnknownSync(ConnectionCatalogDocument);

const BEARER_TARGET = new BearerConnectionTarget({
  environmentId: ENVIRONMENT_ID,
  label: "Remote",
  connectionId: "bearer-1",
});
const BEARER_PROFILE = new BearerConnectionProfile({
  connectionId: BEARER_TARGET.connectionId,
  environmentId: ENVIRONMENT_ID,
  label: BEARER_TARGET.label,
  httpBaseUrl: "https://remote.example.test",
  wsBaseUrl: "wss://remote.example.test",
});
const BEARER_CREDENTIAL = new BearerConnectionCredential({
  token: "bearer-token",
});
const SSH_TARGET = new SshConnectionTarget({
  environmentId: ENVIRONMENT_ID,
  label: "SSH",
  connectionId: "ssh-1",
});
const SSH_PROFILE = new SshConnectionProfile({
  connectionId: SSH_TARGET.connectionId,
  environmentId: ENVIRONMENT_ID,
  label: SSH_TARGET.label,
  target: { alias: "devbox", hostname: "devbox.example.test", username: "developer", port: 22 },
});
const SSH_CREDENTIAL = new BearerConnectionCredential({ token: "ssh-token" });
const BEARER_REGISTRATION = new BearerConnectionRegistration({
  target: BEARER_TARGET,
  profile: BEARER_PROFILE,
  credential: BEARER_CREDENTIAL,
});
const SSH_REGISTRATION = new SshConnectionRegistration({
  target: SSH_TARGET,
  profile: SSH_PROFILE,
  credential: SSH_CREDENTIAL,
});

describe("ConnectionCatalogDocument", () => {
  it.effect("persists explicit GitHub trust and forgets it when a connection is removed", () =>
    Effect.gen(function* () {
      let document = EMPTY_CONNECTION_CATALOG_DOCUMENT;
      const entry = { target: BEARER_TARGET, profile: Option.some(BEARER_PROFILE), enabled: true };
      const storage = {
        read: Effect.sync(() => document.githubRoutingPermissions ?? []),
        write: (githubRoutingPermissions: NonNullable<typeof document.githubRoutingPermissions>) =>
          Effect.gen(function* () {
            document = yield* decodeConnectionCatalogDocument({
              ...document,
              githubRoutingPermissions,
            }).pipe(Effect.orDie);
          }),
      };
      const permissions = yield* makePullRequestRoutingPermissions(storage);
      expect(yield* permissions.get(entry)).toBe("off");
      yield* permissions.set(entry, "read");
      const restarted = yield* makePullRequestRoutingPermissions(storage);
      expect(yield* restarted.get(entry)).toBe("read");

      const changedEndpoint = {
        ...entry,
        profile: Option.some(
          new BearerConnectionProfile({
            ...BEARER_PROFILE,
            httpBaseUrl: "https://different.example.test",
          }),
        ),
      };
      expect(yield* restarted.get(changedEndpoint)).toBe("off");
      expect(
        yield* restarted.get({
          ...entry,
          profile: Option.some(
            new BearerConnectionProfile({
              ...BEARER_PROFILE,
              wsBaseUrl: "wss://different.example.test",
            }),
          ),
        }),
      ).toBe("off");
      yield* restarted.set(entry, "read-write");
      expect(yield* restarted.get(entry)).toBe("read-write");
      yield* restarted.forget(ENVIRONMENT_ID);
      expect(yield* restarted.get(entry)).toBe("off");
      const afterRemoval = yield* makePullRequestRoutingPermissions(storage);
      expect(yield* afterRemoval.get(entry)).toBe("off");

      yield* permissions.set(entry, "read");
      document = removeConnectionFromCatalog(document, ENVIRONMENT_ID);
      const afterCatalogRemoval = yield* makePullRequestRoutingPermissions(storage);
      expect(yield* afterCatalogRemoval.get(entry)).toBe("off");
    }),
  );

  it.effect("requires explicit trust for primary and SSH connections independently", () =>
    Effect.gen(function* () {
      const permissions = yield* makePullRequestRoutingPermissions({
        read: Effect.succeed([]),
        write: () => Effect.void,
      });
      const entries = [
        {
          target: new PrimaryConnectionTarget({
            environmentId: ENVIRONMENT_ID,
            label: "Local",
            httpBaseUrl: "http://localhost:3000",
            wsBaseUrl: "ws://localhost:3000",
          }),
          profile: Option.none(),
          enabled: true,
        },
        {
          enabled: true,
          target: new SshConnectionTarget({
            environmentId: ENVIRONMENT_ID,
            label: "SSH",
            connectionId: "ssh-1",
          }),
          profile: Option.some(
            new SshConnectionProfile({
              environmentId: ENVIRONMENT_ID,
              label: "SSH",
              connectionId: "ssh-1",
              target: { alias: "work", hostname: "work.example.test", username: "maria", port: 22 },
            }),
          ),
        },
      ];
      for (const entry of entries) {
        expect(yield* permissions.get(entry)).toBe("off");
        yield* permissions.set(entry, "read");
        expect(yield* permissions.get(entry)).toBe("read");
        yield* permissions.set(entry, "off");
        expect(yield* permissions.get(entry)).toBe("off");
      }
    }),
  );

  it.effect("does not enable GitHub routing when permission persistence fails", () =>
    Effect.gen(function* () {
      const entry = { target: BEARER_TARGET, profile: Option.some(BEARER_PROFILE), enabled: true };
      expect(yield* (yield* PullRequestRoutingPermissions).get(entry)).toBe("off");
      const permissions = yield* makePullRequestRoutingPermissions({
        read: Effect.succeed([]),
        write: () =>
          Effect.fail(
            new ConnectionTransientError({
              reason: "remote-unavailable",
              detail: "storage unavailable",
            }),
          ),
      });
      yield* permissions.set(entry, "read-write").pipe(Effect.flip);
      expect(yield* permissions.get(entry)).toBe("off");
    }),
  );

  it("replaces obsolete connection metadata when an environment is registered again", () => {
    const bearer = registerConnectionInCatalog(
      EMPTY_CONNECTION_CATALOG_DOCUMENT,
      BEARER_REGISTRATION,
    );
    const ssh = registerConnectionInCatalog(bearer, SSH_REGISTRATION);

    expect(ssh.targets).toEqual([SSH_TARGET]);
    expect(ssh.profiles).toEqual([SSH_PROFILE]);
    expect(ssh.credentials).toEqual([
      { connectionId: SSH_TARGET.connectionId, credential: SSH_CREDENTIAL },
    ]);
  });

  it("removes every catalog record owned by an explicit disconnect", () => {
    const registered = registerConnectionInCatalog(
      EMPTY_CONNECTION_CATALOG_DOCUMENT,
      BEARER_REGISTRATION,
    );

    expect(removeConnectionFromCatalog(registered, ENVIRONMENT_ID)).toEqual(
      EMPTY_CONNECTION_CATALOG_DOCUMENT,
    );
  });

  it("decodes a document written before the disabled list existed", () => {
    const decoded = decodeCatalogDocument({
      schemaVersion: 1,
      targets: [],
      profiles: [],
      credentials: [],
      remoteDpopTokens: [],
    });

    expect(decoded.disabledEnvironmentIds).toEqual([]);
  });

  it("drops Fab Connect routes from a document saved before it was removed", () => {
    const learnedId = `learned:${ENVIRONMENT_ID}:http://192.168.1.10:3773`;
    const relayOnlyId = EnvironmentId.make("environment-relay");
    const stored = registerConnectionInCatalog(
      registerConnectionInCatalog(EMPTY_CONNECTION_CATALOG_DOCUMENT, BEARER_REGISTRATION),
      SSH_REGISTRATION,
      [BEARER_TARGET, SSH_TARGET],
    );
    const decoded = decodeCatalogDocument({
      ...stored,
      targets: [
        { _tag: "RelayConnectionTarget", environmentId: relayOnlyId, label: "Relay only" },
        BEARER_TARGET,
        {
          _tag: "BearerConnectionTarget",
          environmentId: ENVIRONMENT_ID,
          label: "Remote",
          connectionId: learnedId,
        },
        { _tag: "RelayConnectionTarget", environmentId: ENVIRONMENT_ID, label: "Remote" },
        SSH_TARGET,
      ],
      profiles: [
        ...stored.profiles,
        {
          _tag: "BearerConnectionProfile",
          connectionId: learnedId,
          environmentId: ENVIRONMENT_ID,
          label: "Remote",
          httpBaseUrl: "http://192.168.1.10:3773/",
          wsBaseUrl: "ws://192.168.1.10:3773/",
          learned: true,
          authorization: "fab-connect",
        },
      ],
      remoteDpopTokens: [{ environmentId: ENVIRONMENT_ID, accessToken: "dpop-token" }],
    });

    expect(decoded.targets).toEqual([BEARER_TARGET, SSH_TARGET]);
    expect(decoded.profiles).toEqual([BEARER_PROFILE, SSH_PROFILE]);
    expect(decoded.credentials).toHaveLength(2);
    expect(decoded).not.toHaveProperty("remoteDpopTokens");
  });

  it("switches a saved environment off and back on without touching its records", () => {
    const registered = registerConnectionInCatalog(
      EMPTY_CONNECTION_CATALOG_DOCUMENT,
      new BearerConnectionRegistration({
        target: BEARER_TARGET,
        profile: BEARER_PROFILE,
        credential: BEARER_CREDENTIAL,
      }),
    );

    const disabled = setConnectionEnabledInCatalog(registered, ENVIRONMENT_ID, false);
    expect(disabled.disabledEnvironmentIds).toEqual([ENVIRONMENT_ID]);
    expect(disabled.targets).toEqual(registered.targets);
    expect(disabled.credentials).toEqual(registered.credentials);
    expect(
      setConnectionEnabledInCatalog(disabled, ENVIRONMENT_ID, false).disabledEnvironmentIds,
    ).toEqual([ENVIRONMENT_ID]);

    expect(
      setConnectionEnabledInCatalog(disabled, ENVIRONMENT_ID, true).disabledEnvironmentIds,
    ).toEqual([]);
    expect(
      registerConnectionInCatalog(
        disabled,
        new BearerConnectionRegistration({
          target: BEARER_TARGET,
          profile: BEARER_PROFILE,
          credential: BEARER_CREDENTIAL,
        }),
      ).disabledEnvironmentIds,
    ).toEqual([ENVIRONMENT_ID]);
    expect(removeConnectionFromCatalog(disabled, ENVIRONMENT_ID).disabledEnvironmentIds).toEqual(
      [],
    );
  });

  it("persists the normalized SSH profile and its paired token beside its target", () => {
    const document = registerConnectionInCatalog(
      EMPTY_CONNECTION_CATALOG_DOCUMENT,
      SSH_REGISTRATION,
    );

    expect(document.targets).toEqual([SSH_TARGET]);
    expect(document.profiles).toEqual([SSH_PROFILE]);
    expect(document.credentials).toEqual([
      { connectionId: SSH_TARGET.connectionId, credential: SSH_CREDENTIAL },
    ]);
    // Removing the route forgets its token too.
    expect(removeConnectionFromCatalog(document, ENVIRONMENT_ID).credentials).toEqual([]);
  });

  it("keeps every route of an environment and drops only a removed route's records", () => {
    const withBearer = registerConnectionInCatalog(
      EMPTY_CONNECTION_CATALOG_DOCUMENT,
      BEARER_REGISTRATION,
    );
    const withSsh = registerConnectionInCatalog(withBearer, SSH_REGISTRATION, [
      BEARER_TARGET,
      SSH_TARGET,
    ]);
    expect(catalogRoutes(withSsh, ENVIRONMENT_ID)).toEqual([BEARER_TARGET, SSH_TARGET]);
    expect(withSsh.credentials).toHaveLength(2);

    const sshOnly = setRoutesInCatalog(withSsh, ENVIRONMENT_ID, [SSH_TARGET]);
    expect(sshOnly.targets).toEqual([SSH_TARGET]);
    expect(sshOnly.profiles).toEqual([SSH_PROFILE]);
    expect(sshOnly.credentials).toEqual([
      { connectionId: SSH_TARGET.connectionId, credential: SSH_CREDENTIAL },
    ]);

    const bearerOnly = setRoutesInCatalog(withSsh, ENVIRONMENT_ID, [BEARER_TARGET]);
    expect(bearerOnly.profiles).toEqual([BEARER_PROFILE]);
    expect(bearerOnly.credentials).toHaveLength(1);
  });

  it("keeps an environment's position in the catalog when its routes change", () => {
    const other = new BearerConnectionTarget({
      environmentId: EnvironmentId.make("environment-2"),
      label: "Other",
      connectionId: "bearer-2",
    });
    const document = {
      ...EMPTY_CONNECTION_CATALOG_DOCUMENT,
      targets: [BEARER_TARGET, other],
    };
    expect(
      setRoutesInCatalog(document, ENVIRONMENT_ID, [SSH_TARGET, BEARER_TARGET]).targets,
    ).toEqual([SSH_TARGET, BEARER_TARGET, other]);
  });
});
