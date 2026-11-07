import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { FAB_PROJECT_FILE_NAME, type FabProjectFile } from "@fab/contracts";
import { FabProjectFileFromJson } from "@fab/shared/fabProjectFile";

const decodeFabProjectFileJson = Schema.decodeEffect(FabProjectFileFromJson);

export class FabProjectFileLoadError extends Schema.TaggedError<FabProjectFileLoadError>()(
  "FabProjectFileLoadError",
  {
    operation: Schema.Literals(["read", "decode"]),
    workspaceRoot: Schema.String,
    filePath: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to ${this.operation} ${FAB_PROJECT_FILE_NAME} at ${this.filePath}.`;
  }
}

export class FabProjectFileLoader extends Context.Service<
  FabProjectFileLoader,
  {
    /** Never fails; missing/unreadable/invalid files return none, with warnings for invalid files. */
    readonly load: (workspaceRoot: string) => Effect.Effect<Option.Option<FabProjectFile>>;
  }
>()("fab/project/FabProjectFileLoader") {}

const logFabProjectFileLoadError = (error: FabProjectFileLoadError) =>
  Effect.logWarning(error).pipe(
    Effect.annotateLogs({
      operation: error.operation,
      workspaceRoot: error.workspaceRoot,
      filePath: error.filePath,
      errorTag: error._tag,
    }),
  );

/** @public */
export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const load: FabProjectFileLoader["Service"]["load"] = Effect.fn("FabProjectFileLoader.load")(
    function* (workspaceRoot) {
      const filePath = path.join(workspaceRoot, FAB_PROJECT_FILE_NAME);
      const raw = yield* fileSystem.readFileString(filePath).pipe(
        Effect.asSome,
        Effect.catchTags({
          PlatformError: (error) =>
            error.reason._tag === "NotFound"
              ? Effect.succeed(Option.none<string>())
              : logFabProjectFileLoadError(
                  new FabProjectFileLoadError({
                    operation: "read",
                    workspaceRoot,
                    filePath,
                    cause: error,
                  }),
                ).pipe(Effect.as(Option.none<string>())),
        }),
      );
      if (Option.isNone(raw)) {
        return Option.none<FabProjectFile>();
      }
      return yield* decodeFabProjectFileJson(raw.value).pipe(
        Effect.asSome,
        Effect.catchTags({
          SchemaError: (error) =>
            logFabProjectFileLoadError(
              new FabProjectFileLoadError({
                operation: "decode",
                workspaceRoot,
                filePath,
                cause: error,
              }),
            ).pipe(Effect.as(Option.none<FabProjectFile>())),
        }),
      );
    },
  );

  return FabProjectFileLoader.of({ load });
});

export const layer = Layer.effect(FabProjectFileLoader, make);
