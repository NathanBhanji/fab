import * as NodeModule from "node:module";
import * as Effect from "effect/Effect";

// A force-killed process never flushes on exit; persist the cache after startup.
export const flushCompileCache = Effect.try(() => {
  if (!Reflect.get(globalThis, Symbol.for("fab.preparedServerCache"))) {
    NodeModule.flushCompileCache();
  }
}).pipe(Effect.ignore);
