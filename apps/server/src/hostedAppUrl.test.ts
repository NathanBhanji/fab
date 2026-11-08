import { assert, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";

import { hostedAppUrlConfig } from "./hostedAppUrl.ts";

it.effect("rejects malformed or insecure hosted app URLs", () =>
  Effect.gen(function* () {
    for (const value of [
      "app.fab.invalid",
      "http://app.fab.invalid",
      "https://app.fab.invalid/nested",
      "https://app.fab.invalid?alias=true",
    ]) {
      const result = yield* hostedAppUrlConfig.pipe(
        Effect.provide(
          ConfigProvider.layer(ConfigProvider.fromEnv({ env: { FAB_HOSTED_APP_URL: value } })),
        ),
        Effect.result,
      );
      assert.isTrue(Result.isFailure(result), value);
    }
  }),
);
